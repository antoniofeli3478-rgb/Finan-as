// Abre os formulários de qualquer tela: registrar, distribuir, pagar e receber.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { br } from "../core/dates";
import { brl, type Cents } from "../core/money";
import type { Compromisso, AReceber } from "../core/situacao";
import type { PagamentoFatura } from "../core/types";
import { totaisVenda } from "../core/ledger";
import { useApp } from "./store";
import { ehDoNfc, URL_APP_NFC } from "../integracoes/nfc";
import { db } from "../data/db";
import { ErroValidacao, marcarRecebida, novoMov, pagar, receberVenda, salvarMovimento } from "../data/repo";
import { Distribuicao, type PedidoDistribuicao } from "../forms/Distribuicao";
import { NovaMovimentacao, type PedidoNova } from "../forms/NovaMovimentacao";
import { Aviso, Button, Campo, Data, Dinheiro, Folha, Money, Selecao, useUi } from "../ui/ui";

interface Acoes {
  nova: (p?: PedidoNova) => void;
  distribuir: (p?: PedidoDistribuicao) => void;
  pagarConta: (c: Compromisso) => void;
  receber: (r: AReceber) => void;
}

const Ctx = createContext<Acoes | null>(null);
export const useAcoes = () => { const c = useContext(Ctx); if (!c) throw new Error("useAcoes"); return c; };

export function AcoesProvider({ children }: { children: ReactNode }) {
  const [nova, setNova] = useState<PedidoNova | null>(null);
  const [dist, setDist] = useState<PedidoDistribuicao | null>(null);
  const [conta, setConta] = useState<Compromisso | null>(null);
  const [rec, setRec] = useState<AReceber | null>(null);
  const api: Acoes = {
    nova: useCallback((p?: PedidoNova) => setNova(p ?? {}), []),
    distribuir: useCallback((p?: PedidoDistribuicao) => setDist(p ?? {}), []),
    pagarConta: useCallback((c: Compromisso) => setConta(c), []),
    receber: useCallback((r: AReceber) => setRec(r), []),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <NovaMovimentacao pedido={nova} onFechar={() => setNova(null)} onDistribuir={(p) => setDist(p)} />
      <Distribuicao pedido={dist} onFechar={() => setDist(null)} />
      {conta && <PagarConta c={conta} onFechar={() => setConta(null)} />}
      {rec && <Receber r={rec} onFechar={() => setRec(null)} onDistribuir={(p) => setDist(p)} />}
    </Ctx.Provider>
  );
}

