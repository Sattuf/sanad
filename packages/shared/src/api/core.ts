import type { AuthTokens } from "./types";

/*
  نواة عميل الـ API المشتركة (ADR-0014): ProblemDetails ← ApiError، وتجديد الرمز مرة واحدة عند 401.
  لا تعرف أين تُخزَّن الجلسة — يحقنها كل تطبيق.
*/

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

/** مكان الجلسة: ذاكرة + sessionStorage في الويب، ذاكرة + Keychain/Keystore في الجوال. */
export interface SessionPort {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clear(): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  session: SessionPort;
  fetch?: typeof fetch;
}

export type Body = object | FormData | undefined;

export interface RequestOptions {
  body?: Body;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const { session } = options;
  // يُقرأ عند كل طلب لا عند الإنشاء، حتى تعمل بدائل fetch في الاختبارات
  const doFetch: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, init);
  let refreshing: Promise<boolean> | null = null;

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = session.getRefreshToken();
    if (!refreshToken) return false;
    refreshing ??= (async () => {
      try {
        const res = await doFetch(`${baseUrl}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          // رفض صريح للجلسة فقط يمسحها؛ حد المعدل (429) أو خطأ خادم مؤقت لا يُخرج المستخدم
          if (res.status === 400 || res.status === 401) session.clear();
          return false;
        }
        const tokens = (await res.json()) as AuthTokens;
        session.setTokens(tokens.accessToken, tokens.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        queueMicrotask(() => (refreshing = null));
      }
    })();
    return refreshing;
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
    const accessToken = session.getAccessToken();
    const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
    let body: BodyInit | undefined;
    if (typeof FormData !== "undefined" && opts.body instanceof FormData) body = opts.body;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (accessToken && opts.auth !== false) headers.Authorization = `Bearer ${accessToken}`;

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method, headers, body, signal: opts.signal });
    } catch {
      throw new ApiError(0, "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.", "network");
    }

    if (res.status === 401 && !retried && opts.auth !== false && session.getRefreshToken()) {
      if (await refreshTokens()) return request<T>(method, path, opts, true);
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

    if (!res.ok) {
      const p = (payload ?? {}) as { title?: string; code?: string; errors?: Record<string, string[]>; policyCategory?: string };
      const title = p.title ?? (res.status === 429 ? "طلبات كثيرة — حاول بعد قليل." : "حدث خطأ غير متوقع.");
      throw new ApiError(res.status, title, p.code, p.errors, p.policyCategory);
    }
    return payload as T;
  }

  return {
    baseUrl,
    request,
    mediaUrl: (path: string) => (path.startsWith("http") ? path : `${baseUrl}${path}`),
    api: {
      get: <T>(path: string, o?: RequestOptions) => request<T>("GET", path, o),
      post: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("POST", path, { ...o, body }),
      put: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("PUT", path, { ...o, body }),
      patch: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("PATCH", path, { ...o, body }),
      del: <T>(path: string, body?: Body, o?: RequestOptions) => request<T>("DELETE", path, { ...o, body }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
