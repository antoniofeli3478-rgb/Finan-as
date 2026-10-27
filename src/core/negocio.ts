// Negócio NFC: faturamento ≠ dinheiro recebido ≠ lucro.
//
// Faturamento   = o que você vendeu (mesmo que ainda não tenha recebido).
// Recebido      = o que entrou de fato no caixa no período.
// CMV           = custo das placas que saíram (custo médio do estoque + custo adicional).
// Lucro bruto   = faturamento − CMV.
// Lucro líquido = lucro bruto − despesas do negócio (transporte, embalagem, taxas...).
// Comprar estoque NÃO é despesa e NÃO é lucro: o dinheiro vira placa na prateleira (regra 7).

import { addDias, addMesKey, diffDias, inicioSemana, mesDe, type ISODate } from "./dates";
import { brl, type Cents } from "./money";
import type { CompraCartao, Dados, Despesa, ID, Venda } from "./types";
import { totaisVenda } from "./ledger";
import type { Situacao } from "./situacao";

export interface Indicadores {
  faturamento: Cents;
  recebido: Cents;
  unidades: number;
  vendas: number;
  cmv: Cents;
  cmvEstimado: boolean;
  lucroBruto: Cents;
  despesasOperacionais: Cents;
  lucroLiquido: Cents;
  margem: number | null;
  comprasEstoque: Cents;
  porProduto: Record<ID, { unidades: number; faturamento: Cents; lucroBruto: Cents }>;
}

const dentro = (d: ISODate, ini: ISODate, fim: ISODate) => d >= ini && d <= fim;

export function indicadores(d: Dados, sit: Situacao, ini: ISODate, fim: ISODate): Indicadores {
  let faturamento = 0, recebido = 0, unidades = 0, vendas = 0, cmv = 0, despOp = 0, compras = 0, cmvEstimado = false;
  const porProduto: Indicadores["porProduto"] = {};
  for (const m of d.movimentos) {
    if (m.tipo === "venda") {
      const v = m as Venda;
      for (const r of v.recebimentos) if (!v.cancelada && dentro(r.data, ini, fim)) recebido += r.valor;
      if (v.cancelada || !dentro(v.data, ini, fim)) continue;
      const t = totaisVenda(v);
      const c = sit.estoque.cmvVenda[v.id] ?? 0;
      faturamento += t.bruto; unidades += v.qtd; vendas++; cmv += c; despOp += v.despesasDiretas;
      if (sit.estoque.cmvEstimado[v.id]) cmvEstimado = true;
      const pp = (porProduto[v.produtoId] ??= { unidades: 0, faturamento: 0, lucroBruto: 0 });
      pp.unidades += v.qtd; pp.faturamento += t.bruto; pp.lucroBruto += t.bruto - c;
    } else if (m.tipo === "despesa" && (m as Despesa).escopo === "negocio" && dentro(m.data, ini, fim)) {
      despOp += (m as Despesa).valor;
    } else if (m.tipo === "cartao_compra" && (m as CompraCartao).escopo === "negocio" && dentro(m.data, ini, fim)) {
      despOp += (m as CompraCartao).valor;
    } else if (m.tipo === "estoque_compra" && m.status !== "inicial" && dentro(m.data, ini, fim)) {
      compras += m.valor;
    }
  }
  const lucroBruto = faturamento - cmv;
  const lucroLiquido = lucroBruto - despOp;
  return { faturamento, recebido, unidades, vendas, cmv, cmvEstimado, lucroBruto, despesasOperacionais: despOp, lucroLiquido, margem: faturamento > 0 ? lucroLiquido / faturamento : null, comprasEstoque: compras, porProduto };
}

/** Faturamento e lucro das últimas N semanas (segunda a domingo). */
export function serieSemanal(d: Dados, sit: Situacao, hoje: ISODate, n = 8) {
  const ini0 = inicioSemana(hoje);
  return Array.from({ length: n }, (_, i) => {
    const ini = addDias(ini0, -7 * (n - 1 - i)), fim = addDias(ini, 6);
    const x = indicadores(d, sit, ini, fim);
    return { ini, fim, faturamento: x.faturamento, lucro: x.lucroLiquido, unidades: x.unidades };
  });
}

export function serieMensal(d: Dados, sit: Situacao, hoje: ISODate, n = 6) {
  const atual = mesDe(hoje);
  return Array.from({ length: n }, (_, i) => {
    const key = addMesKey(atual, -(n - 1 - i));
    const x = indicadores(d, sit, `${key}-01`, `${key}-31`);
    return { key, faturamento: x.faturamento, lucro: x.lucroLiquido, unidades: x.unidades };
  });
}

/**
 * Quanto dá para tirar do negócio para você sem travar a operação.
 * Desconta: contas do negócio a pagar, reposição do estoque mínimo e o capital de giro mínimo.
 */
