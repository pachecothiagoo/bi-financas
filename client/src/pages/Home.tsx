import { LoaderCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import AuthScreen from "./AuthScreen";
import FinanceDashboard from "@/features/finance/FinanceDashboard";

export default function Home() {
  const auth = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchInterval: 60_000,
  });

  if (auth.isLoading) {
    return <main className="loading-screen"><span className="brand-mark">BI</span><LoaderCircle className="spin" size={20} /><span>Validando sua conta…</span></main>;
  }

  if (auth.error) {
    return <main className="loading-screen"><span className="brand-mark">BI</span><p>Não foi possível validar sua sessão.</p><button className="button button-primary" onClick={() => auth.refetch()}>Tentar novamente</button></main>;
  }

  if (!auth.data) {
    return <AuthScreen onAuthenticated={() => void auth.refetch()} />;
  }

  return <FinanceDashboard user={auth.data} />;
}
