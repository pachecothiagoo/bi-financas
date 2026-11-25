import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AccountIdentity } from "../auth";
import { accountFromRequest, sessionTokenFromRequest } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AccountIdentity | null;
  sessionToken: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AccountIdentity | null = null;
  try {
    user = await accountFromRequest(opts.req);
  } catch (error) {
    // Public routes remain reachable while private routes fail closed.
    console.error("[Auth] Session lookup failed:", error);
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionToken: sessionTokenFromRequest(opts.req),
  };
}