export function disponivelParaRetirada(d: Dados, sit: Situacao) {
  const e = sit.env.negocio;
  const caixa = sit.saldoEnv(e);
  const contas = sit.compromissos.filter((c) => c.escopo === "negocio").reduce((a, c) => a + c.valor, 0);
  const reposicao = sit.reposicao.total;
  const minimo = e?.minimo ?? 0;
  const valor = Math.max(0, caixa - contas - reposicao - minimo);
  const provisorio: string[] = [];
  const ativos = d.produtos.filter((p) => p.ativo);
  if (!ativos.length) provisorio.push("Nenhum produto cadastrado: não dá para calcular a reposição.");
  if (ativos.some((p) => !p.custoReferencia)) provisorio.push("Há produtos sem custo cadastrado.");
  if (ativos.length && ativos.every((p) => !p.estoqueMinimo)) provisorio.push("Nenhum produto tem estoque mínimo definido.");
  if (!minimo) provisorio.push("O capital de giro mínimo ainda não foi definido.");
  return { caixa, contas, reposicao, minimo, valor, provisorio };
}

export interface ParamSimulacao {
  unidadesSemana: number;
  preco: Cents;
  custoUnit: Cents;
  custoAdicional: Cents;
  despesasSemana: Cents;
  semanas: number;
  prazoRecebimentoDias: number;
  pctPatrimonio: number;
  estoqueAtual: number;
  faltaMeta: Cents | null;
}

/** "Se eu vender X por semana, quanto gero de lucro e quanto vai para o meu patrimônio?" */
export function simular(p: ParamSimulacao) {
  const u = Math.max(0, Math.floor(p.unidadesSemana));
  const margemUnit = p.preco - p.custoUnit - p.custoAdicional;
  const lucroSemana = u * margemUnit - p.despesasSemana;
  const faturamentoSemana = u * p.preco;
  const semanas = Math.max(1, Math.floor(p.semanas));
  const atrasoSemanas = Math.ceil(Math.max(0, p.prazoRecebimentoDias) / 7);
  // Capital de giro: repor o que vende + bancar as semanas em que o dinheiro ainda não chegou
  const custoReposicaoSemana = u * (p.custoUnit + p.custoAdicional);
  const capitalDeGiro = custoReposicaoSemana * (1 + atrasoSemanas) + p.despesasSemana * atrasoSemanas;
  const estoqueDuraSemanas = u > 0 ? Math.floor(p.estoqueAtual / u) : null;
  const paraPatrimonioSemana = lucroSemana > 0 ? Math.floor((lucroSemana * p.pctPatrimonio) / 100) : 0;
  const semanasRecebendo = Math.max(0, semanas - atrasoSemanas);
  const total = {
    faturamento: faturamentoSemana * semanas,
    lucro: lucroSemana * semanas,
    recebidoNoPeriodo: faturamentoSemana * semanasRecebendo,
    paraPatrimonio: paraPatrimonioSemana * semanas,
    reposicao: custoReposicaoSemana * semanas,
  };
  const semanasMeta = p.faltaMeta != null && p.faltaMeta > 0 && paraPatrimonioSemana > 0 ? Math.ceil(p.faltaMeta / paraPatrimonioSemana) : null;
  const avisos: string[] = [];
  if (margemUnit <= 0) avisos.push(`Com esse preço, cada placa dá prejuízo de ${brl(-margemUnit)}.`);
  if (estoqueDuraSemanas != null && estoqueDuraSemanas < semanas) avisos.push(`O estoque atual acaba em ${estoqueDuraSemanas} semana(s). Você vai precisar comprar mais.`);
  if (atrasoSemanas > 0) avisos.push(`Com ${p.prazoRecebimentoDias} dias para receber, o dinheiro chega ${atrasoSemanas} semana(s) depois da venda.`);
  return { margemUnit, lucroSemana, faturamentoSemana, capitalDeGiro, estoqueDuraSemanas, paraPatrimonioSemana, total, semanasMeta, avisos };
}

/** Ritmo real de vendas: média de unidades por semana nas últimas semanas com dados. */
export function ritmoVendas(d: Dados, hoje: ISODate, semanas = 8) {
  const ini = addDias(inicioSemana(hoje), -7 * (semanas - 1));
  const vendas = d.movimentos.filter((m): m is Venda => m.tipo === "venda" && !m.cancelada && m.data >= ini && m.data <= hoje);
  if (!vendas.length) return null;
  const primeira = vendas.reduce((a, v) => (v.data < a ? v.data : a), hoje);
  const sem = Math.max(1, Math.ceil((diffDias(hoje, primeira) + 1) / 7));
  const unidades = vendas.reduce((a, v) => a + v.qtd, 0);
  const fat = vendas.reduce((a, v) => a + totaisVenda(v).bruto, 0);
  return { unidadesSemana: unidades / sem, precoMedio: unidades ? Math.round(fat / unidades) : 0, semanas: sem };
}
