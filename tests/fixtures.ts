// Dados fictícios para os testes.
import { configInicial, envelopesIniciais, ENV } from "../src/core/defaults";
import type { Cartao, Conta, Dados, Movimento, Produto } from "../src/core/types";

let seq = 0;
export const id = (p = "m") => `${p}-${++seq}`;

export function base(): Dados {
  const contas: Conta[] = [
    { id: "inter", nome: "Banco Inter", tipo: "banco", saldoInicial: 0, arquivada: false, ordem: 1, conferido: null },
    { id: "carteira", nome: "Carteira", tipo: "dinheiro", saldoInicial: 0, arquivada: false, ordem: 2, conferido: null },
  ];
  const cartoes: Cartao[] = [{ id: "cartao", nome: "Inter", limite: 200000, fechamentoDia: 10, vencimentoDia: 17, arquivado: false }];
  const produtos: Produto[] = [{ id: "google", nome: "Placa Google", categoria: "Google", precoVenda: 8000, custoReferencia: 1400, custoHistorico: [], custoAdicional: 0, estoqueMinimo: 5, ativo: true }];
  return { contas, envelopes: envelopesIniciais(), movimentos: [], recorrencias: [], cartoes, produtos, investimentos: [], config: configInicial() };
}

const t0 = 1_700_000_000_000;
export function mov<T extends Movimento>(m: Omit<T, "id" | "criadoEm" | "atualizadoEm" | "descricao"> & { id?: string; descricao?: string }): T {
  return { descricao: "", id: id(), criadoEm: t0 + seq, atualizadoEm: t0 + seq, ...m } as T;
}

export { ENV };
