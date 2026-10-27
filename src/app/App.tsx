import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight, BarChart3, BriefcaseBusiness, CalendarClock, Home, Layers, Menu, MessageCircleQuestion, Plus, Settings, Target } from "lucide-react";
import { DataProvider, useApp } from "./store";
import { AcoesProvider, useAcoes } from "./acoes";
import { ir, useRota, type Rota } from "./rotas";
import { cn, Folha, UiProvider } from "../ui/ui";
import { Visao } from "../screens/Visao";
import { Movimentacoes } from "../screens/Movimentacoes";
import { Envelopes } from "../screens/Envelopes";
import { ContasFaturas } from "../screens/ContasFaturas";
import { MeusNegocios } from "../screens/MeusNegocios";
import { Metas } from "../screens/Metas";
import { Relatorios } from "../screens/Relatorios";
import { Consultor } from "../screens/Consultor";
import { Configuracoes } from "../screens/Configuracoes";
import { Assistente } from "../screens/Assistente";
import { definirModo } from "../data/db";

export const NAV: { rota: Rota; nome: string; icone: ReactNode }[] = [
  { rota: "visao", nome: "Visão geral", icone: <Home size={19} /> },
  { rota: "movimentos", nome: "Movimentações", icone: <ArrowLeftRight size={19} /> },
  { rota: "envelopes", nome: "Envelopes", icone: <Layers size={19} /> },
  { rota: "contas", nome: "Contas e faturas", icone: <CalendarClock size={19} /> },
  { rota: "negocios", nome: "Meus negócios", icone: <BriefcaseBusiness size={19} /> },
  { rota: "metas", nome: "Metas", icone: <Target size={19} /> },
  { rota: "relatorios", nome: "Relatórios", icone: <BarChart3 size={19} /> },
  { rota: "consultor", nome: "Consultor", icone: <MessageCircleQuestion size={19} /> },
  { rota: "config", nome: "Configurações", icone: <Settings size={19} /> },
];

export function App() {
  return (
    <UiProvider>
      <DataProvider carregando={<Carregando />} erro={(e) => <Falha erro={e} />}>
        <AcoesProvider>
          <Casca />
        </AcoesProvider>
      </DataProvider>
    </UiProvider>
  );
}

function Carregando() {
  return <div className="grid min-h-dvh place-items-center text-muted">Abrindo seus dados…</div>;
}

function Falha({ erro }: { erro: unknown }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="font-display text-2xl font-semibold">Não foi possível abrir o banco de dados</h1>
      <p className="text-muted">O navegador bloqueou o armazenamento local (janela anônima ou dados do site bloqueados). Nada foi apagado. Abra o app numa janela normal.</p>
      <p className="text-[13px] text-faint">Detalhe técnico: {String((erro as Error)?.message ?? erro)}</p>
    </div>
  );
}

