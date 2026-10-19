/* eslint-disable react-refresh/only-export-components -- عُدّة اختبار، لا تُحمَّل في التطبيق ولا يلزمها Fast Refresh */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { API_BASE } from "../api/client";
import { useSession } from "../stores/session";

/*
  عُدّة اختبار الصفحات: خادم وهمي على مستوى fetch (فيمرّ كل طلب بعميل الـ API الحقيقي — الترويسات، ProblemDetails، التجديد)،
  وموجّه في الذاكرة، وذاكرة استعلامات بلا إعادة محاولة.
*/

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
}

/** ردّ المسار: قيمة JSON (200)، أو { status, body } صراحةً. */
export type Reply = unknown | { status: number; body?: unknown };
export type Route = Reply | ((req: FakeRequest) => Reply);

const isReply = (r: unknown): r is { status: number; body?: unknown } =>
  typeof r === "object" && r !== null && "status" in r && typeof (r as { status: unknown }).status === "number" && Object.keys(r).every((k) => k === "status" || k === "body");

/** يستبدل fetch بجدول مسارات «METHOD /path»؛ كل طلب يُسجَّل في calls. المسار غير المعرّف ⇐ 404. */
export function fakeServer(routes: Record<string, Route>) {
  const calls: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = init?.body;
    const req: FakeRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: typeof raw === "string" && raw ? JSON.parse(raw) : raw ?? null,
      headers: new Headers(init?.headers),
    };
    calls.push(req);
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) return json({ title: "غير موجود" }, 404);
    const reply = typeof route === "function" ? (route as (r: FakeRequest) => Reply)(req) : route;
    return isReply(reply) ? json(reply.body ?? null, reply.status) : json(reply, 200);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    /** الطلبات إلى «METHOD /path». */
    to: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

function json(body: unknown, status: number) {
  return new Response(status === 204 || body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

/** جلسة قائمة (رمز وصول في الذاكرة) كما بعد الدخول. */
export function signIn() {
  useSession.getState().setTokens("access-1", "refresh-1");
}

export function signOutLocally() {
  useSession.getState().clear();
}

/** يعرض الموقع الحالي ليتحقق الاختبار من التنقّل. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** يعرض صفحة على مسارها الحقيقي، مع مسارات إضافية تُعرض كنص لتأكيد الانتقال إليها. */
export function renderRoute(url: string, pattern: string, page: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={pattern} element={page} />
          <Route path="*" element={<p>صفحة أخرى</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const apiUrl = (path: string) => `${API_BASE}${path}`;
