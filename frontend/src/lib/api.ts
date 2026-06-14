const BASE = "";
const FETCH_TIMEOUT_MS = 8000;

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function setTokens(access: string) {
  accessToken = access;
  if (typeof window !== "undefined") {
    localStorage.setItem("access_token", access);
  }
}

export function loadTokens(): { access: string | null } {
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("access_token");
  }
  return { access: accessToken };
}

export function clearTokens() {
  accessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== "undefined") {
    accessToken = localStorage.getItem("access_token");
  }
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetchWithTimeout(BASE + "/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        clearTokens();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return null;
      }

      const data = await res.json();
      const newAccess = data.accessToken || data.access_token;
      accessToken = newAccess;
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", newAccess);
      }
      return newAccess;
    } catch {
      clearTokens();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return null;
    }
  })();

  refreshPromise.finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function makeRequest(
  url: string,
  options: RequestInit = {},
  raw: boolean = false
): Promise<unknown> {
  const token = getAccessToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  let res = await fetchWithTimeout(BASE + url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = "Bearer " + newToken;
      res = await fetchWithTimeout(BASE + url, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (raw) return res;

  if (!res.ok) {
    const error = new Error("Request failed: " + res.status + " " + res.statusText);
    ;(error as unknown as Record<string, unknown>).status = res.status;
    ;(error as unknown as Record<string, unknown>).response = res;
    throw error;
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function makeRequestWithTimeout(
  url: string,
  options: RequestInit = {},
  raw: boolean = false
): Promise<unknown> {
  try {
    return await makeRequest(url, options, raw);
  } catch (err: unknown) {
    if (isAbortError(err)) {
      const timeoutError = new Error("Request timed out");
      ;(timeoutError as unknown as Record<string, unknown>).status = 408;
      throw timeoutError;
    }
    throw err;
  }
}

export function api<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  return makeRequestWithTimeout(url, options) as Promise<T>;
}

export function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return makeRequestWithTimeout(url, options, true) as Promise<Response>;
}

export function get<T = unknown>(url: string): Promise<T> {
  return api<T>(url, { method: "GET" });
}

export function post<T = unknown>(
  url: string,
  body?: unknown
): Promise<T> {
  return api<T>(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function put<T = unknown>(
  url: string,
  body?: unknown
): Promise<T> {
  return api<T>(url, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function del<T = unknown>(url: string): Promise<T> {
  return api<T>(url, { method: "DELETE" });
}

export function getAuthenticatedMediaUrl(mediaUrl: string): string {
  if (!mediaUrl || !mediaUrl.startsWith("/uploads/")) return "";
  const token = getAccessToken();
  if (!token) return mediaUrl;
  return `${mediaUrl}?token=${encodeURIComponent(token)}`;
}
