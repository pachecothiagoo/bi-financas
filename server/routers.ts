import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { financeAccounts } from "../drizzle/schema";
import { createAccountSession, destroyAccountSession, hashPassword, normalizeEmail, verifyPassword } from "./auth";
import { getDb } from "./db";
import { publicProcedure, router } from "./_core/trpc";
import { financeRouter } from "./financeRouter";
import { systemRouter } from "./_core/systemRouter";

const credentials = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(320),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(128),
});

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    register: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O banco de dados ainda não está disponível." });
      const email = normalizeEmail(input.email);
      const [existing] = await db.select({ id: financeAccounts.id })
        .from(financeAccounts)
        .where(eq(financeAccounts.email, email))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail. Entre na conta existente." });
      }
      const passwordHash = await hashPassword(input.password);
      try {
        const [account] = await db.insert(financeAccounts)
          .values({ email, passwordHash })
          .$returningId();
        await createAccountSession(account.id, ctx.req, ctx.res);
        return { id: account.id, email, role: "user" as const };
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail. Entre na conta existente." });
        }
        throw error;
      }
    }),
    login: publicProcedure.input(credentials).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O banco de dados ainda não está disponível." });
      const email = normalizeEmail(input.email);
      const [account] = await db.select().from(financeAccounts)
        .where(eq(financeAccounts.email, email))
        .limit(1);
      const valid = account
        ? await verifyPassword(input.password, account.passwordHash)
        : (await verifyPassword(input.password, "invalid-hash"), false);
      if (!account || !valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }
      await db.update(financeAccounts)
        .set({ lastSignedIn: new Date() })
        .where(eq(financeAccounts.id, account.id));
      await createAccountSession(account.id, ctx.req, ctx.res);
      return { id: account.id, email: account.email, role: "user" as const };
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await destroyAccountSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
  finance: financeRouter,
});

export type AppRouter = typeof appRouter;
