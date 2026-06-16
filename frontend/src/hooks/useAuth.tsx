"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { setTokens, clearTokens, getAccessToken, get } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "cs";
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetUser = useCallback((u: User | null) => {
    if (mountedRef.current) setUserState(u);
  }, []);

  const safeSetLoading = useCallback((v: boolean) => {
    if (mountedRef.current) setLoading(v);
  }, []);

  const fetchUser = useCallback(async () => {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const data = await get<{ user: User }>("/api/auth/me");
        safeSetUser(data.user);
        safeSetLoading(false);
        return;
      } catch (err: any) {
        if (err && (err.status === 404 || err.status === 401 || err.status === 408)) {
          clearTokens();
          safeSetUser(null);
          safeSetLoading(false);
          return;
        }
        attempts++;
        if (attempts < 2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    clearTokens();
    safeSetUser(null);
    safeSetLoading(false);
  }, [safeSetUser, safeSetLoading]);

  useEffect(() => {
    // Always attempt to restore the session via the httpOnly cookie. The access
    // token is memory-only now, so on a fresh page load there is nothing in
    // localStorage to gate on — the /api/auth/me call (sent with credentials)
    // succeeds when the cookie is valid and 401s otherwise.
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const timer = setTimeout(() => {
      safeSetLoading(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [safeSetLoading]);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Login gagal" }));
      throw new Error(err.message || "Login gagal");
    }

    const data = await res.json();
    setTokens(data.accessToken || data.access_token);

    try {
      const me = await get<{ user: User }>("/api/auth/me");
      setUserState(me.user);
    } catch {
      throw new Error("Gagal memuat data pengguna");
    }
  };

  const logout = async () => {
    try {
      // Always hit the backend so it can revoke the refresh token AND clear the
      // httpOnly cookies. The access token is memory-only now, so on a fresh
      // page load there is nothing to send in the header — but the cookie (sent
      // via credentials: "include") authenticates the request. Skipping this
      // call left the cookies in place, so middleware kept redirecting the user
      // back in (the "stuck loading" loop).
      const token = getAccessToken();
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : undefined,
        credentials: "include",
      });
    } catch {
      // ignore — proceed to clear client state regardless
    }
    clearTokens();
    setUserState(null);
    router.push("/login");
  };

  const setUser = (u: User | null) => setUserState(u);

  const updateUser = (data: Partial<User>) => {
    setUserState((prev) => (prev ? { ...prev, ...data } : null));
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, setUser, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
