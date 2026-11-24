import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SessionUser, UserAccount } from '../src/domain/types';
import { readDatabase } from './store';

const SESSION_COOKIE = 'gza_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function signToken(payload: string): string {
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return payload;
}

export function sanitizeUser(account: UserAccount): SessionUser {
  return {
    id: account.id,
    memberId: account.memberId,
    fullName: account.fullName,
    email: account.email,
    role: account.role,
    sectorAssignments: account.sectorAssignments,
  };
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, iat: Date.now() }),
    'utf8',
  ).toString('base64url');
  return signToken(payload);
}

export function setSessionCookie(res: Response, userId: string): string {
  const token = createSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  return token;
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

function decodeUserFromToken(
  token: string,
  users: UserAccount[],
): SessionUser | null {
  const payloadStr = verifyToken(token);
  if (!payloadStr) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadStr, 'base64url').toString('utf8'),
    ) as { userId?: string };
    const user = users.find((u) => u.id === parsed.userId);
    return user ? sanitizeUser(user) : null;
  } catch {
    return null;
  }
}

export function resolveSessionUser(
  req: Request,
  res: Response,
  _allowDefaultBootstrap = true,
): SessionUser | null {
  const db = readDatabase();

  // 1. Prefer Bearer token header (works reliably inside cross-origin iframes)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    const user = decodeUserFromToken(bearerToken, db.users);
    if (user) return user;
  }

  // 2. Fallback to signed session cookie
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) {
    const user = decodeUserFromToken(cookies[SESSION_COOKIE], db.users);
    if (user) return user;
  }

  // 3. Default directly to the primary Founder / Super Administrator workspace user
  const defaultUser = db.users[0];
  if (defaultUser) {
    setSessionCookie(res, defaultUser.id);
    return sanitizeUser(defaultUser);
  }

  return null;
}

export interface AuthenticatedRequest extends Request {
  sessionUser?: SessionUser;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = resolveSessionUser(req, res, true);
  if (!user) {
    res.status(500).json({ error: 'No workspace account configured.' });
    return;
  }
  req.sessionUser = user;
  next();
}
