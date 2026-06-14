import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

function tokenKey(req: Request): string {
  const token = req.headers.authorization?.replace("Bearer ", "")
    || req.cookies?.refresh_token
    || req.cookies?.access_token
    || "";
  return token.substring(0, 20) || "anonymous";
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: tokenKey,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: tokenKey,
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
