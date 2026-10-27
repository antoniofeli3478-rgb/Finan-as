// Cartão de crédito: em que fatura cai cada compra e cada parcela, e quanto falta pagar.
//
// Convenção: a fatura é identificada pelo MÊS DE FECHAMENTO ("AAAA-MM").
// Compra feita ANTES do dia de fechamento cai na fatura que fecha naquele mês.
// Compra NO dia de fechamento ou depois cai na fatura seguinte (por isso o
// "melhor dia de compra" é o próprio dia de fechamento).

import { dividir, type Cents } from "./money";
import { addMesKey, diffDias, fromParts, type ISODate } from "./dates";
import type { Cartao, CompraCartao, ID, Movimento, PagamentoFatura } from "./types";

export function faturaDaCompra(data: ISODate, c: Pick<Cartao, "fechamentoDia">): string {
  const [y, m, d] = data.split("-").map(Number);
  const key = `${y}-${String(m).padStart(2, "0")}`;
  return d < c.fechamentoDia ? key : addMesKey(key, 1);
}

export function datasDaFatura(key: string, c: Pick<Cartao, "fechamentoDia" | "vencimentoDia">) {
  const [y, m] = key.split("-").map(Number);
  const fechamento = fromParts(y, m, c.fechamentoDia);
  const vencimento = c.vencimentoDia > c.fechamentoDia ? fromParts(y, m, c.vencimentoDia) : fromParts(y, m + 1, c.vencimentoDia);
  return { fechamento, vencimento };
}

export const melhorDiaDeCompra = (c: Pick<Cartao, "fechamentoDia">) => c.fechamentoDia;

export interface Parcela { compraId: ID; fatura: string; numero: number; de: number; valor: Cents; descricao: string; data: ISODate; categoria: string }

/** Parcelas de uma compra, cada uma na fatura certa (regra 16). */
export function parcelasDe(compra: CompraCartao, c: Cartao): Parcela[] {
  const n = Math.max(1, Math.floor(compra.parcelas || 1));
  const primeira = faturaDaCompra(compra.data, c);
  return dividir(compra.valor, n).map((valor, i) => ({
    compraId: compra.id, fatura: addMesKey(primeira, i), numero: i + 1, de: n, valor,
    descricao: compra.descricao, data: compra.data, categoria: compra.categoria,
  }));
}

export type StatusFatura = "aberta" | "futura" | "fechada" | "vencida" | "paga";

export interface Fatura {
  cartaoId: ID;
  key: string;
  fechamento: ISODate;
  vencimento: ISODate;
  parcelas: Parcela[];
  total: Cents;
  pago: Cents;
  saldo: Cents;
  status: StatusFatura;
}

export function faturasDoCartao(c: Cartao, movs: Movimento[], hoje: ISODate): Fatura[] {
  const compras = movs.filter((m): m is CompraCartao => m.tipo === "cartao_compra" && m.cartaoId === c.id);
  const pagamentos = movs.filter((m): m is PagamentoFatura => m.tipo === "cartao_pagamento" && m.cartaoId === c.id);
  const mapa = new Map<string, Parcela[]>();
  for (const compra of compras) for (const p of parcelasDe(compra, c)) {
    if (!mapa.has(p.fatura)) mapa.set(p.fatura, []);
    mapa.get(p.fatura)!.push(p);
  }
  for (const p of pagamentos) if (!mapa.has(p.fatura)) mapa.set(p.fatura, []);
  // A fatura atual sempre aparece, mesmo vazia
  const atual = faturaDaCompra(hoje, c);
  if (!mapa.has(atual)) mapa.set(atual, []);
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, parcelas]) => {
    const { fechamento, vencimento } = datasDaFatura(key, c);
    const total = parcelas.reduce((a, p) => a + p.valor, 0);
    const pago = pagamentos.filter((p) => p.fatura === key).reduce((a, p) => a + p.valor, 0);
    const saldo = total - pago;
    // A fatura "atual" é a que ainda não fechou; as anteriores já fecharam.
    let status: StatusFatura;
    if (key > atual) status = "futura";
    else if (key === atual) status = "aberta";
    else if (saldo <= 0) status = "paga";
    else if (diffDias(hoje, vencimento) > 0) status = "vencida";
    else status = "fechada";
    return { cartaoId: c.id, key, fechamento, vencimento, parcelas, total, pago, saldo, status };
  });
}

/** Quanto do limite está usado: tudo que foi comprado e ainda não foi pago. */
export function limiteUsado(c: Cartao, movs: Movimento[]): Cents {
  const comprado = movs.filter((m) => m.tipo === "cartao_compra" && m.cartaoId === c.id).reduce((a, m) => a + (m as CompraCartao).valor, 0);
  const pago = movs.filter((m) => m.tipo === "cartao_pagamento" && m.cartaoId === c.id).reduce((a, m) => a + (m as PagamentoFatura).valor, 0);
  return Math.max(0, comprado - pago);
}
