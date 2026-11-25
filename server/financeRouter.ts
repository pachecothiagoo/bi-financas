import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  financeAccounts,
  financeRecurring,
  financeSettings,
  financeTransactions,
  type FinanceSettingsJson,
} from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kindSchema = z.enum(["income", "expense"]);
const statusSchema = z.enum(["realized", "forecast"]);
const amountSchema = z.number().finite().positive().max(999_999_999);

const transactionInput = z.object({
  externalId: z.string().trim().min(1).max(191).nullable().optional(),
  date: daySchema,
  description: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(64),
  type: kindSchema,
  value: amountSchema,
  status: statusSchema,
  ignore: z.boolean().default(false),
});

const recurringInput = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(64),
  type: kindSchema,
  value: amountSchema,
  day: z.number().int().min(1).max(31),
});

const legacyTransaction = transactionInput.extend({
  id: z.union([z.string().max(64), z.number().int()]),
});
const legacyRecurring = recurringInput.extend({
  id: z.union([z.string().max(64), z.number().int()]),
});
const legacyStatement = z.object({
  date: daySchema,
  balance: z.number().finite(),
  source: z.string().max(24).default("PDF"),
});
const legacyBackup = z.object({
  transactions: z.array(legacyTransaction).max(5000),
  recurring: z.array(legacyRecurring).max(1000),
  goalPercent: z.number().int().min(0).max(100).optional(),
  openingBalance: z.number().finite().optional(),
  monthOpeningBalances: z.record(z.string(), z.number().finite()).optional(),
  statementBalances: z.record(z.string(), legacyStatement).optional(),
});

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "O banco de dados ainda não está disponível." });
  }
  return db;
}

async function ensureSettings(accountId: number) {
  const db = await requireDb();
  const [existing] = await db
    .select()
    .from(financeSettings)
    .where(eq(financeSettings.accountId, accountId))
    .limit(1);
  if (existing) return existing;
  await db.insert(financeSettings).values({
    accountId,
    goalPercent: 30,
    monthOpeningBalances: {},
    statementBalances: {},
  });
  const [created] = await db
    .select()
    .from(financeSettings)
    .where(eq(financeSettings.accountId, accountId))
    .limit(1);
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível iniciar as configurações financeiras." });
  return created;
}

function toTransaction(row: typeof financeTransactions.$inferSelect) {
  return {
    id: row.id,
    externalId: row.externalId,
    date: row.transactionDate,
    description: row.description,
    category: row.category,
    type: row.kind,
    value: Number(row.amount),
    status: row.status,
    ignore: row.ignoreInFlow,
  };
}

function toRecurring(row: typeof financeRecurring.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    type: row.kind,
    value: Number(row.amount),
    day: row.day,
  };
}

function normalizeSettings(settings: typeof financeSettings.$inferSelect) {
  const monthOpeningBalances = settings.monthOpeningBalances && typeof settings.monthOpeningBalances === "object"
    ? settings.monthOpeningBalances
    : {};
  const statementBalances = settings.statementBalances && typeof settings.statementBalances === "object"
    ? settings.statementBalances
    : {};
  return {
    goalPercent: Math.max(0, Math.min(100, Number(settings.goalPercent) || 0)),
    monthOpeningBalances,
    statementBalances,
  };
}

async function currentSettings(accountId: number) {
  return normalizeSettings(await ensureSettings(accountId));
}

async function addStatementBalance(
  accountId: number,
  statementBalance: number,
  statementDate: string
) {
  const db = await requireDb();
  const settings = await ensureSettings(accountId);
  const month = statementDate.slice(0, 7);
  const current = (settings.statementBalances ?? {}) as FinanceSettingsJson["statementBalances"];
  const previous = current[month];
  if (!previous?.date || statementDate >= previous.date) {
    current[month] = {
      date: statementDate,
      balance: Number(statementBalance.toFixed(2)),
      source: "PDF",
    };
    await db
      .update(financeSettings)
      .set({ statementBalances: current })
      .where(eq(financeSettings.accountId, accountId));
  }
}

