import rateLimit from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many refresh attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const profileRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many profile update attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminMutationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { error: "Too many admin operations, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});
