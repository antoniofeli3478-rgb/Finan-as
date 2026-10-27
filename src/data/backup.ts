// Backup e restauração.
//
// O backup é um arquivo JSON com todas as tabelas. Opcionalmente, ele é protegido com senha:
// a chave sai da senha por PBKDF2 (310 mil rodadas, SHA-256) e os dados são cifrados com AES-GCM.
// Isso protege o ARQUIVO de backup. O banco dentro do navegador não fica cifrado.
//
// Restaurar troca TODOS os dados atuais pelos do arquivo, numa transação: se algo falhar no meio,
// nada muda.

import { z } from "zod";
import { SCHEMA_VERSION } from "../core/defaults";
import type { Dados } from "../core/types";
import { carregarDados } from "./repo";
import type { FinDB } from "./db";

const APP = "gerente-financeiro";

const cents = z.number().int();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const base = { id: z.string().min(1), data, descricao: z.string(), nota: z.string().optional(), criadoEm: z.number(), atualizadoEm: z.number() };

const movimento = z.discriminatedUnion("tipo", [
  z.object({ ...base, tipo: z.literal("receita"), valor: cents, fonteId: z.string(), contaId: z.string(), status: z.enum(["recebida", "pendente"]), previstaPara: data.nullish() }).passthrough(),
  z.object({ ...base, tipo: z.literal("despesa"), valor: cents, categoria: z.string(), escopo: z.enum(["pessoal", "negocio"]), envelopeId: z.string(), status: z.enum(["paga", "pendente"]), contaId: z.string().nullish() }).passthrough(),
  z.object({ ...base, tipo: z.literal("transferencia"), valor: cents, deContaId: z.string(), paraContaId: z.string() }).passthrough(),
  z.object({ ...base, tipo: z.literal("envelope"), origem: z.enum(["distribuicao", "transferencia", "retirada", "aporte"]), itens: z.array(z.object({ envelopeId: z.string(), valor: cents })) }).passthrough(),
  z.object({ ...base, tipo: z.literal("cartao_compra"), valor: cents, cartaoId: z.string(), parcelas: z.number().int().min(1), categoria: z.string(), escopo: z.enum(["pessoal", "negocio"]) }).passthrough(),
  z.object({ ...base, tipo: z.literal("cartao_pagamento"), valor: cents, cartaoId: z.string(), fatura: z.string().regex(/^\d{4}-\d{2}$/), contaId: z.string(), envelopeId: z.string() }).passthrough(),
  z.object({ ...base, tipo: z.literal("estoque_compra"), produtoId: z.string(), qtd: z.number().int(), valor: cents, status: z.enum(["paga", "pendente", "inicial"]), envelopeId: z.string() }).passthrough(),
  z.object({ ...base, tipo: z.literal("venda"), produtoId: z.string(), qtd: z.number().int(), precoUnit: cents, desconto: cents, cancelada: z.boolean(), recebimentos: z.array(z.object({ id: z.string(), valor: cents, data, contaId: z.string() })), despesasDiretas: cents, custoAdicionalUnit: cents, envelopeId: z.string() }).passthrough(),
  z.object({ ...base, tipo: z.literal("investimento"), investimentoId: z.string(), direcao: z.enum(["aporte", "resgate"]), valor: cents, contaId: z.string(), envelopeId: z.string().nullable() }).passthrough(),
  z.object({ ...base, tipo: z.literal("ajuste"), contaId: z.string(), valor: cents }).passthrough(),
]);

