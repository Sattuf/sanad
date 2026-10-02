import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { actions, getState, resetStore } from "../state/store";

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

// كلمات لا تظهر في أي شاشة (SKILL.md «الكتابة» و«حدود لا تُكسر»)
const FORBIDDEN = /تشخيص|إصابة|أعراضك|مسحور|ممسوس|معيون|شفاء مضمون|فك السحر|نسبة نجاح|لا تقطع سلسلتك/;

beforeEach(() => {
  localStorage.clear();
  resetStore();
  window.location.hash = "";
});

describe("أول فتح", () => {
  it("يسأل عن المدة فقط، ثم يفتح ورد اليوم الأول", () => {
    render(<App />);
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
    fireEvent.click(screen.getByRole("button", { name: "لنبدأ" }));
    expect(screen.getByText("كم يوماً تريد أن تبدأ؟")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "٧ أيام" }));
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "بعد الفجر" }));
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(getState().enrollment?.reminder).toBe("after_fajr");
    expect(window.location.hash).toBe("#/reader");
  });
});

describe("طبقة الأمان", () => {
  it("زر الطوارئ ورابط الطبيب حاضران في كل شاشة رئيسية", () => {
    actions.updateSettings({ onboarded: true });
    actions.startPlan("morning-evening-7");
    render(<App />);
    for (const h of ["#/", "#/plans", "#/plans/morning-evening-7", "#/reader", "#/khatma", "#/support"]) {
      go(h);
      expect(screen.getByRole("link", { name: "طوارئ" })).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: "متى تحتاج مع الرقية إلى طبيب؟" }).length).toBeGreaterThan(0);
      expect(document.body.textContent).not.toMatch(FORBIDDEN);
    }
  });

  it("صفحة الخطة تذكر أن الرقية لا تعني ترك العلاج", () => {
    render(<App />);
    go("#/plans/ruqyah-full-21");
    expect(screen.getAllByText(/الرقية لا تعني ترك العلاج الموصوف لك/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/خطة تجريبية/)).toBeNull();
    expect(screen.getByText("تاريخ الإذن")).toBeInTheDocument();
  });
});

describe("الورد", () => {
  it("زر الإتمام يتفعّل بعد اكتمال العدّادات، ويتقدّم يوماً", () => {
    actions.updateSettings({ onboarded: true });
    actions.startPlan("before-sleep-7");
    render(<App />);
    go("#/reader");
    const finish = screen.getByRole("button", { name: "أتممت ورد اليوم" });
    expect(finish).toBeDisabled();
    for (const c of screen.getAllByRole("button", { name: /^عدّاد/ })) {
      while (!c.getAttribute("aria-label")!.endsWith("تمّ")) fireEvent.click(c);
    }
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    expect(getState().enrollment?.completedDays).toEqual([1]);
  });

  it("يمكن تسجيل الورد مكتملاً لمن قرأ من مصحفه", () => {
    actions.updateSettings({ onboarded: true });
    actions.startPlan("morning-evening-7");
    render(<App />);
    go("#/reader");
    fireEvent.click(screen.getByRole("button", { name: /سجّل الورد مكتملاً/ }));
    expect(getState().enrollment?.completedDays).toEqual([1]);
  });
});

describe("الختمة", () => {
  it("البتلة زر يستجيب للوحة المفاتيح", () => {
    render(<App />);
    go("#/khatma");
    const rosette = screen.getByRole("group", { name: /أجزاء الختمة/ });
    const juz1 = within(rosette).getByRole("button", { name: "الجزء ١: لم يُقرأ" });
    fireEvent.keyDown(juz1, { key: "Enter" });
    expect(getState().khatma.juz[0].doneAt).toBeDefined();
    expect(within(rosette).getByRole("button", { name: "الجزء ١: مقروء" })).toBeInTheDocument();
  });
});

describe("الدعم", () => {
  it("لا يفتح أي ميزة وزره معطّل حتى تُعتمد الجهة", () => {
    render(<App />);
    go("#/support");
    expect(screen.getByText("سند مجاني، وسيبقى مجانياً")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادعم سند" })).toBeDisabled();
  });
});
