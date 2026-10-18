import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { STAFF_ROLES, useMe, useSignOut } from "../../api/hooks";
import type { AppNotification } from "@sanad/shared/api/types";
import { AdministrativeDisclaimerFooter } from "../../components/safety";
import { cx } from "../../lib/cx";
import { useRealtime } from "../../features/realtime/useRealtime";
import { useTheme } from "../theme";
import { applyDiscreet, quickExit, useDiscreet, useLabel } from "../../stores/discreet";

export function AppLayout() {
  useRealtime();
  useDiscreetMode();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        تخطَّ إلى المحتوى
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <AdministrativeDisclaimerFooter />
      <SakinaFab />
      <ScrollRestoration />
    </div>
  );
}

/** العنوان والأيقونة المحايدان + الخروج السريع بـ Esc مرتين. */
function useDiscreetMode() {
  const on = useDiscreet((s) => s.on);
  const last = useRef(0);
  useEffect(() => {
    applyDiscreet(on, "سند");
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const now = Date.now();
      if (now - last.current < 600) quickExit();
      last.current = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
}

/** زر السكينة — حاضر في كل الصفحات لمن يشعر بضيق مفاجئ. */
function SakinaFab() {
  return (
    <Link
      to="/sakina"
      className="fixed bottom-5 end-5 z-40 flex items-center gap-2 rounded-full border border-border bg-surface/95 py-2 pe-4 ps-2 text-sm font-semibold shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5"
      aria-label="وضع السكينة: ذكر وآيات هادئة عند الضيق"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-sky">
        <span className="absolute inset-0 animate-ping rounded-full bg-sky opacity-40 [animation-duration:3s]" aria-hidden />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sky-strong)" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 12c3-4 6-4 9 0s6 4 9 0" />
          <path d="M3 17c3-4 6-4 9 0s6 4 9 0" opacity=".5" />
        </svg>
      </span>
      سكينة
    </Link>
  );
}

function SiteHeader() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { pref, cycle } = useTheme();
  const [open, setOpen] = useState(false);
  const label = useLabel();
  const discreet = useDiscreet((s) => s.on);
  const isPractitioner = me?.roles.includes("Practitioner");
  const isStaff = me?.roles.some((r) => STAFF_ROLES.includes(r));

  const links: Array<{ to: string; label: string; show: boolean; primary?: boolean }> = [
    { to: "/today", label: "يومي", show: true, primary: true },
    { to: "/programs", label: "البرامج", show: true, primary: true },
    { to: "/ruqyah", label: label(t("nav.ruqyah"), "الأذكار"), show: true, primary: true },
    { to: "/self-ruqyah", label: label("ارقِ نفسك", "جلسة"), show: true, primary: true },
    { to: "/journal", label: "مذكّرتي", show: true, primary: true },
    { to: "/awareness", label: "ميزان الوعي", show: true, primary: true },
    { to: "/directory", label: t("nav.directory"), show: true },
    { to: "/library", label: label(t("nav.library"), "الاستماع"), show: Boolean(me) },
    { to: "/bookings", label: t("nav.bookings"), show: Boolean(me) },
    { to: "/recommendations", label: t("nav.recommendations"), show: Boolean(me) },
    { to: "/provider", label: t("nav.providerPortal"), show: Boolean(isPractitioner) },
    { to: "/staff", label: t("nav.staff"), show: Boolean(isStaff) },
  ];

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx("rounded-lg px-3 py-2 text-sm font-semibold transition-colors", isActive ? "bg-surface-2 text-primary" : "text-muted hover:text-text");

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-bold" aria-label="سند — الرئيسية">
          <img src="/favicon.svg" alt="" width={32} height={32} className="rounded-lg" />
          <span className="text-lg">{t("app.name")}</span>
        </Link>

        <nav className="ms-4 hidden items-center gap-1 lg:flex" aria-label="التنقل الرئيسي">
          {links.filter((l) => l.show && l.primary).map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          {discreet && (
            <button type="button" onClick={quickExit} className="rounded-lg px-2.5 py-2 text-muted hover:text-text" aria-label="خروج سريع" title="خروج سريع (Esc مرتين)">
              ✕
            </button>
          )}
          <button type="button" onClick={cycle} className="rounded-lg px-2.5 py-2 text-muted hover:text-text" aria-label={`المظهر: ${pref === "system" ? "حسب النظام" : pref === "dark" ? "ليلي" : "نهاري"}`}>
            {pref === "dark" ? "☾" : pref === "light" ? "☀" : "◐"}
          </button>
          {me ? (
            <>
              <NotificationsBell />
              <NavLink to="/account" className={navClass}>
                {me.displayName}
              </NavLink>
              <button
                type="button"
                className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-text md:block"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast">
              {t("nav.login")}
            </Link>
          )}
          <button type="button" className="rounded-lg px-2.5 py-2" aria-expanded={open} aria-label="القائمة" onClick={() => setOpen((v) => !v)}>
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="mx-auto grid max-w-6xl gap-x-4 border-t border-border px-4 py-2 sm:grid-cols-3" aria-label="القائمة الكاملة">
          {links.filter((l) => l.show).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cx(navClass({ isActive }), "block", l.primary && "lg:hidden")} onClick={() => setOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          <NavLink to="/privacy-mode" className={({ isActive }) => cx(navClass({ isActive }), "block")} onClick={() => setOpen(false)}>
            الخصوصية والتمويه
          </NavLink>
          {me && (
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-start text-sm text-muted"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              {t("nav.logout")}
            </button>
          )}
        </nav>
      )}
    </header>
  );
}

function NotificationsBell() {
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<AppNotification[]>("/api/v1/me/notifications"),
    refetchInterval: 60_000,
  });
  const unread = data?.filter((n) => !n.isRead).length ?? 0;
  return (
    <Link to="/notifications" className="relative rounded-lg px-2.5 py-2 text-muted hover:text-text" aria-label={`الإشعارات${unread ? ` (${unread} غير مقروءة)` : ""}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="num absolute -top-0.5 end-0.5 rounded-full bg-lamp px-1.5 text-[10px] font-bold text-bg">{unread}</span>}
    </Link>
  );
}

/** تخطيط صفحة المشاركة العامة: مستقل تماماً، أخف، بلا أي عنصر من الواجهة المصادَقة (10 §10.7). */
export function PublicShareLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
