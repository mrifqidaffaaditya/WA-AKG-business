import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.js";

export interface AuthRequest extends Request {
  user?: { sub: string; role: string };
}

const ROLE_LEVEL: Record<string, number> = {
  super_admin: 3,
  admin: 2,
  cs: 1,
};

export function getRoleLevel(role: string): number {
  return ROLE_LEVEL[role] ?? 0;
}

export function canModifyRole(
  actorRole: string,
  targetRole: string
): boolean {
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

export function canModifyUser(
  actorRole: string,
  actorId: string,
  targetRole: string,
  targetId: string
): boolean {
  if (actorId === targetId) return false;
  return getRoleLevel(actorRole) > getRoleLevel(targetRole);
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = { sub: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = { sub: payload.sub, role: payload.role };
  } catch {
    // optional auth — token invalid, continue without user
  }
  next();
}