async function insertImportedTransactions(
  accountId: number,
  inputs: Array<z.infer<typeof transactionInput>>
) {
  if (!inputs.length) return { imported: 0, duplicates: 0 };
  const db = await requireDb();
  const ids = [...new Set(inputs.map(item => item.externalId).filter((id): id is string => Boolean(id)))];
  const existingIds = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    if (!chunk.length) continue;
    const rows = await db
      .select({ externalId: financeTransactions.externalId })
      .from(financeTransactions)
      .where(and(eq(financeTransactions.accountId, accountId), inArray(financeTransactions.externalId, chunk)));
    rows.forEach(row => row.externalId && existingIds.add(row.externalId));
  }
  const seen = new Set(existingIds);
  const fresh = inputs.filter(item => {
    if (!item.externalId) return true;
    if (seen.has(item.externalId)) return false;
    seen.add(item.externalId);
    return true;
  });
  if (fresh.length) {
    await db
      .insert(financeTransactions)
      .values(fresh.map(item => ({
        accountId,
        externalId: item.externalId ?? null,
        transactionDate: item.date,
        description: item.description,
        category: item.category,
        kind: item.type,
        amount: item.value.toFixed(2),
        status: item.status,
        ignoreInFlow: item.ignore,
      })))
      .onDuplicateKeyUpdate({ set: { externalId: sql`VALUES(externalId)` } });
  }
  return { imported: fresh.length, duplicates: inputs.length - fresh.length };
}

