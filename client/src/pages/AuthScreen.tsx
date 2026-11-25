import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type AuthMode = "login" | "register";

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const utils = trpc.useUtils();
  const register = trpc.auth.register.useMutation();
  const login = trpc.auth.login.useMutation();
  const busy = register.isPending || login.isPending;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    try {
      if (mode === "register") {
        await register.mutateAsync({ email: email.trim(), password });
      } else {
        await login.mutateAsync({ email: email.trim(), password });
      }
      await utils.auth.me.invalidate();
      onAuthenticated();
    } catch (error) {
      setIsError(true);
      const text = error instanceof Error ? error.message : "Não foi possível entrar agora.";
      setMessage(text.replace(/^\[.*?\]\s*/, ""));
    }
  };

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setMessage("");
    setIsError(false);
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand-lockup">
          <span className="brand-mark">BI</span>
          <span><strong>Finanças BI</strong><small>Seu dinheiro, com clareza.</small></span>
        </div>
        <div className="auth-story-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> CONTROLE QUE FAZ SENTIDO</div>
          <h1>Transforme seus números em <em>decisões melhores.</em></h1>
          <p>Receitas, despesas, metas e conciliação bancária em um só lugar — com seus dados sincronizados na sua conta.</p>
          <div className="story-points">
            <span><ShieldCheck size={17} /> Seus dados são privados por conta</span>
            <span><LockKeyhole size={17} /> Acesse no celular ou computador</span>
          </div>
        </div>
        <div className="auth-story-foot">FINANÇAS PESSOAIS, SEM ACHISMO.</div>
      </section>

      <section className="auth-panel-wrap">
        <div className="auth-panel">
          <div className="auth-panel-top"><span className="auth-step">CONTA FINANCEIRA</span><span className="secure-pill"><i /> Conexão segura</span></div>
          <h2>{mode === "login" ? "Bom ter você de volta" : "Crie sua conta"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Entre para abrir seu painel financeiro." : "Use o mesmo e-mail sempre que quiser acessar seus dados."}</p>

          <div className="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => changeMode("login")}>Entrar</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => changeMode("register")}>Criar conta</button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>E-mail</span>
              <span className="auth-input-wrap"><Mail size={16} /><input autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@email.com" required maxLength={320} /></span>
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <span className="auth-input-wrap"><LockKeyhole size={16} /><input autoComplete={mode === "login" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "login" ? "Sua senha" : "Pelo menos 8 caracteres"} required minLength={8} maxLength={128} /><button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              {mode === "register" && <small className="field-help">A senha deve ter pelo menos 8 caracteres.</small>}
            </label>
            {message && <div className={`auth-message ${isError ? "error" : "success"}`} role="alert">{message}{isError && message.toLowerCase().includes("já existe") && <button type="button" onClick={() => changeMode("login")}> Ir para Entrar</button>}</div>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <>{mode === "login" ? "Entrar no dashboard" : "Criar minha conta"}<ArrowRight size={17} /></>}
            </button>
          </form>
          <p className="auth-privacy">Os dados deste app usam uma conta própria e não compartilham o login do app Agenda.</p>
        </div>
        <footer className="auth-footer">Finanças BI <span>·</span> Dashboard pessoal</footer>
      </section>
    </main>
  );
}
