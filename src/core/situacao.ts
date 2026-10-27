// A foto da sua vida financeira agora. Todas as telas leem DAQUI, para que o
// dashboard, o consultor e os relatórios nunca usem fórmulas diferentes.

import type { Cents } from "./money";
import { addDias, diffDias, type ISODate } from "./dates";
import type { CompraEstoque, Dados, Despesa, Envelope, Escopo, ID, Receita, Recorrencia, Venda } from "./types";
import { calcularSaldos, envelopeDoTipo, totaisVenda, type Saldos } from "./ledger";
import { faturasDoCartao, limiteUsado, type Fatura } from "./cartao";
import { calcularEstoque, reposicaoNecessaria, type ResultadoEstoque } from "./estoque";

export interface Compromisso {
  chave: string;
  origem: "despesa" | "estoque" | "fatura";
  movId?: ID;
  cartaoId?: ID;
  fatura?: string;
  descricao: string;
  valor: Cents;
  vencimento: ISODate;
  escopo: Escopo;
  prioridade: 1 | 2 | 3;
  envelopeId: ID | null;
  atrasado: boolean;
  estimado?: boolean;
}

export interface AReceber {
  origem: "receita" | "venda";
  movId: ID;
  descricao: string;
  valor: Cents;
  previsto: ISODate;
  atrasado: boolean;
  escopo: Escopo;
}

export interface Meta {
  envelope: Envelope;
  saldo: Cents;
  meta: Cents | null;
  pct: number;
  falta: Cents;
}

export interface Situacao {
  hoje: ISODate;
  horizonte: ISODate;
  saldos: Saldos;
  env: { obrigacoes?: Envelope; negocio?: Envelope; pc?: Envelope; reserva?: Envelope; investimentos?: Envelope; livre?: Envelope };
  saldoEnv: (e?: Envelope | null) => Cents;
  compromissos: Compromisso[];
  aReceber: AReceber[];
  faturas: Record<ID, Fatura[]>;
  limiteUsado: Record<ID, Cents>;
  estoque: ResultadoEstoque;
  reposicao: ReturnType<typeof reposicaoNecessaria>;
  cobertura: {
    pessoal: { necessario: Cents; reservado: Cents; descoberto: Cents };
    negocio: { necessario: Cents; reservado: Cents; descoberto: Cents };
  };
  /** Dinheiro que dá para gastar sem mexer em contas, metas ou no negócio. Pode ser negativo. */
  livreReal: Cents;
  livreDetalhe: { envelopeLivre: Cents; contasDescobertas: Cents; envelopesNegativos: Cents; faltaDistribuir: Cents };
  reservado: Cents;
  totalAPagar: Cents;
  totalAReceber: Cents;
  faturaAtual: Cents;
  investimentos: { valorAtual: Cents; aportado: Cents; porId: Record<ID, { aportado: Cents }> };
  capitalNegocio: { caixa: Cents; estoque: Cents; aReceber: Cents; total: Cents };
  patrimonio: { caixa: Cents; investimentos: Cents; dividas: Cents; total: Cents };
  metas: Meta[];
  despesasEssenciaisMes: Cents;
}

/** Valor mensal equivalente de uma conta recorrente. */
export function mensalEquivalente(r: Recorrencia): Cents {
  const n = Math.max(1, r.intervalo || 1);
  switch (r.frequencia) {
    case "mensal": return Math.round(r.valor / n);
    case "anual": return Math.round(r.valor / (12 * n));
    case "semanal": return Math.round((r.valor * 52) / (12 * n));
    case "dias": return Math.round((r.valor * 30) / n);
  }
}

