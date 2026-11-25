import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, FileUp, LoaderCircle, UploadCloud, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { money, parseCSV, parseOFX, parsePDFText, pdfPageLines, readPDFBalance, readPDFStatementDate, type TransactionDraft, type VoiceDraft } from "./finance-utils";

export type MovementRecord = TransactionDraft & { id: number };
export type RecurringRecord = {
  id: number;
  title: string;
  category: string;
  type: "income" | "expense";
  value: number;
  day: number;
};
export type LegacyBackup = {
  transactions: Array<{
    id: string | number;
    externalId?: string | null;
    date: string;
    description: string;
    category: string;
    type: "income" | "expense";
    value: number;
    status: "realized" | "forecast";
    ignore: boolean;
  }>;
  recurring: Array<{
    id: string | number;
    title: string;
    category: string;
    type: "income" | "expense";
    value: number;
    day: number;
  }>;
  goalPercent?: number;
  openingBalance?: number;
  monthOpeningBalances?: Record<string, number>;
  statementBalances?: Record<string, { date: string; balance: number; source: string }>;
};

type MovementDialogProps = {
  open: boolean;
  initial: MovementRecord | null;
  prefill?: VoiceDraft | null;
  onClose: () => void;
  onSave: (value: TransactionDraft & { id?: number }) => Promise<void>;
};
export function MovementDialog({ open, initial, prefill, onClose, onSave }: MovementDialogProps) {
  const [form, setForm] = useState<TransactionDraft & { id?: number }>({
    externalId: null,
    date: "",
    description: "",
    category: "Alimentação",
    type: "expense",
    value: 0,
    status: "realized",
    ignore: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(initial ? { ...initial } : prefill ? { ...prefill, externalId: null } : {
      externalId: null,
      date: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
      description: "",
      category: "Alimentação",
      type: "expense",
      value: 0,
      status: "realized",
      ignore: false,
    });
  }, [open, initial, prefill]);
  if (!open) return null;
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSave({ ...form, description: form.description.trim(), value: Number(form.value) });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="movement-dialog-title">
      <div className="dialog-head"><div><span className="dialog-kicker">LANÇAMENTO FINANCEIRO</span><h2 id="movement-dialog-title">{initial ? "Editar movimentação" : "Novo lançamento"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <form onSubmit={submit} className="dialog-form">
        <label className="form-field form-wide"><span>Descrição</span><input autoFocus maxLength={90} required value={form.description} onChange={event => update("description", event.target.value)} placeholder="Ex.: Mercado, salário, aluguel" /></label>
        <label className="form-field"><span>Tipo</span><select value={form.type} onChange={event => update("type", event.target.value as "income" | "expense")}><option value="expense">Saída</option><option value="income">Entrada</option></select></label>
        <label className="form-field"><span>Valor (R$)</span><input type="number" min="0.01" step="0.01" required value={form.value || ""} onChange={event => update("value", Number(event.target.value))} placeholder="0,00" /></label>
        <label className="form-field"><span>Data</span><input type="date" required value={form.date} onChange={event => update("date", event.target.value)} /></label>
        <label className="form-field"><span>Status</span><select value={form.status} onChange={event => update("status", event.target.value as "realized" | "forecast")}><option value="realized">Realizado</option><option value="forecast">Previsto</option></select></label>
        <label className="form-field form-wide"><span>Categoria</span><select value={form.category} onChange={event => update("category", event.target.value)}>{["Alimentação", "Moradia", "Transporte", "Saúde", "Lazer", "Compras", "Salário", "Freelance", "Contas", "Educação", "Transferência", "Outros"].map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="check-row form-wide"><input type="checkbox" checked={form.ignore} onChange={event => update("ignore", event.target.checked)} /><span>Ignorar nos indicadores de fluxo (ex.: transferência entre contas próprias)</span></label>
        {error && <div className="inline-error form-wide"><AlertCircle size={15} />{error}</div>}
        <div className="dialog-actions form-wide"><button type="button" className="button" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{initial ? "Salvar alterações" : "Salvar lançamento"}</button></div>
      </form>
    </section>
  </div>;
}

type RecurringDialogProps = {
  open: boolean;
  initial: RecurringRecord | null;
  onClose: () => void;
  onSave: (value: Omit<RecurringRecord, "id"> & { id?: number }) => Promise<void>;
};
export function RecurringDialog({ open, initial, onClose, onSave }: RecurringDialogProps) {
  const [form, setForm] = useState<Omit<RecurringRecord, "id"> & { id?: number }>({ title: "", type: "expense", category: "Moradia", value: 0, day: 5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(initial ? { ...initial } : { title: "", type: "expense", category: "Moradia", value: 0, day: 5 });
  }, [open, initial]);
  if (!open) return null;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSave({ ...form, title: form.title.trim(), value: Number(form.value), day: Number(form.day) });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="recurring-dialog-title">
      <div className="dialog-head"><div><span className="dialog-kicker">PROJEÇÃO MENSAL</span><h2 id="recurring-dialog-title">{initial ? "Editar recorrência" : "Nova recorrência"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <form onSubmit={submit} className="dialog-form">
        <label className="form-field form-wide"><span>Descrição</span><input autoFocus maxLength={70} required value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Salário, aluguel" /></label>
        <label className="form-field"><span>Tipo</span><select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as "income" | "expense" }))}><option value="income">Entrada</option><option value="expense">Saída</option></select></label>
        <label className="form-field"><span>Valor mensal (R$)</span><input type="number" min="0.01" step="0.01" required value={form.value || ""} onChange={event => setForm(current => ({ ...current, value: Number(event.target.value) }))} placeholder="0,00" /></label>
        <label className="form-field"><span>Dia previsto</span><input type="number" min="1" max="31" required value={form.day} onChange={event => setForm(current => ({ ...current, day: Number(event.target.value) }))} /></label>
        <label className="form-field"><span>Categoria</span><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{["Alimentação", "Moradia", "Transporte", "Saúde", "Lazer", "Compras", "Salário", "Freelance", "Contas", "Educação", "Transferência", "Outros"].map(category => <option key={category}>{category}</option>)}</select></label>
        {error && <div className="inline-error form-wide"><AlertCircle size={15} />{error}</div>}
        <div className="dialog-actions form-wide"><button type="button" className="button" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{initial ? "Salvar alterações" : "Salvar recorrência"}</button></div>
      </form>
    </section>
  </div>;
}

