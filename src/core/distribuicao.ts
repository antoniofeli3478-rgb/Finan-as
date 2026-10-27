// Distribuição de um recebimento entre os envelopes.
// O app PROPÕE; nada é movido até você confirmar (e você pode editar tudo antes).
//
// Ordem:
// 1. Contas pessoais vencidas ou próximas que ainda não têm dinheiro separado.
// 2. Envelopes que ficaram negativos (dinheiro reservado que foi gasto).
// 3. Regras de "necessidade" da estratégia (ex.: capital de giro do negócio, até um teto).
// 4. Regras de porcentagem sobre o que sobrou (PC, reserva...), sem passar da meta.
// 5. O resto vai para o envelope de sobra (normalmente o dinheiro livre).
// Como tudo parte do saldo que cada envelope JÁ tem, a mesma conta nunca é reservada duas vezes.

import { br } from "./dates";
import { brl, pct, type Cents } from "./money";
import type { Dados, Estrategia, ID } from "./types";
import type { Situacao } from "./situacao";

export interface ItemProposta { envelopeId: ID; valor: Cents; motivo: string }

export interface Proposta {
  valor: Cents;
  itens: ItemProposta[];
  /** Quanto faltou para cobrir as necessidades (contas, envelopes negativos). */
  deficit: Cents;
  alertas: string[];
}

export function proporDistribuicao(valor: Cents, estrategia: Estrategia, d: Dados, sit: Situacao): Proposta {
  const itens: ItemProposta[] = [];
  const alertas: string[] = [];
  let resto = Math.max(0, valor);
  let deficit = 0;
  const dar = (envelopeId: ID | undefined, v: Cents, motivo: string) => {
    if (!envelopeId || v <= 0) return 0;
    const x = Math.min(v, resto);
    if (x > 0) { itens.push({ envelopeId, valor: x, motivo }); resto -= x; }
    return x;
  };
  const jaProposto = (id: ID) => itens.filter((i) => i.envelopeId === id).reduce((a, i) => a + i.valor, 0);

  // 1. Contas pessoais sem cobertura
  const obr = sit.env.obrigacoes;
  const desc = sit.cobertura.pessoal.descoberto;
  if (desc > 0 && obr) {
    const vencidas = sit.compromissos.filter((c) => c.escopo === "pessoal" && c.atrasado);
    const dado = dar(obr.id, desc, vencidas.length ? `${vencidas.length} conta(s) vencida(s) e as próximas até ${br(sit.horizonte)}` : `Contas até ${br(sit.horizonte)} ainda sem dinheiro separado`);
    if (dado < desc) {
      deficit += desc - dado;
      alertas.push(`Este valor não cobre todas as contas até ${br(sit.horizonte)}. Ainda faltam ${brl(desc - dado)}.`);
    }
  }
  if (sit.compromissos.some((c) => c.escopo === "pessoal" && c.atrasado)) alertas.push("Há contas vencidas: pague antes de gastar com outras coisas.");

  // 2. Envelopes negativos (exceto o livre, que é tratado no fim)
  for (const e of d.envelopes) {
    const s = sit.saldos.envelopes[e.id] ?? 0;
    if (s < 0 && e.id !== sit.env.livre?.id) {
      const dado = dar(e.id, -s - jaProposto(e.id), `${e.nome} está negativo em ${brl(-s)}`);
      if (dado < -s) deficit += -s - dado;
    }
  }

  // 3. Necessidades da estratégia
  for (const r of estrategia.regras.filter((r) => r.modo === "necessidade")) {
    const e = d.envelopes.find((x) => x.id === r.envelopeId);
    if (!e || e.id === obr?.id) continue;
    const saldo = (sit.saldos.envelopes[e.id] ?? 0) + jaProposto(e.id);
    let necessidade = 0, motivo = "";
    if (e.tipo === "negocio") {
      necessidade = (e.minimo ?? 0) + sit.reposicao.total + sit.cobertura.negocio.necessario - saldo;
      motivo = "Capital de giro, reposição de estoque e contas do negócio";
    } else {
      const m = sit.metas.find((x) => x.envelope.id === e.id)?.meta ?? null;
      necessidade = m != null ? m - saldo : 0;
      motivo = `Completar ${e.nome}`;
    }
    const teto = r.valor > 0 && r.valor < 100 ? pct(valor, r.valor) : Infinity;
    dar(e.id, Math.min(Math.max(0, necessidade), teto), motivo);
  }

  // 4. Porcentagens sobre o que sobrou
  const base = resto;
  for (const r of estrategia.regras.filter((r) => r.modo === "percentual")) {
    const e = d.envelopes.find((x) => x.id === r.envelopeId);
    if (!e) continue;
    let v = pct(base, r.valor);
    const meta = sit.metas.find((x) => x.envelope.id === e.id);
    if (meta?.meta != null) {
      const falta = Math.max(0, meta.meta - meta.saldo - jaProposto(e.id));
      if (v > falta) v = falta;
    }
    dar(e.id, v, `${r.valor}% do que sobrou`);
  }

  // 5. Sobra
  const livre = d.envelopes.find((x) => x.id === estrategia.restoEnvelopeId) ?? sit.env.livre;
  if (resto > 0 && livre) dar(livre.id, resto, "O que sobrou");

  // Junta itens do mesmo envelope
  const junto = new Map<ID, ItemProposta>();
  for (const i of itens) {
    const j = junto.get(i.envelopeId);
    if (j) { j.valor += i.valor; j.motivo += " · " + i.motivo; } else junto.set(i.envelopeId, { ...i });
  }
  if (sit.saldos.aDistribuir - valor > 0) alertas.push(`Além deste valor, ainda há ${brl(sit.saldos.aDistribuir - valor)} a distribuir de antes.`);
  return { valor, itens: [...junto.values()], deficit, alertas };
}

/** Confere uma distribuição editada à mão antes de salvar. */
export function validarDistribuicao(itens: { envelopeId: ID; valor: Cents }[], disponivel: Cents): string | null {
  if (itens.some((i) => !Number.isInteger(i.valor) || i.valor < 0)) return "Os valores precisam ser positivos.";
  const total = itens.reduce((a, i) => a + i.valor, 0);
  if (total > disponivel) return `A distribuição soma ${brl(total)}, mas só há ${brl(disponivel)} para distribuir.`;
  return null;
}