export function calcularSituacao(d: Dados, hoje: ISODate): Situacao {
  const horizonte = addDias(hoje, d.config.horizonteDias || 30);
  const saldos = calcularSaldos(d);
  const env = {
    obrigacoes: envelopeDoTipo(d.envelopes, "obrigacoes"),
    negocio: envelopeDoTipo(d.envelopes, "negocio"),
    pc: envelopeDoTipo(d.envelopes, "pc"),
    reserva: envelopeDoTipo(d.envelopes, "reserva"),
    investimentos: envelopeDoTipo(d.envelopes, "investimentos"),
    livre: envelopeDoTipo(d.envelopes, "livre"),
  };
  const saldoEnv = (e?: Envelope | null) => (e ? saldos.envelopes[e.id] ?? 0 : 0);

  // ── Compromissos (a pagar) ──
  const compromissos: Compromisso[] = [];
  for (const m of d.movimentos) {
    if (m.tipo === "despesa" && (m as Despesa).status === "pendente") {
      const x = m as Despesa;
      const venc = x.vencimento || x.data;
      compromissos.push({ chave: "d:" + x.id, origem: "despesa", movId: x.id, descricao: x.descricao, valor: x.valor, vencimento: venc, escopo: x.escopo, prioridade: x.prioridade ?? 2, envelopeId: x.envelopeId, atrasado: diffDias(hoje, venc) > 0, estimado: x.estimado });
    }
    if (m.tipo === "estoque_compra" && (m as CompraEstoque).status === "pendente") {
      const x = m as CompraEstoque;
      const venc = x.vencimento || x.data;
      compromissos.push({ chave: "e:" + x.id, origem: "estoque", movId: x.id, descricao: x.descricao || "Compra de estoque", valor: x.valor, vencimento: venc, escopo: "negocio", prioridade: 2, envelopeId: x.envelopeId, atrasado: diffDias(hoje, venc) > 0 });
    }
  }
  const faturas: Record<ID, Fatura[]> = {};
  const usado: Record<ID, Cents> = {};
  let faturaAtual = 0;
  for (const c of d.cartoes) {
    const fs = faturasDoCartao(c, d.movimentos, hoje);
    faturas[c.id] = fs;
    usado[c.id] = limiteUsado(c, d.movimentos);
    for (const f of fs) {
      if (f.status === "aberta") faturaAtual += Math.max(0, f.saldo);
      if (f.saldo > 0) {
        compromissos.push({ chave: `f:${c.id}:${f.key}`, origem: "fatura", cartaoId: c.id, fatura: f.key, descricao: `Fatura ${c.nome}`, valor: f.saldo, vencimento: f.vencimento, escopo: "pessoal", prioridade: 1, envelopeId: env.obrigacoes?.id ?? null, atrasado: f.status === "vencida" });
      }
    }
  }
  compromissos.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.prioridade - b.prioridade);

  // ── A receber ──
  const aReceber: AReceber[] = [];
  for (const m of d.movimentos) {
    if (m.tipo === "receita" && (m as Receita).status === "pendente") {
      const x = m as Receita;
      const prev = x.previstaPara || x.data;
      aReceber.push({ origem: "receita", movId: x.id, descricao: x.descricao, valor: x.valor, previsto: prev, atrasado: diffDias(hoje, prev) > 0, escopo: "pessoal" });
    }
    if (m.tipo === "venda") {
      const v = m as Venda;
      const t = totaisVenda(v);
      if (t.aReceber > 0) {
        const prev = v.previstaPara || v.data;
        aReceber.push({ origem: "venda", movId: v.id, descricao: v.cliente ? `Venda para ${v.cliente}` : v.descricao || "Venda", valor: t.aReceber, previsto: prev, atrasado: diffDias(hoje, prev) > 0, escopo: "negocio" });
      }
    }
  }
  aReceber.sort((a, b) => a.previsto.localeCompare(b.previsto));

  // ── Cobertura: as contas próximas já têm dinheiro separado? ──
  const proximos = (esc: Escopo) => compromissos.filter((c) => c.escopo === esc && c.vencimento <= horizonte).reduce((a, c) => a + c.valor, 0);
  const cob = (necessario: Cents, reservado: Cents) => ({ necessario, reservado, descoberto: Math.max(0, necessario - Math.max(0, reservado)) });
  const cobertura = {
    pessoal: cob(proximos("pessoal"), saldoEnv(env.obrigacoes)),
    negocio: cob(proximos("negocio"), saldoEnv(env.negocio)),
  };

  // ── Dinheiro livre de verdade ──
  const envelopeLivre = saldoEnv(env.livre);
  const envelopesNegativos = d.envelopes.filter((e) => e.id !== env.livre?.id).reduce((a, e) => a + Math.min(0, saldos.envelopes[e.id] ?? 0), 0);
  const faltaDistribuir = Math.min(0, saldos.aDistribuir);
  const livreReal = envelopeLivre - cobertura.pessoal.descoberto + envelopesNegativos + faltaDistribuir;
  const reservado = d.envelopes.filter((e) => e.id !== env.livre?.id).reduce((a, e) => a + Math.max(0, saldos.envelopes[e.id] ?? 0), 0);

  // ── Investimentos ──
  const porId: Record<ID, { aportado: Cents }> = {};
  for (const i of d.investimentos) porId[i.id] = { aportado: 0 };
  for (const m of d.movimentos) if (m.tipo === "investimento") {
    (porId[m.investimentoId] ??= { aportado: 0 }).aportado += m.direcao === "aporte" ? m.valor : -m.valor;
  }
  const valorInvest = d.investimentos.filter((i) => !i.arquivado).reduce((a, i) => a + i.valorAtual, 0);
  const aportado = Object.values(porId).reduce((a, x) => a + x.aportado, 0);

  // ── Estoque e negócio ──
  const estoque = calcularEstoque(d.produtos, d.movimentos);
  const reposicao = reposicaoNecessaria(d.produtos, estoque);
  const valorEstoque = Object.values(estoque.porProduto).reduce((a, p) => a + p.custoTotal, 0);
  const receberNegocio = aReceber.filter((r) => r.escopo === "negocio").reduce((a, r) => a + r.valor, 0);
  const caixaNegocio = saldoEnv(env.negocio);

  const totalAPagar = compromissos.reduce((a, c) => a + c.valor, 0);
  const totalAReceber = aReceber.reduce((a, r) => a + r.valor, 0);

  // Patrimônio financeiro: dinheiro + investimentos − dívidas já assumidas.
  // NÃO entram: limite do cartão, valores a receber, estoque (mostrados à parte).
  const dividas = totalAPagar;
  const patrimonio = { caixa: saldos.caixa, investimentos: valorInvest, dividas, total: saldos.caixa + valorInvest - dividas };

  // ── Metas ──
  const essenciais = d.recorrencias.filter((r) => r.ativa && r.escopo === "pessoal" && r.prioridade === 1).reduce((a, r) => a + mensalEquivalente(r), 0);
  const metas: Meta[] = d.envelopes.filter((e) => !e.arquivado && (e.meta != null || e.tipo === "reserva" || e.tipo === "pc" || e.tipo === "objetivo")).map((e) => {
    const saldo = saldos.envelopes[e.id] ?? 0;
    const meta = metaDoEnvelope(e, essenciais);
    return { envelope: e, saldo, meta, pct: meta ? Math.max(0, Math.min(100, (saldo / meta) * 100)) : 0, falta: meta ? Math.max(0, meta - saldo) : 0 };
  });

  return {
    hoje, horizonte, saldos, env, saldoEnv, compromissos, aReceber, faturas, limiteUsado: usado, estoque, reposicao, cobertura,
    livreReal, livreDetalhe: { envelopeLivre, contasDescobertas: cobertura.pessoal.descoberto, envelopesNegativos, faltaDistribuir },
    reservado, totalAPagar, totalAReceber, faturaAtual,
    investimentos: { valorAtual: valorInvest, aportado, porId },
    capitalNegocio: { caixa: caixaNegocio, estoque: valorEstoque, aReceber: receberNegocio, total: caixaNegocio + valorEstoque },
    patrimonio, metas, despesasEssenciaisMes: essenciais,
  };
}

export function metaDoEnvelope(e: Envelope, essenciaisMes: Cents): Cents | null {
  if (e.tipo === "reserva" && e.metaModo === "despesas") return essenciaisMes > 0 ? essenciaisMes * (e.mesesReserva || 3) : null;
  if (e.tipo === "negocio") return e.minimo ?? null;
  return e.meta;
}
