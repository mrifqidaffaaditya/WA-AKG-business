const BASE = "";

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshTokenValue = refresh;
  if (typeof window !== "undefined") {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  }
}

export function loadTokens(): { access: string | null; refresh: string | null } {
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("access_token");
    refreshTokenValue = localStorage.getItem("refresh_token");
  }
  return { access: accessToken, refresh: refreshTokenValue };
}

export function clearTokens() {
  accessToken = null;
  refreshTokenValue = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== "undefined") {
    accessToken = localStorage.getItem("access_token");
  }
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh =
    refreshTokenValue ||
    (typeof window !== "undefined"
      ? localStorage.getItem("refresh_token")
      : null);
  if (!refresh) return null;

  const res = await fetch(BASE + "/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  const data = await res.json();
  setTokens(data.accessToken || data.access_token, data.refreshToken || data.refresh_token || refresh);
  return data.accessToken || data.access_token;
}

async function makeRequest(
  url: string,
  options: RequestInit = {},
  raw: boolean = false
): Promise<unknown> {
  loadTokens();
  const token = accessToken;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  let res = await fetch(BASE + url, {
    ...options,
    headers,
  });

  if (res.status === 401 && refreshTokenValue) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = "Bearer " + newToken;
      res = await fetch(BASE + url, {
        ...options,
        headers,
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

export function api<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  return makeRequest(url, options) as Promise<T>;
}

export function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return makeRequest(url, options, true) as Promise<Response>;
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
