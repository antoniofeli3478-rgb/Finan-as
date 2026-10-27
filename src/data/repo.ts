// Todas as gravações passam por aqui. Cada operação roda numa transação: ou tudo grava, ou nada.

import { addDias, hojeISO, type ISODate } from "../core/dates";
import type { Cents } from "../core/money";
import { configInicial, envelopesIniciais } from "../core/defaults";
import { calcularSaldos } from "../core/ledger";
import { ocorrenciasNovas } from "../core/recorrencia";
import { validarMovimento } from "../core/validacao";
import type { Conta, Dados, Despesa, ID, Movimento, MovEnvelope, NovoMov, Recebimento, Venda } from "../core/types";
import type { FinDB } from "./db";

export const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export class ErroValidacao extends Error {
  constructor(public problemas: string[]) { super(problemas.join(" ")); }
}

/** Primeira abertura: cria configuração, envelopes e duas contas zeradas (editáveis). */
export async function garantirInicial(db: FinDB) {
  await db.transaction("rw", db.config, db.envelopes, db.contas, async () => {
    if (await db.config.get("cfg")) return;
    await db.config.put(configInicial());
    await db.envelopes.bulkPut(envelopesIniciais());
    const contas: Conta[] = [
      { id: "conta-inter", nome: "Banco Inter", tipo: "banco", saldoInicial: 0, conferido: null, arquivada: false, ordem: 1 },
      { id: "conta-dinheiro", nome: "Dinheiro em mãos", tipo: "dinheiro", saldoInicial: 0, conferido: null, arquivada: false, ordem: 2 },
    ];
    await db.contas.bulkPut(contas);
  });
}

export async function carregarDados(db: FinDB): Promise<Dados> {
  const [contas, envelopes, movimentos, recorrencias, cartoes, produtos, investimentos, config] = await Promise.all([
    db.contas.toArray(), db.envelopes.toArray(), db.movimentos.toArray(), db.recorrencias.toArray(),
    db.cartoes.toArray(), db.produtos.toArray(), db.investimentos.toArray(), db.config.get("cfg"),
  ]);
  // Ordem definida por você, não a ordem interna do banco
  contas.sort((a, b) => a.ordem - b.ordem);
  envelopes.sort((a, b) => a.ordem - b.ordem);
  return { contas, envelopes, movimentos, recorrencias, cartoes, produtos, investimentos, config: config ?? configInicial() };
}

/** Salva (cria ou edita) uma movimentação depois de validar. */
export async function salvarMovimento(db: FinDB, m: Movimento): Promise<Movimento> {
  const d = await carregarDados(db);
  const problemas = validarMovimento(m, d);
  if (problemas.length) throw new ErroValidacao(problemas);
  const agora = Date.now();
  const existente = await db.movimentos.get(m.id);
  const salvo = { ...m, criadoEm: existente?.criadoEm ?? m.criadoEm ?? agora, atualizadoEm: agora } as Movimento;
  await db.movimentos.put(salvo);
  return salvo;
}

/**
 * Apaga uma movimentação. Se for um recebimento, desfaz junto a distribuição dele,
 * senão o dinheiro sumiria das contas mas continuaria nos envelopes.
 */
export async function apagarMovimento(db: FinDB, id: ID) {
  await db.transaction("rw", db.movimentos, async () => {
    const m = await db.movimentos.get(id);
    if (!m) return;
    if (m.tipo === "receita") {
      const ligados = (await db.movimentos.where("tipo").equals("envelope").toArray()).filter((x) => (x as MovEnvelope).receitaId === id);
      await db.movimentos.bulkDelete(ligados.map((x) => x.id));
    }
    await db.movimentos.delete(id);
  });
}

export function novoMov<T extends Movimento = Movimento>(campos: NovoMov<T>): T {
  const agora = Date.now();
  return { id: novoId(), criadoEm: agora, atualizadoEm: agora, ...campos } as unknown as T;
}

/** Move dinheiro entre envelopes (ou de "a distribuir" para eles). */
export async function distribuir(db: FinDB, itens: { envelopeId: ID; valor: Cents }[], data: ISODate, opts: { receitaId?: ID | null; origem?: MovEnvelope["origem"]; descricao?: string } = {}) {
  const limpos = itens.filter((i) => i.valor !== 0);
  if (!limpos.length) return null;
  const d = await carregarDados(db);
  const s = calcularSaldos(d);
  const entra = limpos.reduce((a, i) => a + i.valor, 0);
  if ((opts.origem ?? "distribuicao") === "distribuicao" && entra > s.aDistribuir) {
    throw new ErroValidacao([`Só há ${(s.aDistribuir / 100).toFixed(2).replace(".", ",")} a distribuir.`]);
  }
  return salvarMovimento(db, novoMov<MovEnvelope>({ tipo: "envelope", origem: opts.origem ?? "distribuicao", itens: limpos, data, descricao: opts.descricao ?? "Distribuição", receitaId: opts.receitaId ?? null }));
}

