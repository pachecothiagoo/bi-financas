export const CATEGORIES = [
  "Alimentação",
  "Moradia",
  "Transporte",
  "Saúde",
  "Lazer",
  "Compras",
  "Salário",
  "Freelance",
  "Contas",
  "Educação",
  "Transferência",
  "Outros",
] as const;

export type TransactionType = "income" | "expense";
export type TransactionStatus = "realized" | "forecast";
export type TransactionDraft = {
  externalId: string | null;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  value: number;
  status: TransactionStatus;
  ignore: boolean;
};
export type VoiceDraft = Omit<TransactionDraft, "externalId">;
export type StatementBalance = { date: string; balance: number; source: string };

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

export const isoDate = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export const monthKey = (date: string) => date.slice(0, 7);
export const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};
export const dateLabel = (value: string) => {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
};
export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const normalizeText = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function categorize(description: string) {
  const text = normalizeText(description);
  if (/salario|folha/.test(text)) return "Salário";
  if (/freela|pix recebido|honorario/.test(text)) return "Freelance";
  if (/aliment|mercado|super|restaurante|ifood|padaria|panificadora|lanchonete|mercearia|conveniencia/.test(text)) return "Alimentação";
  if (/moradia|aluguel|condominio|imovel/.test(text)) return "Moradia";
  if (/uber|99 tecnologia|combustivel|posto|metro|transporte|viacosteira/.test(text)) return "Transporte";
  if (/saude|farmacia|medico|academia|consulta/.test(text)) return "Saúde";
  if (/contas|internet|energia|agua|telefone|luz|pagamento de titulo|pagamento efetuado/.test(text)) return "Contas";
  if (/lazer|cinema|stream|spotify|netflix|show/.test(text)) return "Lazer";
  if (/compras|shopping|loja|vestuario|marketplace|apple/.test(text)) return "Compras";
  if (/educacao|escola|curso|faculdade|papelaria/.test(text)) return "Educação";
  if (/transferencia|ted|doc|entre contas|cred digital boleto|boleto credito/.test(text)) return "Transferência";
  return "Outros";
}

export function shouldIgnoreInFlow(description: string) {
  return /transfer[eê]ncia entre|transfer[eê]ncia pr[oó]pria|cobertura de boleto|cred digital boleto|boleto cr[eé]dito|resgate investimento/i.test(description);
}

export function normalizeDate(raw: string | undefined, fallback = isoDate()) {
  if (!raw) return fallback;
  const value = String(raw).trim();
  let match = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : isoDate(parsed);
}

export function externalId(date: string, description: string, value: number) {
  const safeDescription = normalizeText(description).replace(/[^a-z0-9]+/g, "").slice(0, 30);
  return `imp-${date}-${safeDescription}-${Number(value).toFixed(2)}`.slice(0, 191);
}

