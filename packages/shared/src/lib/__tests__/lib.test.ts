import { describe, expect, it } from "vitest";
import { findByDialPrefix, isE164, toE164 } from "../countryCodes";
import { compareVersions, isBelowMinimum } from "../version";

describe("toE164", () => {
  it("يحذف صفر البداية المحلي والمسافات", () => {
    expect(toE164("+966", "05 123 4567 8")).toBe("+966512345678");
    expect(isE164(toE164("+966", "0512345678"))).toBe(true);
  });

  it("يُبقي صفر البداية في إيطاليا", () => {
    expect(toE164("+39", "06 1234 5678")).toBe("+390612345678");
  });

  it("يختار أطول رمز مطابق", () => {
    expect(findByDialPrefix("+9665")?.iso2).toBe("SA");
    expect(isE164("+966")).toBe(false);
  });
});

describe("compareVersions", () => {
  it("يقارن عددياً لا نصياً", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(isBelowMinimum("0.1.0", "0.2.0")).toBe(true);
    expect(isBelowMinimum("1.0.0", "0.0.0")).toBe(false);
  });
});