/** Cria as próximas contas a pagar das recorrências, sem duplicar. */
export async function gerarRecorrencias(db: FinDB, hoje: ISODate = hojeISO(), diasAFrente = 45) {
  const ate = addDias(hoje, diasAFrente);
  let criadas = 0;
  await db.transaction("rw", db.recorrencias, db.movimentos, async () => {
    const recs = await db.recorrencias.toArray();
    const despesas = (await db.movimentos.where("tipo").equals("despesa").toArray()) as Despesa[];
    for (const r of recs) {
      const datas = ocorrenciasNovas(r, despesas, ate);
      if (!datas.length) continue;
      const agora = Date.now();
      await db.movimentos.bulkAdd(datas.map((dt, i): Despesa => ({
        id: novoId(), tipo: "despesa", data: dt, descricao: r.nome, valor: r.valor, categoria: r.categoria, escopo: r.escopo,
        envelopeId: r.envelopeId, status: "pendente", contaId: r.contaId ?? null, vencimento: dt, pagaEm: null, prioridade: r.prioridade,
        recorrenciaId: r.id, ocorrencia: dt, estimado: r.variavel, criadoEm: agora + i, atualizadoEm: agora + i,
      })));
      await db.recorrencias.update(r.id, { geradoAte: datas[datas.length - 1] });
      criadas += datas.length;
    }
  });
  return criadas;
}

/** Marca uma conta a pagar (despesa ou compra de estoque) como paga. */
export async function pagar(db: FinDB, movId: ID, contaId: ID, pagaEm: ISODate, valor?: Cents) {
  const m = await db.movimentos.get(movId);
  if (!m || (m.tipo !== "despesa" && m.tipo !== "estoque_compra")) throw new ErroValidacao(["Conta não encontrada."]);
  return salvarMovimento(db, { ...m, status: "paga", contaId, pagaEm, valor: valor ?? m.valor, estimado: false } as Movimento);
}

export async function receberVenda(db: FinDB, vendaId: ID, r: Omit<Recebimento, "id">) {
  const v = (await db.movimentos.get(vendaId)) as Venda | undefined;
  if (!v || v.tipo !== "venda") throw new ErroValidacao(["Venda não encontrada."]);
  return salvarMovimento(db, { ...v, recebimentos: [...v.recebimentos, { ...r, id: novoId() }] });
}

export async function marcarRecebida(db: FinDB, receitaId: ID, contaId: ID, data: ISODate) {
  const m = await db.movimentos.get(receitaId);
  if (!m || m.tipo !== "receita") throw new ErroValidacao(["Recebimento não encontrado."]);
  return salvarMovimento(db, { ...m, status: "recebida", contaId, data });
}

/** Confere o saldo com o banco. Se for diferente, cria um ajuste com a diferença. */
export async function conciliar(db: FinDB, contaId: ID, saldoNoBanco: Cents, data: ISODate) {
  const d = await carregarDados(db);
  const calculado = calcularSaldos(d).contas[contaId] ?? 0;
  const dif = saldoNoBanco - calculado;
  if (dif !== 0) {
    await salvarMovimento(db, novoMov({ tipo: "ajuste", contaId, valor: dif, data, descricao: "Ajuste para bater com o banco" }));
  }
  await db.contas.update(contaId, { conferido: { data, saldo: saldoNoBanco } });
  return dif;
}

/** Aporte ou resgate: o valor atual do investimento acompanha (o app não inventa rendimento). */
export async function movimentarInvestimento(db: FinDB, m: Extract<Movimento, { tipo: "investimento" }>) {
  await db.transaction("rw", [db.movimentos, db.investimentos, db.contas, db.envelopes, db.cartoes, db.produtos, db.config, db.recorrencias], async () => {
    const inv = await db.investimentos.get(m.investimentoId);
    if (!inv) throw new ErroValidacao(["Investimento não encontrado."]);
    const anterior = (await db.movimentos.get(m.id)) as typeof m | undefined;
    const efeito = (x?: typeof m) => (x ? (x.direcao === "aporte" ? x.valor : -x.valor) : 0);
    await salvarMovimento(db, m);
    await db.investimentos.update(inv.id, { valorAtual: inv.valorAtual - efeito(anterior) + efeito(m), atualizadoEm: m.data });
  });
}

export async function apagarTudo(db: FinDB) {
  await db.transaction("rw", [db.contas, db.envelopes, db.movimentos, db.recorrencias, db.cartoes, db.produtos, db.investimentos, db.config], async () => {
    await Promise.all([db.contas.clear(), db.envelopes.clear(), db.movimentos.clear(), db.recorrencias.clear(), db.cartoes.clear(), db.produtos.clear(), db.investimentos.clear(), db.config.clear()]);
  });
  await garantirInicial(db);
}