const esquema = z.object({
  contas: z.array(z.object({ id: z.string(), nome: z.string(), saldoInicial: cents }).passthrough()),
  envelopes: z.array(z.object({ id: z.string(), nome: z.string(), tipo: z.string() }).passthrough()),
  movimentos: z.array(movimento),
  recorrencias: z.array(z.object({ id: z.string(), nome: z.string(), valor: cents, inicio: data }).passthrough()),
  cartoes: z.array(z.object({ id: z.string(), nome: z.string(), limite: cents, fechamentoDia: z.number().int().min(1).max(31), vencimentoDia: z.number().int().min(1).max(31) }).passthrough()),
  produtos: z.array(z.object({ id: z.string(), nome: z.string(), precoVenda: cents, custoReferencia: cents }).passthrough()),
  investimentos: z.array(z.object({ id: z.string(), nome: z.string(), valorAtual: cents }).passthrough()),
  config: z.object({ id: z.literal("cfg"), fontes: z.array(z.any()), estrategias: z.array(z.any()) }).passthrough(),
});

export interface ArquivoBackup { app: typeof APP; schemaVersion: number; exportadoEm: string; dados: Dados }
interface ArquivoCifrado { app: typeof APP; cifrado: true; schemaVersion: number; exportadoEm: string; kdf: { salt: string; iteracoes: number }; iv: string; dados: string }

export async function gerarBackup(db: FinDB): Promise<ArquivoBackup> {
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportadoEm: new Date().toISOString(), dados: await carregarDados(db) };
}

const b64 = (u: Uint8Array) => {
  // em pedaços: espalhar um arquivo grande de uma vez estoura a pilha
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function chave(senha: string, salt: Uint8Array, iteracoes: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: iteracoes, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function backupComoTexto(db: FinDB, senha?: string): Promise<string> {
  const b = await gerarBackup(db);
  if (!senha) return JSON.stringify(b, null, 1);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iteracoes = 310000;
  const k = await chave(senha, salt, iteracoes);
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, k, new TextEncoder().encode(JSON.stringify(b.dados))));
  const arq: ArquivoCifrado = { app: APP, cifrado: true, schemaVersion: b.schemaVersion, exportadoEm: b.exportadoEm, kdf: { salt: b64(salt), iteracoes }, iv: b64(iv), dados: b64(cifra) };
  return JSON.stringify(arq);
}

export class ErroBackup extends Error {
  constructor(msg: string, public precisaSenha = false) { super(msg); }
}

/** Lê e confere um arquivo de backup. Não grava nada. */
export async function lerBackup(texto: string, senha?: string): Promise<{ dados: Dados; exportadoEm: string; schemaVersion: number }> {
  let bruto: unknown;
  try { bruto = JSON.parse(texto); } catch { throw new ErroBackup("Este arquivo não é um backup válido (não é JSON)."); }
  const o = bruto as Partial<ArquivoCifrado & ArquivoBackup>;
  if (!o || o.app !== APP) throw new ErroBackup("Este arquivo não é um backup do Finanças.");
  if ((o.schemaVersion ?? 0) > SCHEMA_VERSION) throw new ErroBackup("Este backup é de uma versão mais nova do app. Atualize o app antes de restaurar.");
  let dados: unknown = o.dados;
  if (o.cifrado) {
    if (!senha) throw new ErroBackup("Este backup está protegido. Digite a senha.", true);
    try {
      const k = await chave(senha, unb64(o.kdf!.salt), o.kdf!.iteracoes);
      const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv!) as BufferSource }, k, unb64(o.dados as string) as BufferSource);
      dados = JSON.parse(new TextDecoder().decode(plano));
    } catch { throw new ErroBackup("Senha errada ou arquivo corrompido.", true); }
  }
  const r = esquema.safeParse(dados);
  if (!r.success) {
    const p = r.error.issues[0];
    throw new ErroBackup(`O backup tem dados inválidos (${p.path.join(".")}: ${p.message}). Nada foi alterado.`);
  }
  return { dados: migrar(r.data as unknown as Dados, o.schemaVersion ?? 1), exportadoEm: o.exportadoEm ?? "", schemaVersion: o.schemaVersion ?? 1 };
}

/** Migrações de backups antigos. Hoje só existe a versão 1. */
function migrar(d: Dados, _de: number): Dados {
  return d;
}

