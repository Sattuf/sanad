import { describe, expect, it } from "vitest";
import vectors from "../../../test-vectors/vault.json";
import { WrongPinError, b64, importDek, readVaultData, seal, unb64, unwrapWithPin, type VaultFile } from "../vault";

// المتجهات نفسها يشغّلها تطبيق Flutter (mobile_flutter/test/vault_test.dart) — خزنة الويب تُفتح في Flutter والعكس
describe("خزنة المذكّرة: التوافق مع Flutter", () => {
  it.each(["web", "flutter"] as const)("تُفتح خزنة %s بالرمز وتعيد البيانات نفسها", async (who) => {
    const file = vectors[who] as VaultFile;
    const raw = await unwrapWithPin(file, vectors.pin);
    expect(await readVaultData(file, raw)).toEqual(vectors.data);
  });

  it.each(["web", "flutter"] as const)("خزنة %s ترفض الرمز الخاطئ", async (who) => {
    await expect(unwrapWithPin(vectors[who] as VaultFile, vectors.wrongPin)).rejects.toBeInstanceOf(WrongPinError);
  });

  it("AES-GCM حتمي بمفتاح وIV ثابتين: البايتات نفسها في الطرفين", async () => {
    const { key, iv, plain, ct } = vectors.aes;
    const sealed = await seal(await importDek(unb64(key)), new TextEncoder().encode(plain), unb64(iv));
    expect(sealed).toEqual({ iv, ct });
    expect(b64(unb64(ct))).toBe(ct);
  });
});
