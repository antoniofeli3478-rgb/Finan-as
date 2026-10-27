// Banco de dados local (IndexedDB, via Dexie). Fica só neste navegador/aparelho.
//
// Versionamento: cada mudança de estrutura ganha um novo this.version(n) com .upgrade().
// O Dexie roda as migrações em ordem na primeira vez que a versão nova abre.

import Dexie, { type Table } from "dexie";
import type { Cartao, Config, Conta, Envelope, Investimento, Movimento, Produto, Recorrencia } from "../core/types";

export class FinDB extends Dexie {
  contas!: Table<Conta, string>;
  envelopes!: Table<Envelope, string>;
  movimentos!: Table<Movimento, string>;
  recorrencias!: Table<Recorrencia, string>;
  cartoes!: Table<Cartao, string>;
  produtos!: Table<Produto, string>;
  investimentos!: Table<Investimento, string>;
  config!: Table<Config, string>;

  constructor(nome: string) {
    super(nome);
    this.version(1).stores({
      contas: "id",
      envelopes: "id",
      movimentos: "id, tipo, data",
      recorrencias: "id",
      cartoes: "id",
      produtos: "id",
      investimentos: "id",
      config: "id",
    });
  }
}

export const TABELAS = ["contas", "envelopes", "movimentos", "recorrencias", "cartoes", "produtos", "investimentos", "config"] as const;

export const NOME_REAL = "gerente-financeiro";
export const NOME_DEMO = "gerente-financeiro-demo";

/** Modo demonstração usa OUTRO banco: os exemplos nunca se misturam com seus dados. */
export function modoAtual(): "real" | "demo" {
  try { return localStorage.getItem("gf:modo") === "demo" ? "demo" : "real"; } catch { return "real"; }
}
export function definirModo(m: "real" | "demo") {
  try { localStorage.setItem("gf:modo", m); } catch { /* sem armazenamento: fica no modo real */ }
}

let atual: FinDB | null = null;
export function db(): FinDB {
  if (!atual) atual = new FinDB(modoAtual() === "demo" ? NOME_DEMO : NOME_REAL);
  return atual;
}
