// 서버를 부르는 유일한 곳(R12, NFR-15 ①). 주소는 NEXT_PUBLIC_API_URL(C-10), 토큰은 Authorization: Bearer(C-1).
// 오류는 늘 { code, message }(C-3, D-35)라 ApiError 하나로 바꿔 던진다. 화면은 code로 안내 문구를 고른다.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;
  constructor(status: number, code: string, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** 서버에 닿지 못했다(연결 끊김, L-42). */
export const NETWORK = "network";

export type Fetch = typeof fetch;

export interface HttpClient {
  request<T>(method: string, path: string, options?: { token?: string | null; body?: unknown }): Promise<T>;
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
}

export function createHttpClient(options: { baseUrl?: string; fetchFn?: Fetch } = {}): HttpClient {
  const baseUrl = options.baseUrl ?? apiBaseUrl();
  const fetchFn = options.fetchFn ?? ((...args: Parameters<Fetch>) => fetch(...args));
  return {
    async request<T>(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}): Promise<T> {
      const headers: Record<string, string> = {};
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}${path}`, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          cache: "no-store",
        });
      } catch {
        throw new ApiError(0, NETWORK, "서버에 연결하지 못했어요");
      }
      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const code = typeof body.code === "string" ? body.code : `http_${res.status}`;
        const message = typeof body.message === "string" ? body.message : res.statusText;
        throw new ApiError(res.status, code, message, body);
      }
      return data as T;
    },
  };
}
