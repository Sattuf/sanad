/*
  خزنة محلية مشفّرة لمذكّرة السكينة (docs/adr/0016).
  - البيانات لا تغادر الجهاز ولا تصل لخادم سند أصلاً، وتُشفَّر بـ AES-256-GCM (نفس خوارزمية ADR-0004).
  - مفتاح البيانات (DEK) عشوائي، يُغلَّف بمفتاح مشتق من رمز المستخدم (PBKDF2-SHA256)،
    واختيارياً بمفتاح من البصمة/الوجه عبر WebAuthn PRF — فالبصمة تفكّ التشفير فعلاً، لا مجرد «بوابة» شكلية.
  - لا استرجاع عند نسيان الرمز: هذا ثمن ألا يملك أحد غيرك مفتاح مذكّرتك.
*/

const KEY = "sanad.vault.v1";
const PBKDF2_ITERATIONS = 310_000;

interface Sealed {
  iv: string;
  ct: string;
}

interface VaultFile {
  v: 1;
  salt: string;
  pin: Sealed;
  bio?: Sealed & { credentialId: string; prfSalt: string };
  data: Sealed;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function load(): VaultFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VaultFile) : null;
  } catch {
    return null;
  }
}

function save(file: VaultFile) {
  localStorage.setItem(KEY, JSON.stringify(file));
}

async function seal(key: CryptoKey, plain: Uint8Array): Promise<Sealed> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: b64(iv), ct: b64(ct) };
}

async function open(key: CryptoKey, sealed: Sealed): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return new Uint8Array(pt);
}

async function pinKey(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importDek(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** مفتاح مفتوح في الذاكرة فقط — لا يُكتب في أي تخزين. */
export interface UnlockedVault {
  dek: CryptoKey;
  /** المادة الخام للمفتاح لإعادة تغليفه عند تفعيل البصمة أو تغيير الرمز — تُمسح عند القفل */
  raw: Uint8Array;
}

export class WrongPinError extends Error {
  constructor() {
    super("الرمز غير صحيح");
  }
}

export const vault = {
  exists: () => load() !== null,
  hasBiometric: () => Boolean(load()?.bio),

  async create<T>(pin: string, initial: T): Promise<UnlockedVault> {
    const salt = random(16);
    const raw = random(32);
    const dek = await importDek(raw);
    const file: VaultFile = {
      v: 1,
      salt: b64(salt),
      pin: await seal(await pinKey(pin, salt), raw),
      data: await seal(dek, enc.encode(JSON.stringify(initial))),
    };
    save(file);
    return { dek, raw };
  },

  async unlockWithPin(pin: string): Promise<UnlockedVault> {
    const file = load();
    if (!file) throw new Error("لا توجد مذكّرة على هذا الجهاز");
    try {
      const raw = await open(await pinKey(pin, unb64(file.salt)), file.pin);
      return { dek: await importDek(raw), raw };
    } catch {
      throw new WrongPinError();
    }
  },

  async read<T>(u: UnlockedVault, fallback: T): Promise<T> {
    const file = load();
    if (!file) return fallback;
    return JSON.parse(dec.decode(await open(u.dek, file.data))) as T;
  },

  async write<T>(u: UnlockedVault, data: T) {
    const file = load();
    if (!file) throw new Error("لا توجد مذكّرة");
    file.data = await seal(u.dek, enc.encode(JSON.stringify(data)));
    save(file);
  },

  async changePin(u: UnlockedVault, newPin: string) {
    const file = load();
    if (!file) return;
    const salt = random(16);
    file.salt = b64(salt);
    file.pin = await seal(await pinKey(newPin, salt), u.raw);
    save(file);
  },

  destroy() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* تجاهل */
    }
  },

  /** هل يدعم المتصفح مصادقة الجهاز (بصمة/وجه/رمز الجهاز)؟ دعم PRF نفسه لا يُعرف إلا عند التسجيل. */
  async biometricAvailable(): Promise<boolean> {
    try {
      return Boolean(window.PublicKeyCredential) && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      return false;
    }
  },

  /** يسجّل مفتاح جهاز ويغلّف DEK بمخرَج PRF. يرمي إن لم يدعم الجهاز PRF. */
  async enableBiometric(u: UnlockedVault) {
    const file = load();
    if (!file) throw new Error("لا توجد مذكّرة");
    const prfSalt = random(32);
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "سند", id: location.hostname },
        user: { id: random(16), name: "journal", displayName: "مذكّرتي" },
        challenge: random(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60_000,
        extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("أُلغي التسجيل");
    const credentialId = new Uint8Array(cred.rawId);
    const kek = await prfKey(credentialId, prfSalt);
    file.bio = { ...(await seal(kek, u.raw)), credentialId: b64(credentialId), prfSalt: b64(prfSalt) };
    save(file);
  },

  async unlockWithBiometric(): Promise<UnlockedVault> {
    const file = load();
    if (!file?.bio) throw new Error("البصمة غير مفعّلة");
    const kek = await prfKey(unb64(file.bio.credentialId), unb64(file.bio.prfSalt));
    const raw = await open(kek, file.bio);
    return { dek: await importDek(raw), raw };
  },

  disableBiometric() {
    const file = load();
    if (!file) return;
    delete file.bio;
    save(file);
  },
};

async function prfKey(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<CryptoKey> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "required",
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const results = assertion?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
  const secret = results?.prf?.results?.first;
  if (!secret) throw new Error("هذا الجهاز أو المتصفح لا يدعم فتح المذكّرة بالبصمة بعد — استخدم الرمز.");
  const ikm = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("sanad-journal-kek") },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
