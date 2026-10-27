// Fonte única de dados das telas: lê o banco local (ao vivo) e calcula a situação uma vez.
// Toda tela usa useApp(): ninguém refaz conta por conta própria.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { hojeISO } from "../core/dates";
import { calcularSituacao, type Situacao } from "../core/situacao";
import type { Dados } from "../core/types";
import { db, modoAtual } from "../data/db";
import { carregarDados, garantirInicial, gerarRecorrencias } from "../data/repo";

interface Ctx {
  d: Dados;
  sit: Situacao;
  hoje: string;
  modo: "real" | "demo";
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fora do provider");
  return c;
}

/** Data de hoje que muda sozinha à meia-noite (o app pode ficar aberto). */
function useHoje() {
  const [hoje, setHoje] = useState(hojeISO());
  useEffect(() => {
    const t = setInterval(() => setHoje((h) => (h === hojeISO() ? h : hojeISO())), 60_000);
    return () => clearInterval(t);
  }, []);
  return hoje;
}

export function DataProvider({ children, carregando, erro }: { children: ReactNode; carregando: ReactNode; erro: (e: unknown) => ReactNode }) {
  const hoje = useHoje();
  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      try {
        await garantirInicial(db());
        await gerarRecorrencias(db(), hojeISO());
        if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
        setPronto(true);
      } catch (e) { setFalha(e); }
    })();
  }, []);

  // Gera as contas recorrentes do dia quando a data vira
  useEffect(() => { if (pronto) gerarRecorrencias(db(), hoje).catch(() => {}); }, [hoje, pronto]);

  const d = useLiveQuery(() => (pronto ? carregarDados(db()) : undefined), [pronto]);
  const sit = useMemo(() => (d ? calcularSituacao(d, hoje) : null), [d, hoje]);

  if (falha) return <>{erro(falha)}</>;
  if (!d || !sit) return <>{carregando}</>;
  return <AppCtx.Provider value={{ d, sit, hoje, modo: modoAtual() }}>{children}</AppCtx.Provider>;
}
