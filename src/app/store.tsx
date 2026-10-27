// Fonte única de dados das telas: lê o banco local (ao vivo) e calcula a situação uma vez.
// Toda tela usa useApp(): ninguém refaz conta por conta própria.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { hojeISO } from "../core/dates";
import { calcularSituacao, type Situacao } from "../core/situacao";
import type { Dados } from "../core/types";
import { db, modoAtual } from "../data/db";
import { carregarDados, garantirInicial, gerarRecorrencias } from "../data/repo";
import { CHAVE_NFC, converterNfc, lerTextoNfc, type ResultadoNfc } from "../integracoes/nfc";
import { envelopeDoTipo } from "../core/ledger";

interface Ctx {
  /** Dados do Finanças + vendas e estoque lidos do Plaquinhas NFC (somente leitura). */
  d: Dados;
  /** O que foi encontrado do app Plaquinhas NFC neste aparelho. */
  nfc: ResultadoNfc;
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

  const local = useLiveQuery(() => (pronto ? carregarDados(db()) : undefined), [pronto]);

  // Dados do Plaquinhas NFC: relidos quando o outro app grava (outra aba) ou quando você volta para cá
  const modo = modoAtual();
  const [textoNfc, setTextoNfc] = useState<string | null>(() => (modo === "real" ? lerTextoNfc() : null));
  useEffect(() => {
    if (modo !== "real") return;
    const reler = () => setTextoNfc((t) => { const n = lerTextoNfc(); return n === t ? t : n; });
    const porStorage = (e: StorageEvent) => { if (e.key === CHAVE_NFC || e.key === null) reler(); };
    const porVisib = () => { if (document.visibilityState === "visible") reler(); };
    window.addEventListener("storage", porStorage);
    window.addEventListener("focus", reler);
    document.addEventListener("visibilitychange", porVisib);
    return () => { window.removeEventListener("storage", porStorage); window.removeEventListener("focus", reler); document.removeEventListener("visibilitychange", porVisib); };
  }, [modo]);

  const lig = local?.config.negocios?.nfc;
  const negocioId = local ? envelopeDoTipo(local.envelopes, "negocio")?.id ?? "" : "";
  const nfc = useMemo(() => converterNfc(textoNfc, lig?.ativo ? lig : null, negocioId), [textoNfc, lig?.ativo, lig?.contaId, lig?.desde, negocioId]); // eslint-disable-line
  const d = useMemo<Dados | undefined>(() => local && {
    ...local,
    produtos: [...local.produtos, ...nfc.produtos],
    movimentos: [...local.movimentos, ...nfc.vendasConv, ...nfc.compras],
  }, [local, nfc]);
  const sit = useMemo(() => (d ? calcularSituacao(d, hoje) : null), [d, hoje]);

  if (falha) return <>{erro(falha)}</>;
  if (!d || !sit) return <>{carregando}</>;
  return <AppCtx.Provider value={{ d, nfc, sit, hoje, modo }}>{children}</AppCtx.Provider>;
}
