import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, 'utf-8');
  return generated;
}

const SECRET = getSessionSecret();

export interface SessionPayload {
  uid: string;
  email: string;
  exp: number;
}

export function signSessionToken(uid: string, email: string): string {
  const payload: SessionPayload = {
    uid,
    email,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!decoded.uid || !decoded.email || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function extractAuthUser(req: Request): SessionPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return verifySessionToken(token);
}

export async function verifyGoogleCredential(params: {
  idToken?: string;
  accessToken?: string;
}): Promise<{ email: string; name: string; avatarUrl?: string } | null> {
  try {
    if (params.idToken) {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(params.idToken)}`
      );
      if (!res.ok) return null;
      const info = (await res.json()) as {
        email?: string;
        email_verified?: string | boolean;
        name?: string;
        given_name?: string;
        picture?: string;
        aud?: string;
      };
      if (!info.email || (info.email_verified !== 'true' && info.email_verified !== true)) {
        return null;
      }
      if (process.env.GOOGLE_CLIENT_ID && info.aud !== process.env.GOOGLE_CLIENT_ID) {
        return null;
      }
      const displayName = (info.name || info.given_name || '').trim();
      return {
        email: info.email,
        name: displayName && !displayName.includes('@') ? displayName : 'Google User',
        avatarUrl: info.picture,
      };
    }

    if (params.accessToken) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      });
      if (!res.ok) return null;
      const info = (await res.json()) as {
        email?: string;
        email_verified?: boolean;
        name?: string;
        given_name?: string;
        picture?: string;
      };
      if (!info.email || !info.email_verified) return null;
      const displayName = (info.name || info.given_name || '').trim();
      return {
        email: info.email,
        name: displayName && !displayName.includes('@') ? displayName : 'Google User',
        avatarUrl: info.picture,
      };
    }
    return null;
  } catch {
    return null;
  }
}
