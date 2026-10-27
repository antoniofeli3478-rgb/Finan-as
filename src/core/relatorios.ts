// Relatórios por período e projeções com premissas explícitas.
//
// Gastos de consumo = despesas (pagas ou a pagar, pela data) + compras no cartão (pela data da compra).
// NÃO entram como gasto: pagamento de fatura (a compra já contou), transferências, compras de estoque
// (viram estoque), aportes em investimentos e mudanças entre envelopes.

import { addDias, addMesKey, diffDias, inicioSemana, mesDe, type ISODate } from "./dates";
import { type Cents } from "./money";
import type { CompraCartao, Dados, Despesa, Escopo, ID, Receita } from "./types";
import { lancamentos, ordenar } from "./ledger";
import { indicadores } from "./negocio";
import type { Situacao } from "./situacao";

export interface Gasto { categoria: string; escopo: Escopo; valor: Cents; origem: "despesa" | "cartao" | "venda" }

export function gastosNoPeriodo(d: Dados, ini: ISODate, fim: ISODate): Gasto[] {
  const out: Gasto[] = [];
  for (const m of d.movimentos) {
    if (m.data < ini || m.data > fim) continue;
    if (m.tipo === "despesa") out.push({ categoria: (m as Despesa).categoria, escopo: (m as Despesa).escopo, valor: m.valor, origem: "despesa" });
    if (m.tipo === "cartao_compra") out.push({ categoria: (m as CompraCartao).categoria, escopo: (m as CompraCartao).escopo, valor: m.valor, origem: "cartao" });
    if (m.tipo === "venda" && !m.cancelada && m.despesasDiretas > 0) out.push({ categoria: "Despesas de venda", escopo: "negocio", valor: m.despesasDiretas, origem: "venda" });
  }
  return out;
}

export function receitasNoPeriodo(d: Dados, ini: ISODate, fim: ISODate) {
  return d.movimentos.filter((m): m is Receita => m.tipo === "receita" && m.data >= ini && m.data <= fim);
}

export function relatorioPeriodo(d: Dados, sit: Situacao, ini: ISODate, fim: ISODate) {
  const receitas = receitasNoPeriodo(d, ini, fim);
  const porFonte: Record<ID, Cents> = {};
  for (const r of receitas) porFonte[r.fonteId] = (porFonte[r.fonteId] ?? 0) + r.valor;
  const receitasPessoais = receitas.reduce((a, r) => a + r.valor, 0);
  const recebidas = receitas.filter((r) => r.status === "recebida").reduce((a, r) => a + r.valor, 0);
  const gastos = gastosNoPeriodo(d, ini, fim);
  const porCategoria: Record<string, { escopo: Escopo; valor: Cents }> = {};
  for (const g of gastos) {
    const k = `${g.escopo}:${g.categoria}`;
    (porCategoria[k] ??= { escopo: g.escopo, valor: 0 }).valor += g.valor;
  }
  const gastosPessoais = gastos.filter((g) => g.escopo === "pessoal").reduce((a, g) => a + g.valor, 0);
  const gastosNegocio = gastos.filter((g) => g.escopo === "negocio").reduce((a, g) => a + g.valor, 0);
  const nfc = indicadores(d, sit, ini, fim);
  // Resultado pessoal: o que você ganhou (rendas + lucro do negócio) menos o que consumiu.
  const ganhos = receitasPessoais + nfc.lucroLiquido;
  const resultado = ganhos - gastosPessoais;
  const taxaPoupanca = ganhos > 0 ? resultado / ganhos : null;
  // Aportes em metas no período (dinheiro que foi para PC, reserva, objetivos, investimentos)
  const aportesMetas: Record<ID, Cents> = {};
  for (const m of d.movimentos) if (m.tipo === "envelope" && m.data >= ini && m.data <= fim) {
    for (const i of m.itens) if (i.valor > 0) aportesMetas[i.envelopeId] = (aportesMetas[i.envelopeId] ?? 0) + i.valor;
  }
  return { ini, fim, receitas, porFonte, receitasPessoais, recebidas, gastos, porCategoria, gastosPessoais, gastosNegocio, nfc, ganhos, resultado, taxaPoupanca, aportesMetas };
}

