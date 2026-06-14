"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { setTokens, clearTokens, loadTokens, getAccessToken, get } from "@/lib/api";

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

  const fetchUser = useCallback(async () => {
    try {
      const data = await get<{ user: User }>("/api/auth/me");
      setUserState(data.user);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tokens = loadTokens();
    if (tokens.access) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

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

    const me = await get<{ user: User }>("/api/auth/me");
    setUserState(me.user);
  };

  const logout = async () => {
    try {
      const token = getAccessToken();
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          credentials: "include",
        });
      }
    } catch {
      // ignore
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