export type ImportPreviewRow = TransactionDraft & { duplicate: boolean; selected: boolean };
export type StatementImport = { balance: number | null; date: string | null };
type ImportDialogProps = {
  open: boolean;
  existingTransactions: MovementRecord[];
  onClose: () => void;
  onConfirm: (transactions: TransactionDraft[], statement: StatementImport) => Promise<void>;
};
export function ImportDialog({ open, existingTransactions, onClose, onConfirm }: ImportDialogProps) {
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [statement, setStatement] = useState<StatementImport>({ balance: null, date: null });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedCount = useMemo(() => rows.filter(row => row.selected && !row.duplicate).length, [rows]);
  useEffect(() => {
    if (open) return;
    setRows([]);
    setStatement({ balance: null, date: null });
    setFileName("");
    setError("");
    setNotice("");
  }, [open]);
  if (!open) return null;

  const process = async (file: File) => {
    setFileName(file.name);
    setError("");
    setNotice("Lendo e analisando arquivo…");
    setRows([]);
    setStatement({ balance: null, date: null });
    if (file.size > 30 * 1024 * 1024) {
      setError("O arquivo deve ter até 30 MB.");
      setNotice("");
      return;
    }
    try {
      let parsed: TransactionDraft[] = [];
      let balance: number | null = null;
      let statementDate: string | null = null;
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv") || name.endsWith(".txt")) {
        parsed = parseCSV(await file.text());
      } else if (name.endsWith(".ofx")) {
        parsed = parseOFX(await file.text());
      } else if (name.endsWith(".pdf")) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        let text = "";
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          text += pdfPageLines(content.items as Array<{ str?: string; transform?: number[] }>).join("\n") + "\n";
        }
        balance = readPDFBalance(text);
        statementDate = readPDFStatementDate(text);
        parsed = parsePDFText(text);
      } else {
        throw new Error("Formato não suportado. Selecione PDF, OFX, CSV ou TXT.");
      }
      if (balance !== null && !statementDate && parsed.length) {
        statementDate = parsed.map(row => row.date).filter(Boolean).sort().at(-1) ?? null;
      }
      setStatement({ balance, date: statementDate });
      if (!parsed.length && balance === null) {
        setError("Não encontrei lançamentos extraíveis neste arquivo. Se for um PDF digitalizado como imagem, será necessário OCR. Confira o layout do extrato ou envie uma amostra sem dados pessoais para ajuste.");
        setNotice("");
        return;
      }
      const existing = new Set(existingTransactions.map(row => row.externalId).filter((value): value is string => Boolean(value)));
      const withinFile = new Set<string>();
      const preview = parsed.map(row => {
        const key = row.externalId ?? "";
        const duplicate = Boolean(key && (existing.has(key) || withinFile.has(key)));
        if (key) withinFile.add(key);
        return { ...row, duplicate, selected: !duplicate };
      });
      setRows(preview);
      const fresh = preview.filter(row => !row.duplicate).length;
      setNotice(`${parsed.length} registro(s) identificado(s): ${fresh} novo(s), ${parsed.length - fresh} duplicado(s).`);
    } catch (failure) {
      setError(failure instanceof Error ? `Não foi possível ler o arquivo: ${failure.message}` : "Não foi possível ler o arquivo.");
      setNotice("");
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const selected = rows.filter(row => row.selected && !row.duplicate).map(({ duplicate: _duplicate, selected: _selected, ...row }) => row);
      await onConfirm(selected, statement);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível importar os lançamentos.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog-card import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
      <div className="dialog-head"><div><span className="dialog-kicker">EXTRATOS BANCÁRIOS</span><h2 id="import-dialog-title">Importar extrato</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <label className="upload-zone">
        <input type="file" accept=".pdf,.ofx,.csv,.txt" onChange={event => event.target.files?.[0] && void process(event.target.files[0])} />
        <UploadCloud size={27} /><strong>{fileName || "Selecione ou arraste seu arquivo"}</strong><span>PDF, OFX ou CSV · arquivos de até 30 MB</span>
      </label>
      <p className="dialog-help">CSV: data, descrição e valor (ou crédito/débito). OFX: transações bancárias. PDF: extração de texto e leitor específico do layout do Inter. Revise os itens antes de importar; uma chave externa evita duplicatas.</p>
      {notice && <div className="notice-box"><FileUp size={15} />{notice}{statement.balance !== null && <strong>Saldo final detectado: {money(statement.balance)}{statement.date ? ` · até ${statement.date}` : ""}</strong>}</div>}
      {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
      {rows.length > 0 && <div className="import-table-wrap"><table className="data-table import-table"><thead><tr><th>Incluir</th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>{rows.slice(0, 80).map((row, index) => <tr key={`${row.externalId}-${index}`}><td><input type="checkbox" checked={row.selected} disabled={row.duplicate} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} /></td><td>{row.date}</td><td>{row.description}{row.duplicate && <small className="table-tag">Duplicado</small>}{row.ignore && <small className="table-tag">Ignorar no fluxo</small>}</td><td>{row.category}</td><td className={row.type === "income" ? "positive" : "negative"}>{row.type === "income" ? "+" : "−"}{money(row.value)}</td></tr>)}</tbody></table>{rows.length > 80 && <p className="dialog-help">Prévia limitada a 80 registros; todos os itens válidos selecionados serão importados.</p>}</div>}
      <div className="dialog-actions"><button className="button" type="button" onClick={onClose}>Cancelar</button><button className="button button-primary" type="button" disabled={busy || (selectedCount === 0 && statement.balance === null)} onClick={() => void confirm()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Importar {selectedCount > 0 ? `${selectedCount} lançamento(s)` : "saldo"}</button></div>
    </section>
  </div>;
}

type LegacyDialogProps = {
  open: boolean;
  onClose: () => void;
  onImport: (backup: LegacyBackup, importSettings: boolean) => Promise<void>;
};
export function LegacyImportDialog({ open, onClose, onImport }: LegacyDialogProps) {
  const [backup, setBackup] = useState<LegacyBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [importSettings, setImportSettings] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) return;
    setBackup(null);
    setFileName("");
    setImportSettings(true);
    setError("");
  }, [open]);
  if (!open) return null;

  const readBackup = async (file: File) => {
    setError("");
    setBackup(null);
    setFileName(file.name);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo de backup deve ter até 20 MB.");
      const parsed = JSON.parse(await file.text()) as { data?: unknown; state?: unknown } & Partial<LegacyBackup>;
      const candidate = (parsed.data ?? parsed.state ?? parsed) as Partial<LegacyBackup>;
      if (!Array.isArray(candidate.transactions) || !Array.isArray(candidate.recurring)) {
        throw new Error("Esse arquivo não contém um backup do Finanças BI.");
      }
      setBackup({
        transactions: candidate.transactions as LegacyBackup["transactions"],
        recurring: candidate.recurring as LegacyBackup["recurring"],
        goalPercent: candidate.goalPercent,
        openingBalance: candidate.openingBalance,
        monthOpeningBalances: candidate.monthOpeningBalances ?? {},
        statementBalances: candidate.statementBalances ?? {},
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível abrir o backup.");
    }
  };
  const confirm = async () => {
    if (!backup) return;
    setBusy(true);
    setError("");
    try {
      await onImport(backup, importSettings);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível importar o backup.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="legacy-dialog-title">
      <div className="dialog-head"><div><span className="dialog-kicker">MIGRAÇÃO DE DADOS</span><h2 id="legacy-dialog-title">Trazer dados do HTML antigo</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <p className="dialog-help">No HTML antigo, clique em <strong>Baixar backup local</strong> e selecione o arquivo JSON aqui. A importação adiciona os lançamentos e recorrências; não apaga os registros já existentes. Dados de outros navegadores precisam ser exportados naquele dispositivo também.</p>
      <label className="upload-zone compact-upload"><input type="file" accept=".json,application/json" onChange={event => event.target.files?.[0] && void readBackup(event.target.files[0])} /><UploadCloud size={24} /><strong>{fileName || "Selecionar backup .json"}</strong><span>O arquivo é lido no navegador e enviado apenas para sua conta autenticada.</span></label>
      {backup && <div className="migration-summary"><strong>Prévia: {backup.transactions.length} movimentação(ões) e {backup.recurring.length} recorrência(s)</strong><span>Duplicatas encontradas no destino serão ignoradas.</span><label className="check-row"><input type="checkbox" checked={importSettings} onChange={event => setImportSettings(event.target.checked)} /><span>Importar também a meta de poupança e os saldos iniciais/finais (substitui essas configurações da conta)</span></label></div>}
      {error && <div className="inline-error"><AlertCircle size={15} />{error}</div>}
      <div className="dialog-actions"><button className="button" type="button" onClick={onClose}>Cancelar</button><button className="button button-primary" type="button" disabled={!backup || busy} onClick={() => void confirm()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Confirmar importação</button></div>
    </section>
  </div>;
}
