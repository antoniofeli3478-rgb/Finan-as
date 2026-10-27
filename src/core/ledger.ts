// O livro-caixa: transforma cada movimentação em lançamentos e soma os saldos.
// É o ÚNICO lugar que decide como uma movimentação mexe em contas e envelopes.

import type { Cents } from "./money";
import type { Dados, Envelope, ID, Movimento, TipoEnvelope, Venda } from "./types";

export interface Lancamento {
  contaId?: ID;
  envelopeId?: ID;
  valor: Cents;
}

/**
 * Lançamentos de uma movimentação.
 * - Lançamento em conta = dinheiro que entrou ou saiu do banco/carteira.
 * - Lançamento em envelope = mudança de finalidade do dinheiro.
 * Dinheiro que entra numa conta sem ir para envelope fica "a distribuir".
 */
export function lancamentos(m: Movimento): Lancamento[] {
  switch (m.tipo) {
    case "receita":
      // Recebimento pendente não muda saldo nenhum (regra 4)
      if (m.status !== "recebida") return [];
      // Venda de um negócio: o dinheiro já nasce no caixa do negócio
      return m.negocioId ? [{ contaId: m.contaId, valor: m.valor }, { envelopeId: m.negocioId, valor: m.valor }] : [{ contaId: m.contaId, valor: m.valor }];
    case "despesa":
      // Despesa pendente é compromisso, não saída (regra 3)
      if (m.status !== "paga" || !m.contaId) return [];
      return [{ contaId: m.contaId, valor: -m.valor }, { envelopeId: m.envelopeId, valor: -m.valor }];
    case "transferencia":
      // Entre contas próprias: não é receita nem despesa (regra 1)
      return [{ contaId: m.deContaId, valor: -m.valor }, { contaId: m.paraContaId, valor: m.valor }];
    case "envelope":
      // Só muda a finalidade: nenhuma conta é tocada (regra 9)
      return m.itens.map((i) => ({ envelopeId: i.envelopeId, valor: i.valor }));
    case "cartao_compra":
      // Compra no cartão não sai do banco agora: vira compromisso na fatura
      return [];
    case "cartao_pagamento":
      // Pagar a fatura tira do banco, mas NÃO é despesa nova (regra 5)
      return [{ contaId: m.contaId, valor: -m.valor }, { envelopeId: m.envelopeId, valor: -m.valor }];
    case "estoque_compra":
      if (m.status !== "paga" || !m.contaId) return [];
      return [{ contaId: m.contaId, valor: -m.valor }, { envelopeId: m.envelopeId, valor: -m.valor }];
    case "venda": {
      if (m.cancelada) return [];
      const ls: Lancamento[] = [];
      // Só o que foi recebido de verdade entra no caixa (regra 4)
      for (const r of m.recebimentos) ls.push({ contaId: r.contaId, valor: r.valor }, { envelopeId: m.envelopeId, valor: r.valor });
      if (m.despesasDiretas > 0 && m.contaDespesasId) {
        ls.push({ contaId: m.contaDespesasId, valor: -m.despesasDiretas }, { envelopeId: m.envelopeId, valor: -m.despesasDiretas });
      }
      return ls;
    }
    case "investimento": {
      // Investir não é despesa de consumo (regra 10): o dinheiro sai do caixa e vira investimento
      const s = m.direcao === "aporte" ? -1 : 1;
      const ls: Lancamento[] = [{ contaId: m.contaId, valor: s * m.valor }];
      if (m.envelopeId) ls.push({ envelopeId: m.envelopeId, valor: s * m.valor });
      return ls;
    }
    case "ajuste":
      return [{ contaId: m.contaId, valor: m.valor }];
  }
}

export interface Saldos {
  contas: Record<ID, Cents>;
  envelopes: Record<ID, Cents>;
  /** Soma de todas as contas. */
  caixa: Cents;
  /** Soma dos envelopes. */
  alocado: Cents;
  /** Dinheiro nas contas que ainda não tem finalidade. Negativo = envelopes somam mais que o dinheiro. */
  aDistribuir: Cents;
}

export function calcularSaldos(d: Pick<Dados, "contas" | "envelopes" | "movimentos">): Saldos {
  const contas: Record<ID, Cents> = {};
  const envelopes: Record<ID, Cents> = {};
  for (const c of d.contas) contas[c.id] = c.saldoInicial;
  for (const e of d.envelopes) envelopes[e.id] = 0;
  for (const m of d.movimentos) {
    for (const l of lancamentos(m)) {
      if (l.contaId) contas[l.contaId] = (contas[l.contaId] ?? 0) + l.valor;
      if (l.envelopeId) envelopes[l.envelopeId] = (envelopes[l.envelopeId] ?? 0) + l.valor;
    }
  }
  const caixa = Object.values(contas).reduce((a, b) => a + b, 0);
  const alocado = Object.values(envelopes).reduce((a, b) => a + b, 0);
  return { contas, envelopes, caixa, alocado, aDistribuir: caixa - alocado };
}

/** Histórico de um envelope, com o saldo depois de cada lançamento (regra 11). */
export function extratoEnvelope(movs: Movimento[], envelopeId: ID) {
  const linhas: { mov: Movimento; valor: Cents; saldo: Cents }[] = [];
  let saldo = 0;
  for (const m of ordenar(movs)) {
    const v = lancamentos(m).filter((l) => l.envelopeId === envelopeId).reduce((a, l) => a + l.valor, 0);
    if (v !== 0) { saldo += v; linhas.push({ mov: m, valor: v, saldo }); }
  }
  return linhas;
}

export function extratoConta(movs: Movimento[], contaId: ID, saldoInicial: Cents) {
  const linhas: { mov: Movimento; valor: Cents; saldo: Cents }[] = [];
  let saldo = saldoInicial;
  for (const m of ordenar(movs)) {
    const v = lancamentos(m).filter((l) => l.contaId === contaId).reduce((a, l) => a + l.valor, 0);
    if (v !== 0) { saldo += v; linhas.push({ mov: m, valor: v, saldo }); }
  }
  return linhas;
}

export function ordenar(movs: Movimento[]): Movimento[] {
  return [...movs].sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm - b.criadoEm);
}

export const envelopeDoTipo = (envs: Envelope[], tipo: TipoEnvelope) => envs.find((e) => e.tipo === tipo && !e.arquivado) ?? envs.find((e) => e.tipo === tipo);

/** Totais de uma venda. */
export function totaisVenda(v: Venda) {
  const bruto = v.qtd * v.precoUnit - v.desconto;
  const recebido = v.recebimentos.reduce((a, r) => a + r.valor, 0);
  const aReceber = v.cancelada ? 0 : Math.max(0, bruto - recebido);
  const status: "cancelada" | "recebida" | "parcial" | "pendente" = v.cancelada ? "cancelada" : recebido >= bruto ? "recebida" : recebido > 0 ? "parcial" : "pendente";
  return { bruto, recebido, aReceber, status };
}
