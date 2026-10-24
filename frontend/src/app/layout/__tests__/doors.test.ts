import { describe, expect, it } from "vitest";
import { doorOf } from "../doors";

describe("الأبواب", () => {
  it("كل صفحة تنتمي لبابها، والروابط القديمة كما هي", () => {
    expect(doorOf("/today")).toBe("today");
    expect(doorOf("/journal")).toBe("today");
    expect(doorOf("/programs")).toBe("ruqyah");
    expect(doorOf("/programs/daily-ruqyah-30")).toBe("ruqyah");
    expect(doorOf("/ruqyah")).toBe("ruqyah");
    expect(doorOf("/ruqyah/sleep")).toBe("ruqyah");
    expect(doorOf("/ruqyah/guide/treatment")).toBe("ruqyah");
    expect(doorOf("/self-ruqyah")).toBe("ruqyah");
    expect(doorOf("/directory")).toBe("directory");
    expect(doorOf("/providers/p1")).toBe("directory");
    expect(doorOf("/book/p1")).toBe("directory");
    expect(doorOf("/bookings/b1")).toBe("directory");
    expect(doorOf("/awareness/quiz")).toBe("awareness");
  });

  it("أدلة «توعية وتحذير» من باب الوعي رغم مسارها تحت /ruqyah", () => {
    expect(doorOf("/ruqyah/guide/kuhhan")).toBe("awareness");
    expect(doorOf("/ruqyah/guide/sihr")).toBe("awareness");
  });

  it("الصفحات العامة خارج الأبواب", () => {
    expect(doorOf("/")).toBeNull();
    expect(doorOf("/account")).toBeNull();
    expect(doorOf("/bookingsx")).toBeNull();
  });
});