function parseLocaleAmount(raw: string) {
  let value = raw.trim().replace(/[R$\s]/gi, "").replace(/[()]/g, "");
  const negative = raw.includes("-") || (raw.includes("(") && raw.includes(")"));
  value = value.replace(/[^\d.,]/g, "");
  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function csvCells(line: string, separator: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCSV(text: string, today = isoDate()): TransactionDraft[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const separator = [",", ";", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const headers = csvCells(lines[0], separator).map(header => normalizeText(header));
  const find = (patterns: string[]) => headers.findIndex(header => patterns.some(pattern => header.includes(pattern)));
  const dateIndex = find(["data", "date"]);
  const descriptionIndex = find(["descricao", "historico", "memo", "title", "nome"]);
  const valueIndex = find(["valor", "amount", "montante"]);
  const creditIndex = find(["credito", "credit", "entrada"]);
  const debitIndex = find(["debito", "debit", "saida"]);
  const output: TransactionDraft[] = [];
  for (const line of lines.slice(1)) {
    const cells = csvCells(line, separator);
    const description = cells[descriptionIndex >= 0 ? descriptionIndex : 1] || "Lançamento importado";
    const date = normalizeDate(cells[dateIndex >= 0 ? dateIndex : 0], today);
    let amount = valueIndex >= 0 ? parseLocaleAmount(cells[valueIndex] || "0") : 0;
    if (valueIndex < 0) {
      const credit = creditIndex >= 0 ? parseLocaleAmount(cells[creditIndex] || "0") : 0;
      const debit = debitIndex >= 0 ? parseLocaleAmount(cells[debitIndex] || "0") : 0;
      amount = credit || -Math.abs(debit);
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    const value = Math.abs(amount);
    output.push({
      externalId: externalId(date, description, value),
      date,
      description,
      category: categorize(description),
      type: amount > 0 ? "income" : "expense",
      value,
      status: date <= today ? "realized" : "forecast",
      ignore: shouldIgnoreInFlow(description),
    });
  }
  return output;
}

export function parseOFX(text: string, today = isoDate()): TransactionDraft[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<LEDGERBAL|$)/gi) ?? [];
  const output: TransactionDraft[] = [];
  for (const block of blocks) {
    const get = (tag: string) => (block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i")) ?? [])[1]?.trim() ?? "";
    const amount = parseLocaleAmount(get("TRNAMT").replace(",", "."));
    const date = normalizeDate(get("DTPOSTED").slice(0, 8), today);
    const description = get("NAME") || get("MEMO") || "Lançamento importado";
    if (!amount) continue;
    const value = Math.abs(amount);
    output.push({
      externalId: get("FITID") ? `ofx-${get("FITID")}`.slice(0, 191) : externalId(date, description, value),
      date,
      description,
      category: categorize(description),
      type: amount > 0 ? "income" : "expense",
      value,
      status: date <= today ? "realized" : "forecast",
      ignore: shouldIgnoreInFlow(description),
    });
  }
  return output;
}

export type PdfTextItem = { str?: string; transform?: number[] };
export function pdfPageLines(items: PdfTextItem[]) {
  const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
  for (const item of items) {
    const str = String(item.str || "").trim();
    if (!str) continue;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 3);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.str).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function readPDFBalance(text: string): number | null {
  const lines = text.split(/\n/);
  const index = lines.findIndex(line => /Saldo total/i.test(line));
  if (index < 0) return null;
  for (let i = index + 1; i < Math.min(lines.length, index + 4); i++) {
    const match = lines[i].match(/R\$\s*([\d.]+,\d{2})/i);
    if (match) return parseLocaleAmount(match[1]);
  }
  return null;
}

export function readPDFStatementDate(text: string): string | null {
  const match = text.match(/Período:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  return match ? `${match[6]}-${match[5]}-${match[4]}` : null;
}

export function parsePDFText(text: string, today = isoDate()): TransactionDraft[] {
  const output: TransactionDraft[] = [];
  const lines = text.split(/\n/);
  const nameRow = lines.findIndex(line => /CPF\/CNPJ:/i.test(line));
  const owner = nameRow > 0 ? normalizeText(lines[nameRow - 1].trim()) : "";
  const months: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };
  let currentDate: string | null = null;
  for (const line of lines) {
    const heading = line.match(/\b(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})\s+Saldo do dia/i);
    if (heading) {
      const month = normalizeText(heading[2]);
      if (months[month]) currentDate = `${heading[3]}-${months[month]}-${String(heading[1]).padStart(2, "0")}`;
      continue;
    }
    if (!currentDate || /saldo do dia/i.test(line)) continue;
    const moneyMatches = [...line.matchAll(/-?\s*R\$\s*-?\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/gi)];
    if (!moneyMatches.length) continue;
    const first = moneyMatches[0];
    const amount = parseLocaleAmount(first[0]);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const description = line.slice(0, first.index).replace(/^\s*[•\-–|]?\s*/, "").replace(/[“”]/g, '"').trim();
    if (!description || /saldo (anterior|final|do dia)/i.test(description)) continue;
    const normalizedDescription = normalizeText(description);
    const ownTransfer = Boolean(owner && /pix (enviado|recebido)/i.test(description) && normalizedDescription.includes(owner));
    const value = Math.abs(amount);
    output.push({
      externalId: externalId(currentDate, description, value),
      date: currentDate,
      description,
      category: categorize(description),
      type: amount < 0 ? "expense" : "income",
      value,
      status: currentDate <= today ? "realized" : "forecast",
      ignore: shouldIgnoreInFlow(description) || ownTransfer,
    });
  }
  return output;
}

export function parseVoiceTranscript(transcript: string, now = new Date()): VoiceDraft {
  const normalized = normalizeText(transcript);
  const today = isoDate(now);
  const explicitDate = transcript.match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/);
  let amountMatch = transcript.match(/r\$\s*(-?[\d.,]+)|(-?[\d.,]+)\s*(?:reais?|r\$)/i);
  if (!amountMatch) {
    const withoutDate = transcript.replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/g, "");
    amountMatch = withoutDate.match(/\b(-?\d+(?:[.,]\d{1,2})?)\b/);
  }
  const raw = amountMatch ? (amountMatch[1] || amountMatch[2] || amountMatch[0]).replace(/[^\d,.-]/g, "") : "";
  const value = raw ? parseLocaleAmount(raw) : 0;
  const hasValue = Boolean(amountMatch && Number.isFinite(value) && value > 0);
  const type: TransactionType = /\b(receita|entrada|recebi|recebimento|salario|ganhei|vendi|reembolso)\b/.test(normalized)
    ? "income"
    : "expense";
  let date = today;
  if (explicitDate) date = normalizeDate(explicitDate[0], today);
  else if (/\b(depois de amanha)\b/.test(normalized)) date = isoDate(new Date(now.getTime() + 2 * 86_400_000));
  else if (/\bamanha\b/.test(normalized)) date = isoDate(new Date(now.getTime() + 86_400_000));
  else if (/\bontem\b/.test(normalized)) date = isoDate(new Date(now.getTime() - 86_400_000));
  const status: TransactionStatus = /\b(previsto|prevista|planejado|planejada|agendado|agendada|futuro|futura)\b/.test(normalized) || date > today
    ? "forecast"
    : "realized";
  const description = transcript
    .replace(/\b\d{2}[/-]\d{2}[/-]\d{4}\b/g, " ")
    .replace(/r\$\s*-?[\d.,]+/gi, " ")
    .replace(/-?\d+(?:[.,]\d{1,2})?\s*(?:reais?|r\$)/gi, " ")
    .replace(/\b\d+(?:[.,]\d{1,2})?\b/g, " ")
    .replace(/\b(nova?|registrar|lancar|lancamento|despesa|gasto|saida|receita|entrada|recebi|recebimento|ganhei|vendi|paguei|pagar|comprei|de|em|no|na|por|hoje|ontem|amanha|previsto|prevista|planejado|planejada|agendado|agendada)\b/gi, " ")
    .replace(/[,:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const finalCategory = categorize(transcript);
  return {
    date,
    description: description || `${type === "income" ? "Receita" : "Despesa"} · ${finalCategory}`,
    category: finalCategory,
    type,
    value: hasValue ? Math.abs(value) : 0,
    status,
    ignore: shouldIgnoreInFlow(transcript),
  };
}
