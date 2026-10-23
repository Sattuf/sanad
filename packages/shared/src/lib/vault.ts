/*
  صيغة خزنة «مذكّرتي» وتشفيرها — مشتركة بين الويب وتطبيق Flutter (docs/adr/0022، ADR-0023).
  - AES-256-GCM لكل ما يُحفظ، ومفتاح بيانات (DEK) عشوائي يُغلَّف بمفتاح مشتق من رمز المستخدم (PBKDF2-SHA256).
  - الصيغة ثابتة (v: 1): أي تغيير فيها يكسر فتح الخزنة في التطبيق الآخر — تحرسه متجهات test-vectors/vault.json.
  - يعتمد على WebCrypto فقط (globalThis.crypto) — المتصفح وNode؛ تطبيق Flutter له نظير Dart حرفي (lib/core/vault.dart).
*/

export const VAULT_KEY = "sanad.vault.v1";
export const PBKDF2_ITERATIONS = 310_000;

export interface Sealed {
  iv: string;
  ct: string;
}

export interface VaultFile {
  v: 1;
  salt: string;
  pin: Sealed;
  bio?: Sealed & { credentialId: string; prfSalt: string };
  data: Sealed;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** بايتات على ArrayBuffer عادي: WebCrypto (BufferSource) لا يقبل منذ TypeScript 5.9 بايتات على SharedArrayBuffer. */
export type Bytes = Uint8Array<ArrayBuffer>;

export const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
export const unb64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

/** IV من 12 بايت يُحفظ منفصلاً، والنص المشفّر يحمل وسم GCM (16 بايت) في آخره كما يخرجه WebCrypto. */
export async function seal(key: CryptoKey, plain: Bytes, iv: Bytes = randomBytes(12)): Promise<Sealed> {
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: b64(iv), ct: b64(ct) };
}

export async function open(key: CryptoKey, sealed: Sealed): Promise<Bytes> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return new Uint8Array(pt);
}

export async function pinKey(pin: string, salt: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function importDek(raw: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export class WrongPinError extends Error {
  constructor() {
    super("الرمز غير صحيح");
  }
}

/** ينشئ ملف خزنة جديداً: DEK عشوائي مغلّف بالرمز، والبيانات مشفّرة بالـ DEK. */
export async function createVaultFile<T>(pin: string, initial: T): Promise<{ file: VaultFile; raw: Bytes }> {
  const salt = randomBytes(16);
  const raw = randomBytes(32);
  const file: VaultFile = {
    v: 1,
    salt: b64(salt),
    pin: await seal(await pinKey(pin, salt), raw),
    data: await seal(await importDek(raw), enc.encode(JSON.stringify(initial))),
  };
  return { file, raw };
}

/** يفكّ DEK بالرمز — يرمي WrongPinError إن لم يطابق. */
export async function unwrapWithPin(file: VaultFile, pin: string): Promise<Bytes> {
  try {
    return await open(await pinKey(pin, unb64(file.salt)), file.pin);
  } catch {
    throw new WrongPinError();
  }
}

export async function readVaultData<T>(file: VaultFile, raw: Bytes): Promise<T> {
  return JSON.parse(dec.decode(await open(await importDek(raw), file.data))) as T;
}

export async function writeVaultData<T>(file: VaultFile, raw: Bytes, data: T): Promise<VaultFile> {
  return { ...file, data: await seal(await importDek(raw), enc.encode(JSON.stringify(data))) };
}

export async function rewrapPin(file: VaultFile, raw: Bytes, newPin: string): Promise<VaultFile> {
  const salt = randomBytes(16);
  return { ...file, salt: b64(salt), pin: await seal(await pinKey(newPin, salt), raw) };
}
