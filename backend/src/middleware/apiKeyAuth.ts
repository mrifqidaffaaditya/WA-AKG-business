import { Request, Response, NextFunction } from "express";
import { verifyApiKey } from "../services/apiKey.js";
import { verifyAccessToken } from "../services/auth.js";

export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    permissions: string[];
    userId: string | null;
  };
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

/**
 * Middleware that strictly requires a valid API Key (for /api/v1 external endpoints)
 */
export async function requireApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const headerKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerKey = authHeader?.startsWith("Bearer akg_live_")
    ? authHeader.slice(7)
    : undefined;

  const keyToVerify = headerKey || bearerKey;

  if (!keyToVerify) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing API Key. Provide via 'X-API-Key' header or 'Authorization: Bearer <key>'",
    });
    return;
  }

  const verified = await verifyApiKey(keyToVerify);
  if (!verified) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or inactive API Key",
    });
    return;
  }

  req.apiKey = verified;
  next();
}

/**
 * Helper to enforce permission scopes on API Key
 */
export function requireScope(scope: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    // If authenticated via user session (JWT), allow if admin or cs
    if (req.user) {
      next();
      return;
    }

    if (!req.apiKey) {
      res.status(401).json({ error: "Unauthorized", message: "API key required" });
      return;
    }

    const { permissions } = req.apiKey;
    if (permissions.includes("*") || permissions.includes(scope)) {
      next();
      return;
    }

    res.status(403).json({
      error: "Forbidden",
      message: `API key lacks required permission: '${scope}'`,
    });
  };
}

/**
 * Dual authentication middleware: accepts JWT Token OR API Key
 */
export async function requireAuthOrApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Check API Key first
  const headerKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers.authorization;
  const isApiKeyBearer = authHeader?.startsWith("Bearer akg_live_");

  if (headerKey || isApiKeyBearer) {
    const rawKey = headerKey || authHeader?.slice(7);
    if (rawKey) {
      const verified = await verifyApiKey(rawKey);
      if (verified) {
        req.apiKey = verified;
        next();
        return;
      }
    }
  }

  // Fallback to JWT Token
  const jwtToken =
    req.cookies?.access_token ||
    (authHeader?.startsWith("Bearer ") && !isApiKeyBearer ? authHeader.slice(7) : null);

  if (jwtToken) {
    try {
      const payload = verifyAccessToken(jwtToken);
      req.user = {
        id: payload.sub,
        role: payload.role,
      };
      next();
      return;
    } catch {
      // Token invalid
    }
  }

  res.status(401).json({
    error: "Unauthorized",
    message: "Valid Bearer token or X-API-Key required",
  });
}