function PagarConta({ c, onFechar }: { c: Compromisso; onFechar: () => void }) {
  const { d, sit, hoje } = useApp();
  const { toast } = useUi();
  const mov = c.movId ? d.movimentos.find((m) => m.id === c.movId) : null;
  const [valor, setValor] = useState<Cents | null>(c.valor);
  const [contaId, setContaId] = useState<string>(((mov as { contaId?: string } | null)?.contaId) || d.contas[0]?.id || "");
  const [data, setData] = useState(hoje);
  const [envelopeId, setEnvelopeId] = useState<string>(c.envelopeId ?? sit.env.obrigacoes?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const saldoEnv = sit.saldos.envelopes[envelopeId] ?? 0;
  const salvar = async () => {
    setErro(null);
    try {
      if (!valor || valor <= 0) { setErro("Coloque o valor pago."); return; }
      if (c.origem === "fatura") {
        await salvarMovimento(db(), novoMov<PagamentoFatura>({ tipo: "cartao_pagamento", valor, cartaoId: c.cartaoId!, fatura: c.fatura!, contaId, envelopeId, data, descricao: c.descricao }));
      } else {
        if (mov?.tipo === "despesa" && envelopeId !== mov.envelopeId) await db().movimentos.put({ ...mov, envelopeId });
        await pagar(db(), c.movId!, contaId, data, valor);
      }
      toast(`${c.descricao} paga`);
      onFechar();
    } catch (e) { setErro(e instanceof ErroValidacao ? e.problemas.join(" ") : (e as Error).message); }
  };
  return (
    <Folha aberta onFechar={onFechar} titulo={`Pagar ${c.descricao}`} rodape={<Button className="w-full" onClick={salvar}>Confirmar pagamento</Button>}>
      <div className="flex flex-col gap-4">
        <div className="text-[14px] text-muted">Vence em {br(c.vencimento)}{c.atrasado ? " · vencida" : ""}{c.estimado ? " · valor estimado, confira" : ""}</div>
        <Campo rotulo={c.origem === "fatura" ? "Valor pago (pode ser parcial)" : "Valor pago"}><Dinheiro value={valor} onChange={setValor} grande /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Pago com"><Selecao value={contaId} onChange={setContaId} opcoes={d.contas.filter((x) => !x.arquivada).map((x) => ({ valor: x.id, rotulo: `${x.nome} · ${brl(sit.saldos.contas[x.id] ?? 0)}` }))} /></Campo>
          <Campo rotulo="Data do pagamento"><Data value={data} onChange={setData} /></Campo>
        </div>
        {c.origem !== "estoque" && <Campo rotulo="Sai do envelope"><Selecao value={envelopeId} onChange={setEnvelopeId} opcoes={d.envelopes.filter((e) => !e.arquivado).map((e) => ({ valor: e.id, rotulo: `${e.nome} · ${brl(sit.saldos.envelopes[e.id] ?? 0)}` }))} /></Campo>}
        {valor != null && c.origem !== "estoque" && valor > saldoEnv && <Aviso tom="warn">O envelope tem {brl(saldoEnv)}. Pagar deixa ele negativo em {brl(valor - saldoEnv)}.</Aviso>}
        {c.origem === "fatura" && <Aviso tom="info">O pagamento quita a fatura, mas não conta de novo como gasto: as compras já contaram.</Aviso>}
        {erro && <Aviso tom="bad">{erro}</Aviso>}
      </div>
    </Folha>
  );
}

function Receber({ r, onFechar, onDistribuir }: { r: AReceber; onFechar: () => void; onDistribuir: (p: PedidoDistribuicao) => void }) {
  if (ehDoNfc(r.movId)) return (
    <Folha aberta onFechar={onFechar} titulo="Recebimento de venda das placas" rodape={<a href={URL_APP_NFC} className="flex h-11 w-full items-center justify-center rounded-xl bg-accent font-semibold text-accent-ink">Abrir Plaquinhas NFC</a>}>
      <p className="pb-2 text-[15px] leading-relaxed text-muted">{r.descricao}: faltam {brl(r.valor)}. Registre o recebimento no app Plaquinhas NFC (A receber → Recebi). O Finanças atualiza o caixa do negócio sozinho.</p>
    </Folha>
  );
  return <ReceberAqui r={r} onFechar={onFechar} onDistribuir={onDistribuir} />;
}

function ReceberAqui({ r, onFechar, onDistribuir }: { r: AReceber; onFechar: () => void; onDistribuir: (p: PedidoDistribuicao) => void }) {
  const { d, sit, hoje } = useApp();
  const { toast } = useUi();
  const mov = d.movimentos.find((m) => m.id === r.movId);
  const [valor, setValor] = useState<Cents | null>(r.valor);
  const [contaId, setContaId] = useState<string>(((mov as { contaId?: string } | undefined)?.contaId) || d.contas[0]?.id || "");
  const [data, setData] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    setErro(null);
    try {
      if (r.origem === "venda") {
        if (!valor || valor <= 0) { setErro("Coloque o valor recebido."); return; }
        await receberVenda(db(), r.movId, { valor, data, contaId });
        const v = d.movimentos.find((m) => m.id === r.movId);
        toast(v && v.tipo === "venda" && totaisVenda(v).aReceber - valor <= 0 ? "Venda quitada" : `Recebido ${brl(valor)}`);
        onFechar();
      } else {
        await marcarRecebida(db(), r.movId, contaId, data);
        toast("Recebimento confirmado");
        onFechar();
        const fonteId = mov?.tipo === "receita" ? mov.fonteId : null;
        onDistribuir({ valor: r.valor, receitaId: r.movId, fonteId, titulo: `Distribuir ${brl(r.valor)}` });
      }
    } catch (e) { setErro(e instanceof ErroValidacao ? e.problemas.join(" ") : (e as Error).message); }
  };
  return (
    <Folha aberta onFechar={onFechar} titulo="Registrar recebimento" rodape={<Button className="w-full" onClick={salvar}>Confirmar</Button>}>
      <div className="flex flex-col gap-4">
        <div className="text-[14px] text-muted">{r.descricao} · previsto para {br(r.previsto)}</div>
        {r.origem === "venda" ? <Campo rotulo="Quanto recebeu" dica={`Falta receber ${brl(r.valor)}. Pode ser parcial.`}><Dinheiro value={valor} onChange={setValor} grande /></Campo> : <div className="rounded-2xl bg-surface-2 p-4"><Money c={r.valor} className="font-display text-[26px] font-semibold" /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Entrou em"><Selecao value={contaId} onChange={setContaId} opcoes={d.contas.filter((x) => !x.arquivada).map((x) => ({ valor: x.id, rotulo: x.nome }))} /></Campo>
          <Campo rotulo="Data"><Data value={data} onChange={setData} /></Campo>
        </div>
        {r.origem === "venda" && <Aviso tom="info">Dinheiro de venda vai para o envelope do negócio ({brl(sit.saldoEnv(sit.env.negocio))} hoje). Para usar com você, faça uma retirada.</Aviso>}
        {erro && <Aviso tom="bad">{erro}</Aviso>}
      </div>
    </Folha>
  );
}
