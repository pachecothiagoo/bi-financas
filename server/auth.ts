import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { parse } from "cookie";
import { eq } from "drizzle-orm";
import { financeAccounts, financeSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keyLength: number
) => Promise<Buffer>;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;
const DUMMY_SALT = "financas-bi-account-lookup-salt";

export type AccountIdentity = { id: number; email: string; role: "user" | "admin" };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  return `${salt}:${digest.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hexDigest] = storedHash.split(":");
  if (!salt || !hexDigest || !/^[a-f0-9]{128}$/i.test(hexDigest)) {
    await scryptAsync(password, DUMMY_SALT, PASSWORD_KEY_LENGTH);
    return false;
  }
  const digest = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(hexDigest, "hex");
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}

export function sessionTokenFromRequest(req: Request) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  try {
    return parse(cookieHeader)[COOKIE_NAME] ?? null;
  } catch {
    return null;
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function accountFromRequest(req: Request): Promise<AccountIdentity | null> {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: financeAccounts.id, email: financeAccounts.email, expiresAt: financeSessions.expiresAt })
    .from(financeSessions)
    .innerJoin(financeAccounts, eq(financeSessions.accountId, financeAccounts.id))
    .where(eq(financeSessions.tokenHash, tokenHash(token)))
    .limit(1);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await db.delete(financeSessions).where(eq(financeSessions.tokenHash, tokenHash(token)));
    return null;
  }
  return { id: row.id, email: row.email, role: "user" };
}

export async function createAccountSession(
  accountId: number,
  req: Request,
  res: Response
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const prior = sessionTokenFromRequest(req);
  if (prior) {
    await db.delete(financeSessions).where(eq(financeSessions.tokenHash, tokenHash(prior)));
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(financeSessions).values({
    accountId,
    tokenHash: tokenHash(token),
    expiresAt,
  });
  res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_TTL_MS,
  });
  return expiresAt;
}

export async function destroyAccountSession(req: Request, res: Response) {
  const token = sessionTokenFromRequest(req);
  if (token) {
    const db = await getDb();
    if (db) {
      await db.delete(financeSessions).where(eq(financeSessions.tokenHash, tokenHash(token)));
    }
  }
  res.clearCookie(COOKIE_NAME, {
    ...getSessionCookieOptions(req),
    maxAge: 0,
  });
}

function csrfKey() {
  return process.env.MANUS_JWT_SECRET || process.env.DATABASE_URL || "financas-bi-local-csrf";
}

export function createCsrfToken() {
  const nonce = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", csrfKey()).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function isValidCsrfToken(value: string | undefined) {
  if (!value) return false;
  const [nonce, signature, extra] = value.split(".");
  if (!nonce || !signature || extra) return false;
  const expected = createHmac("sha256", csrfKey()).update(nonce).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
