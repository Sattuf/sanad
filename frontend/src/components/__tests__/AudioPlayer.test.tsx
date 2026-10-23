import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AudioPlayer } from "../AudioPlayer";

describe("AudioPlayer", () => {
  it("shows the catalogue duration, then the file's real duration once the element knows it", () => {
    const { container } = render(<AudioPlayer src="/api/v1/media/tracks/t1" title="الفاتحة" durationSeconds={90} />);
    expect(screen.getByText("0:00 / 1:30")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "موضع التشغيل" })).toHaveAttribute("max", "90");

    // الملف الفعلي أطول من مدة الكتالوج: العنصر يعلنها بـ durationchange دون أي timeupdate
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: 125 });
    act(() => {
      audio.dispatchEvent(new Event("durationchange"));
    });

    expect(screen.getByText("0:00 / 2:05")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "موضع التشغيل" })).toHaveAttribute("max", "125");
  });

  it("keeps the catalogue duration while the element's duration is unknown (NaN) or a live stream (Infinity)", () => {
    const { container } = render(<AudioPlayer src="/api/v1/media/tracks/t1" title="الفاتحة" durationSeconds={90} />);
    const audio = container.querySelector("audio")!;
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      Object.defineProperty(audio, "duration", { configurable: true, value });
      act(() => {
        audio.dispatchEvent(new Event("durationchange"));
      });
      expect(screen.getByText("0:00 / 1:30")).toBeInTheDocument();
    }
  });
});
