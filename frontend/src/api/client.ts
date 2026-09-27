import { useEmergency } from "../stores/emergency";
import { useSession } from "../stores/session";
import type { AuthTokens, EmergencyReferral } from "./types";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:5080";
export const EMERGENCY_HEADER = "X-Sanad-Emergency-Referral";

/** خطأ موحّد من ProblemDetails الخلفي. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly errors: Record<string, string[]> | undefined;
  readonly policyCategory: string | undefined;

  constructor(status: number, title: string, code?: string, errors?: Record<string, string[]>, policyCategory?: string) {
    super(title);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.policyCategory = policyCategory;
  }

  /** أول رسالة حقل إن وُجدت، وإلا العنوان العام. */
  get friendly(): string {
    const first = this.errors ? Object.values(this.errors).flat()[0] : undefined;
    return first ?? this.message;
  }
}

export function mediaUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

type Body = object | FormData | undefined;

interface RequestOptions {
  body?: Body;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = useSession.getState();
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // رفض صريح للجلسة فقط يمسحها؛ حد المعدل (429) أو خطأ خادم مؤقت لا يُخرج المستخدم
        if (res.status === 400 || res.status === 401) clear();
        return false;
      }
      const tokens = (await res.json()) as AuthTokens;
      setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      queueMicrotask(() => (refreshing = null));
    }
  })();
  return refreshing;
}

/** يلتقط إشارة الخطر من أي استجابة (نجاح أو فشل) ويرفع شريط الطوارئ فوراً. */
function inspectEmergency(res: Response, payload: unknown) {
  const body = payload as { emergencyReferral?: EmergencyReferral | null } | null;
  if (res.headers.get(EMERGENCY_HEADER) === "1" || body?.emergencyReferral?.required) {
    useEmergency.getState().raise(body?.emergencyReferral ?? null);
  }
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { accessToken } = useSession.getState();
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body, signal: options.signal });
  } catch {
    throw new ApiError(0, "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.", "network");
  }

  if (res.status === 401 && !retried && options.auth !== false && useSession.getState().refreshToken) {
    if (await refreshTokens()) return request<T>(method, path, options, true);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  inspectEmergency(res, payload);

  if (!res.ok) {
    const p = (payload ?? {}) as { title?: string; code?: string; errors?: Record<string, string[]>; policyCategory?: string };
    const title = p.title ?? (res.status === 429 ? "طلبات كثيرة — حاول بعد قليل." : "حدث خطأ غير متوقع.");
    throw new ApiError(res.status, title, p.code, p.errors, p.policyCategory);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, o?: RequestOptions) => request<T>("GET", path, o),
  post: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("POST", path, { ...o, body }),
  put: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("PUT", path, { ...o, body }),
  patch: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("PATCH", path, { ...o, body }),
  del: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("DELETE", path, { ...o, body }),
};

/** مفتاح تكرار آمن لكل محاولة إرسال نموذج (يبقى ثابتاً عند إعادة المحاولة من نفس النموذج). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** جلب ملف محمي كرابط Blob مؤقت (لتصدير البيانات مثلاً). */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
