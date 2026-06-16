import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

// Authenticated endpoints: bucket by token so each user gets their own quota.
function tokenKey(req: Request): string {
  const token = req.headers.authorization?.replace("Bearer ", "")
    || req.cookies?.refresh_token
    || req.cookies?.access_token
    || "";
  return token.substring(0, 20) || "anonymous";
}

// Pre-auth endpoints (login/refresh): bucket by client IP. Using tokenKey here
// collapsed every unauthenticated attempt into a single "anonymous" bucket,
// which (a) let one attacker lock out all logins and (b) gave no per-attacker
// brute-force limit. `ipKeyGenerator` handles IPv6 normalisation safely.
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip || "");
}

// Login: bucket by IP + submitted email so a shared NAT can't lock out everyone,
// while still capping per-account guessing.
function loginKey(req: Request): string {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
  return ipKey(req) + "|" + email;
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: loginKey,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: ipKey,
  message: { error: "Too many refresh attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  keyGenerator: tokenKey,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const profileRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: tokenKey,
  message: { error: "Too many profile update attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminMutationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50,
  keyGenerator: tokenKey,
  message: { error: "Too many admin operations, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

export function apiRateLimitPassthrough(req: Request, res: Response, next: NextFunction): void {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  apiRateLimit(req, res, next);
}

export function loginRateLimitPassthrough(req: Request, res: Response, next: NextFunction): void {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  loginRateLimit(req, res, next);
}

export function refreshRateLimitPassthrough(req: Request, res: Response, next: NextFunction): void {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  refreshRateLimit(req, res, next);
}

export function profileRateLimitPassthrough(req: Request, res: Response, next: NextFunction): void {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  profileRateLimit(req, res, next);
}