/** Saldo total nas contas no fim de cada um dos últimos n meses. */
export function evolucaoCaixa(d: Dados, hoje: ISODate, n = 12) {
  const atual = mesDe(hoje);
  const keys = Array.from({ length: n }, (_, i) => addMesKey(atual, -(n - 1 - i)));
  const inicial = d.contas.reduce((a, c) => a + c.saldoInicial, 0);
  const movs = ordenar(d.movimentos);
  return keys.map((k) => {
    const fim = `${k}-31`;
    let s = inicial;
    for (const m of movs) { if (m.data > fim) break; for (const l of lancamentos(m)) if (l.contaId) s += l.valor; }
    return { key: k, saldo: s };
  });
}

export function serieReceitasDespesas(d: Dados, sit: Situacao, hoje: ISODate, n = 6) {
  const atual = mesDe(hoje);
  return Array.from({ length: n }, (_, i) => {
    const key = addMesKey(atual, -(n - 1 - i));
    const r = relatorioPeriodo(d, sit, `${key}-01`, `${key}-31`);
    return { key, ganhos: r.ganhos, gastos: r.gastosPessoais + r.gastosNegocio, resultado: r.resultado };
  });
}

/** Aportes por semana num envelope (só entradas positivas). */
export function aportesSemanais(d: Dados, envelopeId: ID, hoje: ISODate, semanas = 8): Cents[] {
  const ini0 = inicioSemana(hoje);
  const out = Array(semanas).fill(0) as Cents[];
  for (const m of d.movimentos) {
    if (m.tipo !== "envelope") continue;
    const idx = semanas - 1 - Math.floor(diffDias(ini0, inicioSemana(m.data)) / 7);
    if (idx < 0 || idx >= semanas) continue;
    for (const i of m.itens) if (i.envelopeId === envelopeId && i.valor > 0) out[idx] += i.valor;
  }
  return out;
}

export interface Cenario { nome: string; porSemana: Cents; semanas: number | null; data: ISODate | null }

/**
 * Cenários para atingir uma meta.
 * Premissas: média das últimas 8 semanas. O intermediário ignora a melhor semana (uma semana
 * excepcional não vira renda garantida); o conservador é 70% do intermediário; o otimista é a média completa.
 * Com menos de 2 semanas com aporte, não há data: os dados não bastam.
 */
export function cenariosMeta(semanais: Cents[], falta: Cents, hoje: ISODate, override?: Partial<Record<"conservador" | "intermediario" | "otimista", Cents>>) {
  const comAporte = semanais.filter((x) => x > 0).length;
  const total = semanais.reduce((a, b) => a + b, 0);
  const n = semanais.length || 1;
  const melhor = Math.max(0, ...semanais);
  const media = Math.floor(total / n);
  const semMelhor = n > 1 ? Math.floor((total - melhor) / (n - 1)) : media;
  const base = { conservador: Math.floor(semMelhor * 0.7), intermediario: semMelhor, otimista: media };
  const valores = { ...base, ...override };
  const suficiente = comAporte >= 2 || override != null;
  const mk = (nome: string, porSemana: Cents): Cenario => {
    if (!suficiente || porSemana <= 0 || falta <= 0) return { nome, porSemana, semanas: falta <= 0 ? 0 : null, data: falta <= 0 ? hoje : null };
    const s = Math.ceil(falta / porSemana);
    return { nome, porSemana, semanas: s, data: addDias(hoje, s * 7) };
  };
  return {
    suficiente, comAporte, base,
    cenarios: [mk("Conservador", valores.conservador), mk("Intermediário", valores.intermediario), mk("Otimista", valores.otimista)],
  };
}
