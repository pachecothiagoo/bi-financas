import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Tabela original do starter Manus. Mantida intacta: este app usa as tabelas
 * finance* abaixo para as contas independentes por e-mail e senha.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const financeAccounts = mysqlTable("finance_accounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type FinanceAccount = typeof financeAccounts.$inferSelect;

export const financeSessions = mysqlTable(
  "finance_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ accountIdx: index("finance_sessions_account_idx").on(table.accountId) })
);

export const financeTransactions = mysqlTable(
  "finance_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("externalId", { length: 191 }),
    transactionDate: date("transactionDate", { mode: "string" }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    kind: mysqlEnum("kind", ["income", "expense"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["realized", "forecast"]).notNull(),
    ignoreInFlow: boolean("ignoreInFlow").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    accountDateIdx: index("finance_transactions_account_date_idx").on(
      table.accountId,
      table.transactionDate
    ),
    externalUnique: uniqueIndex("finance_transactions_external_uq").on(
      table.accountId,
      table.externalId
    ),
  })
);

export const financeRecurring = mysqlTable(
  "finance_recurring",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    legacyId: varchar("legacyId", { length: 64 }),
    title: varchar("title", { length: 120 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    kind: mysqlEnum("kind", ["income", "expense"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    day: int("day").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    accountIdx: index("finance_recurring_account_idx").on(table.accountId),
    legacyUnique: uniqueIndex("finance_recurring_legacy_uq").on(
      table.accountId,
      table.legacyId
    ),
  })
);

export type FinanceSettingsJson = {
  monthOpeningBalances: Record<string, number>;
  statementBalances: Record<string, { date: string; balance: number; source: string }>;
};

export const financeSettings = mysqlTable("finance_settings", {
  accountId: int("accountId")
    .primaryKey()
    .references(() => financeAccounts.id, { onDelete: "cascade" }),
  goalPercent: int("goalPercent").notNull().default(30),
  monthOpeningBalances: json("monthOpeningBalances")
    .$type<Record<string, number>>()
    .notNull(),
  statementBalances: json("statementBalances")
    .$type<FinanceSettingsJson["statementBalances"]>()
    .notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
