/*
  خزنة محلية مشفّرة لمذكّرة السكينة (docs/adr/0022).
  - البيانات لا تغادر الجهاز ولا تصل لخادم سند أصلاً، وتُشفَّر بـ AES-256-GCM (نفس خوارزمية ADR-0004).
  - مفتاح البيانات (DEK) عشوائي، يُغلَّف بمفتاح مشتق من رمز المستخدم (PBKDF2-SHA256)،
    واختيارياً بمفتاح من البصمة/الوجه عبر WebAuthn PRF — فالبصمة تفكّ التشفير فعلاً، لا مجرد «بوابة» شكلية.
  - لا استرجاع عند نسيان الرمز: هذا ثمن ألا يملك أحد غيرك مفتاح مذكّرتك.
*/

import {
  VAULT_KEY as KEY,
  WrongPinError,
  b64,
  createVaultFile,
  importDek,
  open,
  randomBytes as random,
  readVaultData,
  rewrapPin,
  seal,
  unb64,
  unwrapWithPin,
  writeVaultData,
  type VaultFile,
} from "@sanad/shared/lib/vault";

// الصيغة والتشفير في @sanad/shared/lib/vault (مشتركة مع تطبيق Flutter)؛ هنا التخزين والبصمة عبر WebAuthn.
export { WrongPinError };

const enc = new TextEncoder();

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

/** مفتاح مفتوح في الذاكرة فقط — لا يُكتب في أي تخزين. */
export interface UnlockedVault {
  dek: CryptoKey;
  /** المادة الخام للمفتاح لإعادة تغليفه عند تفعيل البصمة أو تغيير الرمز — تُمسح عند القفل */
  raw: Uint8Array;
}

export const vault = {
  exists: () => load() !== null,
  hasBiometric: () => Boolean(load()?.bio),

  async create<T>(pin: string, initial: T): Promise<UnlockedVault> {
    const { file, raw } = await createVaultFile(pin, initial);
    save(file);
    return { dek: await importDek(raw), raw };
  },

  async unlockWithPin(pin: string): Promise<UnlockedVault> {
    const file = load();
    if (!file) throw new Error("لا توجد مذكّرة على هذا الجهاز");
    const raw = await unwrapWithPin(file, pin);
    return { dek: await importDek(raw), raw };
  },

  async read<T>(u: UnlockedVault, fallback: T): Promise<T> {
    const file = load();
    if (!file) return fallback;
    return readVaultData<T>(file, u.raw);
  },

  async write<T>(u: UnlockedVault, data: T) {
    const file = load();
    if (!file) throw new Error("لا توجد مذكّرة");
    save(await writeVaultData(file, u.raw, data));
  },

  async changePin(u: UnlockedVault, newPin: string) {
    const file = load();
    if (!file) return;
    save(await rewrapPin(file, u.raw, newPin));
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