export const financeRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [transactions, recurring, settings] = await Promise.all([
      db.select().from(financeTransactions)
        .where(eq(financeTransactions.accountId, ctx.user.id))
        .orderBy(desc(financeTransactions.transactionDate), desc(financeTransactions.id)),
      db.select().from(financeRecurring)
        .where(eq(financeRecurring.accountId, ctx.user.id))
        .orderBy(desc(financeRecurring.id)),
      currentSettings(ctx.user.id),
    ]);
    return {
      transactions: transactions.map(toTransaction),
      recurring: recurring.map(toRecurring),
      settings,
    };
  }),

  createTransaction: protectedProcedure
    .input(transactionInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.insert(financeTransactions).values({
        accountId: ctx.user.id,
        externalId: input.externalId ?? null,
        transactionDate: input.date,
        description: input.description,
        category: input.category,
        kind: input.type,
        amount: input.value.toFixed(2),
        status: input.status,
        ignoreInFlow: input.ignore,
      });
      return { success: true };
    }),

  updateTransaction: protectedProcedure
    .input(transactionInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db.select({ id: financeTransactions.id })
        .from(financeTransactions)
        .where(and(eq(financeTransactions.id, input.id), eq(financeTransactions.accountId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada." });
      await db.update(financeTransactions).set({
        externalId: input.externalId ?? null,
        transactionDate: input.date,
        description: input.description,
        category: input.category,
        kind: input.type,
        amount: input.value.toFixed(2),
        status: input.status,
        ignoreInFlow: input.ignore,
      }).where(and(eq(financeTransactions.id, input.id), eq(financeTransactions.accountId, ctx.user.id)));
      return { success: true };
    }),

  deleteTransaction: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(financeTransactions)
        .where(and(eq(financeTransactions.id, input.id), eq(financeTransactions.accountId, ctx.user.id)));
      return { success: true };
    }),

  createRecurring: protectedProcedure
    .input(recurringInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.insert(financeRecurring).values({
        accountId: ctx.user.id,
        title: input.title,
        category: input.category,
        kind: input.type,
        amount: input.value.toFixed(2),
        day: input.day,
      });
      return { success: true };
    }),

  updateRecurring: protectedProcedure
    .input(recurringInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [existing] = await db.select({ id: financeRecurring.id })
        .from(financeRecurring)
        .where(and(eq(financeRecurring.id, input.id), eq(financeRecurring.accountId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Recorrência não encontrada." });
      await db.update(financeRecurring).set({
        title: input.title,
        category: input.category,
        kind: input.type,
        amount: input.value.toFixed(2),
        day: input.day,
      }).where(and(eq(financeRecurring.id, input.id), eq(financeRecurring.accountId, ctx.user.id)));
      return { success: true };
    }),

  deleteRecurring: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(financeRecurring)
        .where(and(eq(financeRecurring.id, input.id), eq(financeRecurring.accountId, ctx.user.id)));
      return { success: true };
    }),

  updateGoal: protectedProcedure
    .input(z.object({ goalPercent: z.number().int().min(0).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureSettings(ctx.user.id);
      await db.update(financeSettings)
        .set({ goalPercent: input.goalPercent })
        .where(eq(financeSettings.accountId, ctx.user.id));
      return { success: true };
    }),

  updateOpeningBalance: protectedProcedure
    .input(z.object({ month: monthSchema, value: z.number().finite().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const settings = await ensureSettings(ctx.user.id);
      const balances = { ...(settings.monthOpeningBalances ?? {}) };
      if (input.value === null) delete balances[input.month];
      else balances[input.month] = Number(input.value.toFixed(2));
      await db.update(financeSettings)
        .set({ monthOpeningBalances: balances })
        .where(eq(financeSettings.accountId, ctx.user.id));
      return { success: true };
    }),

  importTransactions: protectedProcedure
    .input(z.object({
      transactions: z.array(transactionInput).max(1500),
      statementBalance: z.number().finite().nullable().optional(),
      statementDate: daySchema.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await insertImportedTransactions(ctx.user.id, input.transactions);
      let statementSaved = false;
      if (input.statementBalance !== undefined && input.statementBalance !== null && input.statementDate) {
        await addStatementBalance(ctx.user.id, input.statementBalance, input.statementDate);
        statementSaved = true;
      }
      return { ...result, statementSaved };
    }),

  importLegacyBackup: protectedProcedure
    .input(z.object({ backup: legacyBackup, importSettings: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { backup } = input;
      const legacyTransactions = backup.transactions.map(item => ({
        externalId: item.externalId || `legacy-${String(item.id)}`,
        date: item.date,
        description: item.description,
        category: item.category,
        type: item.type,
        value: item.value,
        status: item.status,
        ignore: item.ignore,
      }));
      const imported = await insertImportedTransactions(ctx.user.id, legacyTransactions);

      const existingRecurring = await db.select({ legacyId: financeRecurring.legacyId })
        .from(financeRecurring)
        .where(eq(financeRecurring.accountId, ctx.user.id));
      const recurringIds = new Set(existingRecurring.map(row => row.legacyId).filter(Boolean));
      const freshRecurring = backup.recurring.filter(item => !recurringIds.has(String(item.id)));
      if (freshRecurring.length) {
        await db.insert(financeRecurring).values(freshRecurring.map(item => ({
          accountId: ctx.user.id,
          legacyId: String(item.id).slice(0, 64),
          title: item.title,
          category: item.category,
          kind: item.type,
          amount: item.value.toFixed(2),
          day: item.day,
        }))).onDuplicateKeyUpdate({ set: { legacyId: sql`VALUES(legacyId)` } });
      }

      if (input.importSettings) {
        const settings = await ensureSettings(ctx.user.id);
        const monthOpeningBalances = { ...(backup.monthOpeningBalances ?? {}) };
        const firstDate = backup.transactions.map(item => item.date).filter(Boolean).sort()[0];
        if (backup.openingBalance && firstDate && !Object.keys(monthOpeningBalances).length) {
          monthOpeningBalances[firstDate.slice(0, 7)] = Number(backup.openingBalance.toFixed(2));
        }
        const statementBalances = { ...(backup.statementBalances ?? {}) };
        await db.update(financeSettings).set({
          goalPercent: backup.goalPercent ?? settings.goalPercent,
          monthOpeningBalances,
          statementBalances,
        }).where(eq(financeSettings.accountId, ctx.user.id));
      }

      return {
        transactionsImported: imported.imported,
        transactionsSkipped: imported.duplicates,
        recurringImported: freshRecurring.length,
        recurringSkipped: backup.recurring.length - freshRecurring.length,
        settingsImported: input.importSettings,
      };
    }),
});