function Casca() {
  const { rota, sub } = useRota();
  const { d, modo } = useApp();
  const { nova } = useAcoes();
  const [mais, setMais] = useState(false);
  const [assistente, setAssistente] = useState(false);

  // Tema
  useEffect(() => {
    const aplicar = () => {
      const t = d.config.tema === "sistema" ? (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro") : d.config.tema;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "claro" ? "#f2f3f6" : "#0e1116");
      try { localStorage.setItem("gf:tema", d.config.tema); } catch { /* ok */ }
    };
    aplicar();
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [d.config.tema]);

  // Primeira vez: abre o assistente
  useEffect(() => { if (modo === "real" && !d.config.setupDispensado && !Object.keys(d.config.setup).length) setAssistente(true); }, []); // eslint-disable-line

  const tela = {
    visao: <Visao abrirAssistente={() => setAssistente(true)} />, movimentos: <Movimentacoes />, envelopes: <Envelopes />, contas: <ContasFaturas aba={sub} />,
    negocios: <MeusNegocios aba={sub} />, metas: <Metas />, relatorios: <Relatorios />, consultor: <Consultor />, config: <Configuracoes abrirAssistente={() => setAssistente(true)} />,
  }[rota];

  const baixo: { rota: Rota; nome: string; icone: ReactNode }[] = [NAV[0], NAV[1], NAV[4], NAV[3]];

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (computador) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <div><div className="font-display text-[19px] font-semibold leading-tight">Finanças</div><div className="text-[12px] text-muted">{modo === "demo" ? "Modo demonstração" : "Só neste aparelho"}</div></div>
        </div>
        <button onClick={() => nova()} className="mb-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-ink hover:brightness-105"><Plus size={18} />Adicionar movimentação</button>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <a key={n.rota} href={`#/${n.rota}`} aria-current={rota === n.rota ? "page" : undefined}
              className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-[14.5px] font-medium transition", rota === n.rota ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
              <span className={rota === n.rota ? "text-accent" : ""}>{n.icone}</span>{n.nome}
            </a>
          ))}
        </nav>
      </aside>

      {modo === "demo" && (
        <div className="no-print sticky top-0 z-20 flex items-center justify-center gap-3 bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-ink" style={{ paddingTop: "max(6px, env(safe-area-inset-top))" }}>
          Modo demonstração: dados fictícios, separados dos seus.
          <button className="underline" onClick={() => { definirModo("real"); location.reload(); }}>Voltar aos meus dados</button>
        </div>
      )}

      <main className="print-area mx-auto w-full max-w-5xl px-4 pb-32 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 lg:pb-12 lg:pt-8">
        {tela}
      </main>

      {/* Barra de baixo (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          {baixo.slice(0, 2).map((n) => <ItemBaixo key={n.rota} n={n} ativo={rota === n.rota} />)}
          <button onClick={() => nova()} aria-label="Adicionar movimentação" className="mx-auto grid h-14 w-14 -translate-y-3 place-items-center rounded-2xl bg-accent text-accent-ink shadow-lg shadow-black/30 active:scale-95"><Plus size={28} strokeWidth={2.6} /></button>
          {baixo.slice(2, 3).map((n) => <ItemBaixo key={n.rota} n={n} ativo={rota === n.rota} />)}
          <button onClick={() => setMais(true)} className={cn("flex flex-col items-center gap-0.5 text-[11px] font-semibold", !baixo.slice(0, 3).some((b) => b.rota === rota) ? "text-accent" : "text-muted")}><Menu size={22} />Mais</button>
        </div>
      </nav>

      <Folha aberta={mais} onFechar={() => setMais(false)} titulo="Ir para">
        <div className="grid grid-cols-2 gap-2 pb-3">
          {NAV.map((n) => (
            <button key={n.rota} onClick={() => { setMais(false); ir(n.rota); }} className={cn("flex h-14 items-center gap-3 rounded-xl border px-3 text-left text-[14.5px] font-semibold", rota === n.rota ? "border-accent text-accent" : "border-line")}>
              {n.icone}{n.nome}
            </button>
          ))}
        </div>
      </Folha>
      {assistente && <Assistente onFechar={() => setAssistente(false)} />}
    </div>
  );
}

function ItemBaixo({ n, ativo }: { n: { rota: Rota; nome: string; icone: ReactNode }; ativo: boolean }) {
  return (
    <a href={`#/${n.rota}`} className={cn("flex flex-col items-center gap-0.5 text-[11px] font-semibold", ativo ? "text-accent" : "text-muted")}>
      {n.icone}<span className="max-w-[72px] truncate">{n.nome === "Visão geral" ? "Início" : n.nome === "Movimentações" ? "Movimentos" : n.nome === "Meus negócios" ? "Negócios" : n.nome}</span>
    </a>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M14 24h36v24a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="var(--accent-ink)" opacity=".92" />
      <path d="M14 24l18 13 18-13" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M20 18h24" stroke="var(--accent-ink)" strokeWidth="4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}
