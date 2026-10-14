import { beforeEach, describe, expect, it } from "vitest";
import { vault, WrongPinError } from "../vault";

describe("الخزنة المشفّرة", () => {
  beforeEach(() => localStorage.clear());

  it("تحفظ مشفّراً وتفتح بالرمز الصحيح فقط", async () => {
    const u = await vault.create("2468", { checkIns: {}, sessions: [] });
    await vault.write(u, { secret: "ملاحظة خاصة جداً" });
    const raw = localStorage.getItem("sanad.vault.v1")!;
    expect(raw).not.toContain("ملاحظة");
    expect(raw).not.toContain("secret");

    const again = await vault.unlockWithPin("2468");
    expect(await vault.read(again, null)).toEqual({ secret: "ملاحظة خاصة جداً" });
    await expect(vault.unlockWithPin("0000")).rejects.toBeInstanceOf(WrongPinError);
  });

  it("تغيير الرمز يبقي البيانات ويُبطل القديم", async () => {
    const u = await vault.create("1111", { n: 1 });
    await vault.changePin(u, "2222");
    await expect(vault.unlockWithPin("1111")).rejects.toBeInstanceOf(WrongPinError);
    expect(await vault.read(await vault.unlockWithPin("2222"), null)).toEqual({ n: 1 });
  });
});
