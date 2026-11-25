import { useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowLeftRight, ArrowRight, BarChart3, Download, FileUp, Gauge,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Mic, Plus, Repeat2, RotateCcw,
  Search, ShieldCheck, Sparkles, Trash2, TrendingDown, TrendingUp, Upload, X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import {
  dateLabel, isoDate, money, monthKey, monthLabel, parseVoiceTranscript,
  type TransactionDraft, type VoiceDraft,
} from "./finance-utils";
import {
  ImportDialog, LegacyImportDialog, MovementDialog, RecurringDialog,
  type LegacyBackup, type MovementRecord, type RecurringRecord, type StatementImport,
} from "./FinanceDialogs";

type AuthUser = NonNullable<RouterOutputs["auth"]["me"]>;
type FinanceState = RouterOutputs["finance"]["state"];
type Transaction = FinanceState["transactions"][number];
type Recurring = FinanceState["recurring"][number];
type ViewName = "dashboard" | "movements" | "recurring";

const chartColors = ["#818cf8", "#10b981", "#f59e0b", "#f43f5e", "#38bdf8", "#c084fc", "#fb923c", "#2dd4bf", "#e879f9", "#a3e635", "#94a3b8", "#60a5fa"];
const getCurrentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const addMonths = (month: string, delta: number) => {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const sum = (items: Array<{ value: number }>) => items.reduce((total, item) => total + Number(item.value), 0);

export default function FinanceDashboard({ user }: { user: AuthUser }) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const dataQuery = trpc.finance.state.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const logoutMutation = trpc.auth.logout.useMutation();
  const [view, setView] = useState<ViewName>("dashboard");
  const [period, setPeriod] = useState(getCurrentMonth);
  const [status, setStatus] = useState<"all" | "realized" | "forecast">("all");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementInitial, setMovementInitial] = useState<MovementRecord | null>(null);
  const [movementPrefill, setMovementPrefill] = useState<VoiceDraft | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringInitial, setRecurringInitial] = useState<RecurringRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [openingDraft, setOpeningDraft] = useState<string | null>(null);

  const state = dataQuery.data;
  const transactions = state?.transactions ?? [];
  const recurring = state?.recurring ?? [];
  const settings = state?.settings;

  const refresh = async () => {
    await utils.finance.state.invalidate();
  };

  const saveMovement = async (input: TransactionDraft & { id?: number }) => {
    const { id, ...payload } = input;
    if (id) await trpcUpdateMovement.mutateAsync({ ...payload, id });
    else await trpcCreateMovement.mutateAsync(payload);
    await refresh();
    toast.success(id ? "Movimentação atualizada." : "Lançamento adicionado e indicadores atualizados.");
    setMovementPrefill(null);
    if (!id) setView("movements");
  };
  const saveRecurring = async (input: Omit<RecurringRecord, "id"> & { id?: number }) => {
    const { id, ...payload } = input;
    if (id) await trpcUpdateRecurring.mutateAsync({ ...payload, id });
    else await trpcCreateRecurring.mutateAsync(payload);
    await refresh();
    toast.success(id ? "Recorrência atualizada." : "Recorrência salva; projeção trimestral recalculada.");
  };

  const trpcCreateMovement = trpc.finance.createTransaction.useMutation();
  const trpcUpdateMovement = trpc.finance.updateTransaction.useMutation();
  const trpcDeleteMovement = trpc.finance.deleteTransaction.useMutation();
  const trpcCreateRecurring = trpc.finance.createRecurring.useMutation();
  const trpcUpdateRecurring = trpc.finance.updateRecurring.useMutation();
  const trpcDeleteRecurring = trpc.finance.deleteRecurring.useMutation();
  const trpcUpdateGoal = trpc.finance.updateGoal.useMutation();
  const trpcUpdateOpening = trpc.finance.updateOpeningBalance.useMutation();
  const trpcImport = trpc.finance.importTransactions.useMutation();
  const trpcLegacyImport = trpc.finance.importLegacyBackup.useMutation();

  const periodOptions = useMemo(() => {
    const months = new Set<string>();
    for (let offset = -6; offset <= 3; offset++) months.add(addMonths(getCurrentMonth(), offset));
    transactions.forEach(transaction => months.add(monthKey(transaction.date)));
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const activeTransactions = useMemo(() => transactions.filter(transaction =>
    (period === "all" || monthKey(transaction.date) === period) &&
    (status === "all" || transaction.status === status)
  ), [transactions, period, status]);
  const visibleTransactions = activeTransactions.filter(transaction => !transaction.ignore);
  const incomeTransactions = visibleTransactions.filter(transaction => transaction.type === "income");
  const expenseTransactions = visibleTransactions.filter(transaction => transaction.type === "expense");
  const incomeTotal = sum(incomeTransactions);
  const expenseTotal = sum(expenseTransactions);
  const net = incomeTotal - expenseTotal;
  const goalPercent = settings?.goalPercent ?? 30;
  const goalTarget = incomeTotal * goalPercent / 100;
  const savedRate = incomeTotal > 0 ? net / incomeTotal * 100 : 0;
  const goalCompletion = goalTarget > 0 ? Math.max(0, net / goalTarget * 100) : net >= 0 ? 100 : 0;
  const meter = Math.max(0, Math.min(100, goalCompletion));
  const recurringIncome = sum(recurring.filter(item => item.type === "income"));
  const recurringExpense = sum(recurring.filter(item => item.type === "expense"));
  const quarterlyProjection = (recurringIncome - recurringExpense) * 3;

  const selectedOpening = period === "all" ? undefined : settings?.monthOpeningBalances?.[period];
  const checkpoint = period === "all" ? undefined : settings?.statementBalances?.[period];
  const opening = typeof selectedOpening === "number" ? selectedOpening : null;
  const reconciliationTransactions = period === "all" ? [] : transactions.filter(transaction =>
    monthKey(transaction.date) === period && transaction.status === "realized" && (!checkpoint?.date || transaction.date <= checkpoint.date)
  );
  const reconciliationNet = reconciliationTransactions.reduce((total, transaction) => total + (transaction.type === "income" ? 1 : -1) * transaction.value, 0);
  const expectedBalance = opening === null ? null : opening + reconciliationNet;
  const difference = expectedBalance === null || !checkpoint ? null : Number((expectedBalance - checkpoint.balance).toFixed(2));
  const reconciled = difference !== null && Math.abs(difference) < 0.01;

  const cashChartData = useMemo(() => {
    const current = getCurrentMonth();
    return Array.from({ length: 6 }, (_, index) => addMonths(current, index - 2)).map(month => {
      const monthRows = transactions.filter(transaction => monthKey(transaction.date) === month && !transaction.ignore);
      const income = sum(monthRows.filter(transaction => transaction.type === "income"));
      const expense = sum(monthRows.filter(transaction => transaction.type === "expense"));
      const future = month > current;
      return {
        month: monthLabel(month) + (month === addMonths(current, 3) ? " proj." : ""),
        income: income + (future ? recurringIncome : 0),
        expense: expense + (future ? recurringExpense : 0),
        future,
      };
    });
  }, [transactions, recurringIncome, recurringExpense]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenseTransactions.forEach(transaction => map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.value));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [expenseTransactions]);
  const topExpenses = [...expenseTransactions].sort((a, b) => b.value - a.value).slice(0, 5);
  const recentTransactions = [...activeTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const filteredMovements = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).filter(transaction =>
    !search || `${transaction.description} ${transaction.category}`.toLowerCase().includes(search.toLowerCase().trim())
  );

  const saveGoal = async (value: string) => {
    const parsed = Math.max(0, Math.min(100, Math.round(Number(value))));
    if (!Number.isFinite(parsed) || parsed === goalPercent) return;
    try {
      await trpcUpdateGoal.mutateAsync({ goalPercent: parsed });
      await refresh();
      toast.success("Meta de poupança atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a meta.");
    }
  };

  const saveOpeningBalance = async () => {
    if (period === "all") return;
    const trimmed = (openingDraft ?? "").trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && !Number.isFinite(value)) return;
    if (value === opening) return;
    try {
      await trpcUpdateOpening.mutateAsync({ month: period, value });
      await refresh();
      setOpeningDraft(null);
      toast.success(value === null ? "Saldo inicial removido." : "Saldo inicial do mês salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o saldo inicial.");
    }
  };

  const confirmImport = async (rows: TransactionDraft[], statement: StatementImport) => {
    const statementDate = statement.balance !== null ? statement.date ?? isoDate() : undefined;
    const result = await trpcImport.mutateAsync({
      transactions: rows,
      statementBalance: statement.balance ?? undefined,
      statementDate,
    });
    await refresh();
    toast.success(`${result.imported} lançamento(s) importado(s); ${result.duplicates} duplicata(s) ignorada(s).${result.statementSaved ? " Saldo do extrato registrado para conciliação." : ""}`);
  };

  const confirmLegacyImport = async (backup: LegacyBackup, importSettings: boolean) => {
    const result = await trpcLegacyImport.mutateAsync({ backup, importSettings });
    await refresh();
    toast.success(`Migração concluída: ${result.transactionsImported} movimentação(ões) e ${result.recurringImported} recorrência(s) adicionadas; duplicatas preservadas sem repetição.`);
  };

  const exportBackup = () => {
    if (!state) return;
    const payload = {
      format: "financasBI_cloud_backup_v1",
      exportedAt: new Date().toISOString(),
      data: {
        transactions,
        recurring,
        goalPercent: settings?.goalPercent ?? 30,
        monthOpeningBalances: settings?.monthOpeningBalances ?? {},
        statementBalances: settings?.statementBalances ?? {},
      },
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `financas-bi-backup-${isoDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Backup baixado.");
  };

  const startVoiceEntry = () => {
    type SpeechEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type Recognition = {
      lang: string;
      interimResults: boolean;
      onstart: (() => void) | null;
      onerror: (() => void) | null;
      onresult: ((event: SpeechEvent) => void) | null;
      start: () => void;
    };
    type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const speech = window as SpeechWindow;
    const RecognitionApi = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!RecognitionApi) {
      toast.error("Este navegador não oferece reconhecimento de voz. Use Novo lançamento ou abra no Chrome/Edge com permissão de microfone.");
      return;
    }
    const recognition = new RecognitionApi();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.onstart = () => toast.info("Ouvindo… diga, por exemplo: ‘nova despesa de 50 reais em alimentação’.");
    recognition.onerror = () => toast.error("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      const draft = parseVoiceTranscript(transcript);
      setMovementInitial(null);
      setMovementPrefill(draft);
      setMovementOpen(true);
      toast.info(draft.value > 0 ? "Confira os dados reconhecidos antes de salvar." : "Informe o valor e confira os dados antes de salvar.");
    };
    try { recognition.start(); } catch { toast.error("Não foi possível iniciar o registro por voz."); }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      queryClient.clear();
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      toast.success("Você saiu da sua conta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível sair agora.");
    }
  };

  const openNewMovement = () => {
    setMovementInitial(null);
    setMovementPrefill(null);
    setMovementOpen(true);
  };
  const openEditMovement = (transaction: Transaction) => {
    setMovementInitial(transaction as MovementRecord);
    setMovementPrefill(null);
    setMovementOpen(true);
  };
  const openNewRecurring = () => {
    setRecurringInitial(null);
    setRecurringOpen(true);
  };
  const openEditRecurring = (item: Recurring) => {
    setRecurringInitial(item as RecurringRecord);
    setRecurringOpen(true);
  };
  const deleteMovement = async (transaction: Transaction) => {
    if (!window.confirm(`Excluir “${transaction.description}”?`)) return;
    try {
      await trpcDeleteMovement.mutateAsync({ id: transaction.id });
      await refresh();
      toast.success("Movimentação excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a movimentação.");
    }
  };
  const deleteRecurring = async (item: Recurring) => {
    if (!window.confirm(`Excluir a recorrência “${item.title}”?`)) return;
    try {
      await trpcDeleteRecurring.mutateAsync({ id: item.id });
      await refresh();
      toast.success("Recorrência removida e projeção recalculada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a recorrência.");
    }
  };

  if (dataQuery.isLoading || !state) {
    if (dataQuery.error) return <main className="loading-screen"><span className="brand-mark">BI</span><p>Não foi possível carregar seus dados.</p><button className="button button-primary" onClick={() => dataQuery.refetch()}>Tentar novamente</button></main>;
    return <main className="loading-screen"><span className="brand-mark">BI</span><LoaderCircle className="spin" size={20} /><span>Carregando seu painel…</span></main>;
  }

  const title = view === "dashboard" ? "Visão financeira" : view === "movements" ? "Todas as movimentações" : "Receitas e despesas fixas";
  const openingBadge = period === "all" ? { text: "Selecione um mês", kind: "disabled" } : opening === null ? { text: "Aguardando saldo inicial", kind: "waiting" } : !checkpoint ? { text: "Aguardando extrato", kind: "waiting" } : reconciled ? { text: "Conciliado", kind: "matched" } : { text: "Diferença encontrada", kind: "mismatch" };
  const healthRatio = incomeTotal > 0 ? expenseTotal / incomeTotal : 0;
  const healthMessage = !incomeTotal && !expenseTotal
    ? "Não há movimentações no recorte. Cadastre lançamentos ou importe um extrato para gerar a análise."
    : healthRatio < 0.65
      ? `Seus gastos representam ${(healthRatio * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% das receitas visíveis. Há margem positiva para poupança; resultado recorrente estimado em ${money(quarterlyProjection)} em três meses.`
      : healthRatio < 1
        ? `Gastos em ${(healthRatio * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% das receitas do período. Acompanhe despesas variáveis e compromissos previstos.`
        : "As despesas do recorte igualam ou superam as receitas visíveis. Revise gastos previstos e recorrências; o saldo inicial não entra nesta comparação.";

  return <div className={`finance-app ${menuOpen ? "menu-open" : ""}`}>
    <aside className="sidebar">
      <div className="brand-lockup"><img className="brand-logo" src="/brand/financas-bi-logo.png" alt="" /><span><strong>Finanças BI</strong><small>SAAS PERSONAL</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Navegação principal">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => { setView("dashboard"); setMenuOpen(false); }}><LayoutDashboard size={17} />Dashboard BI</button>
        <button className={view === "movements" ? "active" : ""} onClick={() => { setView("movements"); setMenuOpen(false); }}><ArrowLeftRight size={17} />Movimentações</button>
        <button className={view === "recurring" ? "active" : ""} onClick={() => { setView("recurring"); setMenuOpen(false); }}><Repeat2 size={17} />Recorrências</button>
        <button onClick={() => { setImportOpen(true); setMenuOpen(false); }}><FileUp size={17} />Importar extrato</button>
      </nav>
      <div className="sidebar-bottom">
        <button className="voice-button" onClick={startVoiceEntry}><Mic size={17} />Registrar lançamento por voz</button>
        <div className="sidebar-utility">
          <button onClick={exportBackup}><Download size={15} />Baixar backup da conta</button>
          <button onClick={() => setLegacyOpen(true)}><Upload size={15} />Importar dados do HTML antigo</button>
        </div>
        <div className="side-note">Seus dados ficam sincronizados na sua conta e separados das contas de outras pessoas.</div>
      </div>
    </aside>
    <button className="sidebar-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />

    <main className="main-content">
      <header className="topbar">
        <div className="top-title-wrap"><button className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button><img className="topbar-mobile-logo brand-logo" src="/brand/financas-bi-logo.png" alt="" /><div><div className="breadcrumb">Visão geral <span>/</span> {view === "dashboard" ? "Dashboard BI" : view === "movements" ? "Movimentações" : "Recorrências"}</div><h1>{title}</h1></div></div>
        <div className="top-actions"><div className="account-chip"><span className="live-dot" /><span className="account-email">{user.email}</span><ShieldCheck size={15} /></div><button className="button button-primary" onClick={openNewMovement}><Plus size={16} />Novo lançamento</button><button className="button logout-button" onClick={() => void handleLogout()} disabled={logoutMutation.isPending}><LogOut size={15} /><span>Sair</span></button></div>
      </header>

      {view === "dashboard" && <>
        <section className="filter-bar"><div className="filter-controls"><span className="filter-label">PERÍODO</span><select value={period} onChange={event => { setPeriod(event.target.value); setOpeningDraft(null); }} aria-label="Filtrar mês"><option value="all">Todos os períodos</option>{periodOptions.map(month => <option value={month} key={month}>{monthLabel(month)}</option>)}</select><span className="filter-label status-label">STATUS</span><select value={status} onChange={event => setStatus(event.target.value as typeof status)} aria-label="Filtrar status"><option value="all">Todos</option><option value="realized">Apenas realizados</option><option value="forecast">Apenas previstos</option></select></div><div className="filter-end"><span className="count-chip">{activeTransactions.length} movimentaç{activeTransactions.length === 1 ? "ão" : "ões"}</span><button className="icon-button" title="Limpar filtros" aria-label="Limpar filtros" onClick={() => { setPeriod(getCurrentMonth()); setStatus("all"); setOpeningDraft(null); }}><RotateCcw size={15} /></button></div></section>

        {transactions.length === 0 && recurring.length === 0 && <div className="empty-banner"><Sparkles size={17} /><span><strong>Painel pronto para começar:</strong> movimentações, recorrências e saldos estão zerados. Cadastre seus valores ou importe um extrato para personalizar os indicadores.</span></div>}

        <section className="kpi-grid">
          <article className="panel-card result-kpi"><div className="kpi-head"><span>Resultado do período</span><span className="kpi-icon icon-indigo"><Gauge size={16} /></span></div><div className={`kpi-value ${net > 0 ? "positive" : net < 0 ? "negative" : ""}`}>{net > 0 ? "+" : net < 0 ? "−" : ""}{money(Math.abs(net))}</div><div className="kpi-foot">{net > 0 ? "Superávit: você gastou menos do que recebeu." : net < 0 ? "Déficit: suas saídas superaram as entradas." : "Resultado equilibrado no período."}</div><div className="goal-control"><label htmlFor="goalPercent">Meta para guardar</label><div className="goal-input"><input id="goalPercent" type="number" min="0" max="100" step="1" key={goalPercent} defaultValue={goalPercent} onBlur={event => void saveGoal(event.target.value)} onKeyDown={event => event.key === "Enter" && event.currentTarget.blur()} /><span>%</span></div></div><div className="goal-stat"><span>{incomeTotal > 0 ? `Taxa guardada: ${savedRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "Sem receitas no recorte"}</span><span>Meta: {money(goalTarget)}</span></div><div className="goal-meter"><span style={{ width: `${meter}%`, background: net < 0 ? "linear-gradient(90deg,#fb7185,#f43f5e)" : "linear-gradient(90deg,#10b981,#3b82f6)" }} /></div><div className="goal-message">{!incomeTotal && !expenseTotal ? "Cadastre receitas e despesas para acompanhar sua meta de poupança." : net < 0 ? `Você teve prejuízo de ${money(Math.abs(net))}. Faltaram ${money(Math.abs(net))} para empatar e ${money(goalTarget - net)} para alcançar a meta de ${goalPercent}% (${money(goalTarget)}).` : net + 0.005 >= goalTarget ? `Você lucrou ${money(net)} e ${goalTarget > 0 ? `atingiu a meta de ${goalPercent}% (${money(goalTarget)}).` : "sua meta está em 0%."}` : `Você lucrou ${money(net)} e atingiu ${goalCompletion.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% da meta de ${goalPercent}%. Faltam ${money(goalTarget - net)} para guardar o valor desejado.`}</div></article>
          <article className="panel-card"><div className="kpi-head"><span>Receitas do período</span><span className="kpi-icon icon-green"><TrendingUp size={16} /></span></div><div className="kpi-value">{money(incomeTotal)}</div><div className="kpi-split"><span><i className="dot green" />Realizada {money(sum(incomeTransactions.filter(item => item.status === "realized")))}</span><span><i className="dot amber" />Prevista {money(sum(incomeTransactions.filter(item => item.status === "forecast")))}</span></div></article>
          <article className="panel-card"><div className="kpi-head"><span>Gastos do período</span><span className="kpi-icon icon-red"><TrendingDown size={16} /></span></div><div className="kpi-value">{money(expenseTotal)}</div><div className="kpi-split"><span><i className="dot red" />Realizado {money(sum(expenseTransactions.filter(item => item.status === "realized")))}</span><span><i className="dot amber" />Previsto {money(sum(expenseTransactions.filter(item => item.status === "forecast")))}</span></div></article>
          <article className="panel-card"><div className="kpi-head"><span>Resultado projetado · 3 meses</span><span className="kpi-icon icon-blue"><BarChart3 size={16} /></span></div><div className={`kpi-value ${quarterlyProjection >= 0 ? "positive" : "negative"}`}>{money(quarterlyProjection)}</div><div className="kpi-foot">Baseado nas recorrências mensais cadastradas</div><div className="projection-memory">({money(recurringIncome)} entradas − {money(recurringExpense)} saídas) × 3</div></article>
        </section>

        <section className="panel-card reconciliation-card">
          <div className="section-card-heading"><div><h2>Saldo inicial e conciliação</h2><p>{period === "all" ? "Selecione um mês específico no filtro para conferir o saldo." : `Período selecionado: ${monthLabel(period)}.`}</p></div><span className={`recon-badge ${openingBadge.kind}`}>{openingBadge.text}</span></div>
          <div className="recon-layout"><div className="recon-input-panel"><label htmlFor="openingBalance">Virei o mês com</label><div className="money-input"><span>R$</span><input id="openingBalance" type="number" step="0.01" inputMode="decimal" placeholder="Ex.: 200,00" disabled={period === "all"} value={period === "all" ? "" : openingDraft !== null ? openingDraft : opening === null ? "" : opening} onChange={event => setOpeningDraft(event.target.value)} onBlur={() => void saveOpeningBalance()} /></div><small>Saldo da conta no início do mês selecionado. A meta de poupança continua separada.</small></div><div className="recon-stats"><div><span>Movimentações realizadas</span><strong>{period === "all" ? "—" : `${reconciliationNet > 0 ? "+" : ""}${money(reconciliationNet)}`}</strong></div><div><span>Saldo calculado</span><strong>{period === "all" ? "—" : expectedBalance === null ? "Informe o saldo inicial" : money(expectedBalance)}</strong></div><div><span>Saldo final do extrato</span><strong>{period === "all" ? "—" : checkpoint ? money(checkpoint.balance) : "Ainda não importado"}</strong></div><div><span>Diferença para conferir</span><strong className={difference === null ? "" : reconciled ? "positive" : "negative"}>{difference === null ? "—" : money(difference)}</strong></div></div></div>
          <div className={`recon-status ${reconciled ? "ok" : difference !== null ? "warn" : ""}`} role="status">{period === "all" ? "A conciliação do saldo inicial é mensal. Escolha um mês no filtro acima." : opening === null ? checkpoint ? `O extrato informa saldo de ${money(checkpoint.balance)} em ${dateLabel(checkpoint.date)}. Informe o saldo com que iniciou o mês para conferir a diferença.` : "Informe quanto havia na conta no início do mês. O painel soma as movimentações realizadas e compara com o saldo final quando você importar o PDF." : !checkpoint ? `Saldo calculado: saldo inicial de ${money(opening)} ${reconciliationNet < 0 ? "−" : "+"} movimentações realizadas (${money(Math.abs(reconciliationNet))}). Importe um PDF com saldo final para validar; CSV e OFX sem saldo servem para registrar lançamentos, mas não confirmam o saldo bancário.` : reconciled ? `Conciliado até ${dateLabel(checkpoint.date)}: saldo inicial + movimentações realizadas = saldo final do extrato.` : `O saldo calculado está ${money(Math.abs(difference ?? 0))} ${Number(difference) > 0 ? "acima" : "abaixo"} do saldo do extrato. Revise o saldo inicial, lançamentos ausentes ou duplicados e itens desmarcados na importação.`}</div>
        </section>

        <section className="chart-grid"><article className="panel-card chart-card"><div className="section-card-heading"><div><h2>Fluxo de caixa & projeção</h2><p>Histórico recente e próximos meses · valores mensais</p></div><div className="legend"><span><i className="dot green" />Receitas</span><span><i className="dot red" />Gastos</span></div></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={cashChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="#20293a" vertical={false} /><XAxis dataKey="month" tick={{ fill: "#8290a5", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={value => `R$ ${Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(value))}`} tick={{ fill: "#8290a5", fontSize: 9 }} axisLine={false} tickLine={false} width={45} /><Tooltip formatter={(value: number | string) => money(Number(value))} contentStyle={{ background: "#121a29", borderColor: "#34415a", borderRadius: 10, color: "#f5f7fb", fontSize: 11 }} /><Bar dataKey="income" name="Receitas" radius={[4, 4, 0, 0]} fill="#10b981" /><Bar dataKey="expense" name="Gastos" radius={[4, 4, 0, 0]} fill="#f43f5e" /></BarChart></ResponsiveContainer></div></article><article className="panel-card chart-card"><div className="section-card-heading"><div><h2>Gastos por categoria</h2><p>Distribuição no período selecionado</p></div><span className="count-chip">{period === "all" ? "Todos" : monthLabel(period)}</span></div><div className="donut-area">{categoryData.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="#0e1320" strokeWidth={3}>{categoryData.map((item, index) => <Cell key={item.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value: number | string) => money(Number(value))} contentStyle={{ background: "#121a29", borderColor: "#34415a", borderRadius: 10, color: "#f5f7fb", fontSize: 11 }} /></PieChart></ResponsiveContainer> : <div className="chart-empty">Sem gastos no período</div>}</div><div className="category-summary"><span>Maior categoria</span><strong>{categoryData[0] ? `${categoryData[0].name} · ${money(categoryData[0].value)}` : "Sem gastos no período"}</strong></div></article></section>

        <section className="bottom-grid"><article className="panel-card"><div className="section-card-heading"><div><h2>Top 5 maiores gastos</h2><p>Exclui lançamentos ignorados no fluxo</p></div><ArrowDownRight size={17} className="muted-icon" /></div>{topExpenses.length ? <div className="top-expense-list">{topExpenses.map((transaction, index) => <div className="top-expense" key={transaction.id}><span className={`expense-avatar expense-${index}`}>{transaction.category.slice(0, 1)}</span><span className="expense-detail"><strong>{transaction.description}</strong><small>{transaction.category} · {dateLabel(transaction.date)}</small><i><b style={{ width: `${Math.max(5, transaction.value / (topExpenses[0]?.value || 1) * 100)}%` }} /></i></span><strong className="expense-amount">{money(transaction.value)}</strong></div>)}</div> : <div className="empty-state">Nenhum gasto encontrado no recorte.</div>}</article><article className="panel-card"><div className="section-card-heading"><div><h2>Últimas movimentações</h2><p>Lançamentos do período filtrado</p></div><button className="text-button" onClick={() => setView("movements")}>Ver todas <ArrowRight size={14} /></button></div><TransactionTable rows={recentTransactions} compact onEdit={openEditMovement} onDelete={deleteMovement} /></article></section>
        <section className="panel-card health-card"><span className="health-icon"><ShieldCheck size={17} /></span><div><strong>Saúde financeira</strong><p>{healthMessage}</p></div><span className="health-tag">ANÁLISE DO PERÍODO</span></section>
      </>}

      {view === "movements" && <section className="page-section"><div className="section-heading"><div><h2>Movimentações</h2><p>Gerencie receitas, despesas e previsões em um só lugar.</p></div><div className="toolbar"><label className="search-field"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar descrição ou categoria…" /></label><button className="button" onClick={() => setImportOpen(true)}><FileUp size={15} />Importar</button><button className="button button-primary" onClick={openNewMovement}><Plus size={15} />Novo lançamento</button></div></div><article className="panel-card"><TransactionTable rows={filteredMovements} onEdit={openEditMovement} onDelete={deleteMovement} /></article></section>}

      {view === "recurring" && <section className="page-section"><div className="section-heading"><div><h2>Recorrências</h2><p>Cadastre receitas e despesas fixas para alimentar suas projeções.</p></div><button className="button button-primary" onClick={openNewRecurring}><Plus size={15} />Nova recorrência</button></div><article className="panel-card"><RecurringTable rows={recurring} onEdit={openEditRecurring} onDelete={deleteRecurring} /></article><article className="panel-card explainer-card"><Sparkles size={17} /><p><strong>Como a projeção funciona:</strong> entradas recorrentes são somadas como receitas previstas nos próximos três meses; saídas recorrentes como despesas previstas. O resultado trimestral é (receitas mensais − despesas mensais) × 3.</p></article></section>}

      <footer className="sync-footer"><span><i className="live-dot" /> Salvo na nuvem</span><span>Conta privada · sincronização automática entre dispositivos</span></footer>
    </main>

    <MovementDialog open={movementOpen} initial={movementInitial} prefill={movementPrefill} onClose={() => { setMovementOpen(false); setMovementPrefill(null); }} onSave={saveMovement} />
    <RecurringDialog open={recurringOpen} initial={recurringInitial} onClose={() => setRecurringOpen(false)} onSave={saveRecurring} />
    <ImportDialog open={importOpen} existingTransactions={transactions as MovementRecord[]} onClose={() => setImportOpen(false)} onConfirm={confirmImport} />
    <LegacyImportDialog open={legacyOpen} onClose={() => setLegacyOpen(false)} onImport={confirmLegacyImport} />
  </div>;
}

function TransactionTable({ rows, compact = false, onEdit, onDelete }: { rows: Transaction[]; compact?: boolean; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void }) {
  if (!rows.length) return <div className="empty-state">{compact ? "Nenhuma movimentação neste período." : "Nenhuma movimentação cadastrada."}</div>;
  return <div className="table-scroll"><table className="data-table movement-table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Status</th><th className="align-right">Valor</th>{!compact && <th aria-label="Ações" />}</tr></thead><tbody>{rows.map(transaction => <tr key={transaction.id}><td className="muted-text">{dateLabel(transaction.date)}</td><td className="description-cell">{transaction.description}{transaction.ignore && <span className="table-tag">Ignorado no fluxo</span>}</td><td className="muted-text">{transaction.category}</td><td><span className={transaction.type === "income" ? "positive" : "negative"}>{transaction.type === "income" ? "Entrada" : "Saída"}</span></td><td><span className={`status-pill ${transaction.status}`}>{transaction.status === "realized" ? "Realizado" : "Previsto"}</span></td><td className={`align-right ${transaction.type === "income" ? "positive" : "negative"}`}>{transaction.type === "income" ? "+" : "−"}{money(transaction.value)}</td>{!compact && <td className="actions-cell"><button className="icon-button" onClick={() => onEdit(transaction)} title="Editar"><span className="sr-only">Editar {transaction.description}</span><Sparkles size={14} /></button><button className="icon-button danger-hover" onClick={() => onDelete(transaction)} title="Excluir"><span className="sr-only">Excluir {transaction.description}</span><Trash2 size={14} /></button></td>}</tr>)}</tbody></table></div>;
}

function RecurringTable({ rows, onEdit, onDelete }: { rows: Recurring[]; onEdit: (item: Recurring) => void; onDelete: (item: Recurring) => void }) {
  if (!rows.length) return <div className="empty-state">Nenhuma recorrência cadastrada. Adicione receitas e despesas fixas para gerar projeções.</div>;
  return <div className="table-scroll"><table className="data-table recurring-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Dia</th><th className="align-right">Valor mensal</th><th aria-label="Ações" /></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td className="description-cell">{item.title}</td><td><span className={item.type === "income" ? "positive" : "negative"}>{item.type === "income" ? "Entrada" : "Saída"}</span></td><td className="muted-text">{item.category}</td><td>Todo dia {item.day}</td><td className="align-right">{money(item.value)}</td><td className="actions-cell"><button className="icon-button" onClick={() => onEdit(item)} title="Editar recorrência"><span className="sr-only">Editar {item.title}</span><Sparkles size={14} /></button><button className="icon-button danger-hover" onClick={() => onDelete(item)} title="Excluir recorrência"><span className="sr-only">Excluir {item.title}</span><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>;
}