/** Troca todos os dados pelos do backup (tudo ou nada). */
export async function restaurar(db: FinDB, dados: Dados) {
  await db.transaction("rw", [db.contas, db.envelopes, db.movimentos, db.recorrencias, db.cartoes, db.produtos, db.investimentos, db.config], async () => {
    await Promise.all([db.contas.clear(), db.envelopes.clear(), db.movimentos.clear(), db.recorrencias.clear(), db.cartoes.clear(), db.produtos.clear(), db.investimentos.clear(), db.config.clear()]);
    await db.contas.bulkPut(dados.contas);
    await db.envelopes.bulkPut(dados.envelopes);
    await db.movimentos.bulkPut(dados.movimentos);
    await db.recorrencias.bulkPut(dados.recorrencias);
    await db.cartoes.bulkPut(dados.cartoes);
    await db.produtos.bulkPut(dados.produtos);
    await db.investimentos.bulkPut(dados.investimentos);
    await db.config.put(dados.config);
  });
}

export async function marcarBackupFeito(db: FinDB) {
  await db.config.update("cfg", { ultimoBackup: Date.now() });
}

/** Movimentações em CSV (abre no Excel e no Google Planilhas). */
export function movimentosCSV(d: Dados): string {
  const nomeConta = (id?: string | null) => d.contas.find((c) => c.id === id)?.nome ?? "";
  const nomeEnv = (id?: string | null) => d.envelopes.find((e) => e.id === id)?.nome ?? "";
  const c = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const n = (v: number) => (v / 100).toFixed(2).replace(".", ",");
  const br = (iso: string) => iso.split("-").reverse().join("/");
  const linhas = [["Data", "Tipo", "Descrição", "Valor (R$)", "Situação", "Conta", "Envelope", "Categoria", "Escopo"].map(c).join(";")];
  for (const m of [...d.movimentos].sort((a, b) => a.data.localeCompare(b.data))) {
    const row = (valor: number, situacao: string, conta: string, env: string, cat = "", esc = "") => linhas.push([br(m.data), m.tipo, m.descricao, n(valor), situacao, conta, env, cat, esc].map(c).join(";"));
    switch (m.tipo) {
      case "receita": row(m.valor, m.status, nomeConta(m.contaId), "", d.config.fontes.find((f) => f.id === m.fonteId)?.nome ?? m.fonteId); break;
      case "despesa": row(-m.valor, m.status, nomeConta(m.contaId), nomeEnv(m.envelopeId), m.categoria, m.escopo); break;
      case "transferencia": row(m.valor, "", `${nomeConta(m.deContaId)} → ${nomeConta(m.paraContaId)}`, ""); break;
      case "envelope": row(m.itens.reduce((a, i) => a + Math.max(0, i.valor), 0), m.origem, "", m.itens.map((i) => `${nomeEnv(i.envelopeId)} ${n(i.valor)}`).join(" | ")); break;
      case "cartao_compra": row(-m.valor, `${m.parcelas}x no cartão`, "", "", m.categoria, m.escopo); break;
      case "cartao_pagamento": row(-m.valor, `fatura ${m.fatura}`, nomeConta(m.contaId), nomeEnv(m.envelopeId)); break;
      case "estoque_compra": row(-m.valor, m.status, nomeConta(m.contaId), nomeEnv(m.envelopeId), `${m.qtd} un.`, "negocio"); break;
      case "venda": row(m.qtd * m.precoUnit - m.desconto, m.cancelada ? "cancelada" : `recebido ${n(m.recebimentos.reduce((a, r) => a + r.valor, 0))}`, "", nomeEnv(m.envelopeId), `${m.qtd} un.`, "negocio"); break;
      case "investimento": row(m.direcao === "aporte" ? -m.valor : m.valor, m.direcao, nomeConta(m.contaId), nomeEnv(m.envelopeId)); break;
      case "ajuste": row(m.valor, "ajuste", nomeConta(m.contaId), ""); break;
    }
  }
  return "﻿" + linhas.join("\r\n");
}
