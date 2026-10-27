// Contas recorrentes: gera as próximas ocorrências como contas a pagar, sem duplicar.
// O campo "geradoAte" guarda até onde já foi gerado. Se você apagar uma ocorrência,
// ela não volta ao reabrir o app.

import { addDias, addMeses, diffDias, type ISODate } from "./dates";
import type { Despesa, Recorrencia } from "./types";

export function proximaData(r: Recorrencia, d: ISODate): ISODate {
  const n = Math.max(1, r.intervalo || 1);
  const dia = Number(r.inicio.slice(8, 10));
  switch (r.frequencia) {
    case "semanal": return addDias(d, 7 * n);
    case "dias": return addDias(d, n);
    case "mensal": return addMeses(d, n, dia);
    case "anual": return addMeses(d, 12 * n, dia);
  }
}

/** Datas que ainda precisam virar conta a pagar, até "ate" (inclusive). */
export function datasParaGerar(r: Recorrencia, ate: ISODate): ISODate[] {
  if (!r.ativa) return [];
  const out: ISODate[] = [];
  let d = r.inicio;
  let guard = 0;
  while (diffDias(d, ate) <= 0 && guard++ < 1000) {
    if (!r.geradoAte || d > r.geradoAte) out.push(d);
    d = proximaData(r, d);
  }
  return out;
}

/** Ocorrências novas, ignorando qualquer data que já exista (proteção extra contra duplicata). */
export function ocorrenciasNovas(r: Recorrencia, existentes: Despesa[], ate: ISODate): ISODate[] {
  const ja = new Set(existentes.filter((e) => e.recorrenciaId === r.id).map((e) => e.ocorrencia));
  return datasParaGerar(r, ate).filter((d) => !ja.has(d));
}
