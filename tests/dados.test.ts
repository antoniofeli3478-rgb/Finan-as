import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FinDB } from "../src/data/db";
import { apagarMovimento, carregarDados, conciliar, distribuir, ErroValidacao, garantirInicial, gerarRecorrencias, marcarRecebida, movimentarInvestimento, novoMov, pagar, receberVenda, salvarMovimento } from "../src/data/repo";
import { backupComoTexto, ErroBackup, lerBackup, movimentosCSV, restaurar } from "../src/data/backup";
import { popularDemo } from "../src/data/demo";
import { calcularSaldos } from "../src/core/ledger";
import { calcularSituacao } from "../src/core/situacao";
import { ENV } from "../src/core/defaults";
import type { Receita, Venda } from "../src/core/types";

let n = 0;
let db: FinDB;
const nome = () => `teste-${++n}`;
const HOJE = "2026-10-20";

beforeEach(async () => {
  db = new FinDB(nome());
  await garantirInicial(db);
});

const receita = (valor: number, data = HOJE) => novoMov<Receita>({ tipo: "receita", valor, fonteId: "eventos", contaId: "conta-inter", status: "recebida", data, descricao: "Trabalho" });

describe("banco local", () => {
  it("os dados continuam lá depois de fechar e abrir o app", async () => {
    const nomeDb = db.name;
    await salvarMovimento(db, receita(50000));
    db.close();
    const reaberto = new FinDB(nomeDb);
    await garantirInicial(reaberto); // não pode recriar nem apagar nada
    const d = await carregarDados(reaberto);
    expect(d.movimentos).toHaveLength(1);
    expect(calcularSaldos(d).caixa).toBe(50000);
    expect(d.envelopes).toHaveLength(6);
  });

  it("recusa movimentação inválida sem gravar", async () => {
    await expect(salvarMovimento(db, receita(-5))).rejects.toBeInstanceOf(ErroValidacao);
    expect(await db.movimentos.count()).toBe(0);
  });

  it("distribuir não deixa passar do que existe", async () => {
    await salvarMovimento(db, receita(50000));
    await expect(distribuir(db, [{ envelopeId: ENV.pc, valor: 60000 }], HOJE)).rejects.toBeInstanceOf(ErroValidacao);
    await distribuir(db, [{ envelopeId: ENV.pc, valor: 20000 }, { envelopeId: ENV.livre, valor: 30000 }], HOJE);
    const s = calcularSaldos(await carregarDados(db));
    expect(s.aDistribuir).toBe(0);
    expect(s.envelopes[ENV.pc]).toBe(20000);
  });

  it("apagar um recebimento desfaz a distribuição dele", async () => {
    const r = await salvarMovimento(db, receita(50000));
    await distribuir(db, [{ envelopeId: ENV.livre, valor: 50000 }], HOJE, { receitaId: r.id });
    await apagarMovimento(db, r.id);
    const s = calcularSaldos(await carregarDados(db));
    expect(s.caixa).toBe(0);
    expect(s.envelopes[ENV.livre]).toBe(0);
    expect(await db.movimentos.count()).toBe(0);
  });

  it("editar uma movimentação refaz os saldos", async () => {
    const r = await salvarMovimento(db, receita(50000));
    await salvarMovimento(db, { ...r, valor: 30000 } as Receita);
    expect(calcularSaldos(await carregarDados(db)).caixa).toBe(30000);
    expect(await db.movimentos.count()).toBe(1);
  });

  it("recorrências geram contas sem duplicar ao reabrir", async () => {
    await db.recorrencias.put({ id: "r", nome: "Academia", valor: 16000, variavel: false, categoria: "Academia", escopo: "pessoal", envelopeId: ENV.obrigacoes, frequencia: "mensal", intervalo: 1, inicio: "2026-10-25", geradoAte: null, prioridade: 2, ativa: true });
    expect(await gerarRecorrencias(db, HOJE, 45)).toBe(2); // 25/10 e 25/11
    expect(await gerarRecorrencias(db, HOJE, 45)).toBe(0);
    const pend = (await carregarDados(db)).movimentos.filter((m) => m.tipo === "despesa");
    expect(pend.map((m) => m.data).sort()).toEqual(["2026-10-25", "2026-11-25"]);
    // pagar uma e conferir que sai da conta e do envelope de obrigações
    await salvarMovimento(db, receita(50000));
    await distribuir(db, [{ envelopeId: ENV.obrigacoes, valor: 16000 }], HOJE);
    await pagar(db, pend[0].id, "conta-inter", HOJE);
    const s = calcularSaldos(await carregarDados(db));
    expect(s.contas["conta-inter"]).toBe(34000);
    expect(s.envelopes[ENV.obrigacoes]).toBe(0);
  });

  it("venda pendente recebida depois entra no caixa do negócio", async () => {
    await db.produtos.put({ id: "p", nome: "Placa", categoria: "Google", precoVenda: 8000, custoReferencia: 1400, custoHistorico: [], custoAdicional: 0, estoqueMinimo: 0, ativo: true });
    const v = await salvarMovimento(db, novoMov<Venda>({ tipo: "venda", produtoId: "p", qtd: 2, precoUnit: 8000, desconto: 0, forma: "Pix", cancelada: false, recebimentos: [], despesasDiretas: 0, custoAdicionalUnit: 0, envelopeId: ENV.negocio, data: HOJE, descricao: "Venda" }));
    expect(calcularSaldos(await carregarDados(db)).caixa).toBe(0);
    await receberVenda(db, v.id, { valor: 10000, data: HOJE, contaId: "conta-inter" });
    await receberVenda(db, v.id, { valor: 6000, data: HOJE, contaId: "conta-dinheiro" });
    const d = await carregarDados(db);
    expect(calcularSaldos(d).envelopes[ENV.negocio]).toBe(16000);
    expect(calcularSituacao(d, HOJE).totalAReceber).toBe(0);
    await expect(receberVenda(db, v.id, { valor: 1, data: HOJE, contaId: "conta-inter" })).rejects.toBeInstanceOf(ErroValidacao);
  });

  it("recebimento pendente marcado como recebido", async () => {
    const r = await salvarMovimento(db, novoMov<Receita>({ tipo: "receita", valor: 15000, fonteId: "conteudo", contaId: "conta-inter", status: "pendente", data: HOJE, descricao: "Edição" }));
    await marcarRecebida(db, r.id, "conta-inter", HOJE);
    expect(calcularSaldos(await carregarDados(db)).caixa).toBe(15000);
  });

  it("conciliação cria ajuste com a diferença", async () => {
    await salvarMovimento(db, receita(50000));
    expect(await conciliar(db, "conta-inter", 48750, HOJE)).toBe(-1250);
    const d = await carregarDados(db);
    expect(calcularSaldos(d).contas["conta-inter"]).toBe(48750);
    expect(d.contas.find((c) => c.id === "conta-inter")!.conferido).toEqual({ data: HOJE, saldo: 48750 });
    expect(await conciliar(db, "conta-inter", 48750, HOJE)).toBe(0);
  });

  it("aporte em investimento sai do caixa sem virar gasto e soma no valor atual", async () => {
    await db.investimentos.put({ id: "i", nome: "CDB", instituicao: "Banco", valorAtual: 0, atualizadoEm: null, arquivado: false });
    await salvarMovimento(db, receita(50000));
    await distribuir(db, [{ envelopeId: ENV.investimentos, valor: 20000 }], HOJE);
    await movimentarInvestimento(db, novoMov({ tipo: "investimento", investimentoId: "i", direcao: "aporte", valor: 20000, contaId: "conta-inter", envelopeId: ENV.investimentos, data: HOJE, descricao: "Aporte" }));
    const d = await carregarDados(db);
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(30000);
    expect(sit.investimentos.valorAtual).toBe(20000);
    expect(sit.patrimonio.total).toBe(50000);
  });
});

describe("backup", () => {
  it("exporta e restaura tudo igual", async () => {
    await popularDemo(db, HOJE);
    const antes = await carregarDados(db);
    const texto = await backupComoTexto(db);
    const outro = new FinDB(nome());
    await garantirInicial(outro);
    const lido = await lerBackup(texto);
    await restaurar(outro, lido.dados);
    const depois = await carregarDados(outro);
    expect(depois.movimentos.length).toBe(antes.movimentos.length);
    expect(calcularSaldos(depois)).toEqual(calcularSaldos(antes));
  });

  it("backup com senha: só abre com a senha certa", async () => {
    await salvarMovimento(db, receita(12345));
    const texto = await backupComoTexto(db, "senha-forte");
    expect(texto).not.toContain("12345");
    await expect(lerBackup(texto)).rejects.toMatchObject({ precisaSenha: true });
    await expect(lerBackup(texto, "errada")).rejects.toBeInstanceOf(ErroBackup);
    const ok = await lerBackup(texto, "senha-forte");
    expect(ok.dados.movimentos[0]).toMatchObject({ valor: 12345 });
  });

  it("arquivo inválido é recusado e nada muda", async () => {
    await salvarMovimento(db, receita(50000));
    await expect(lerBackup("{nao é json")).rejects.toBeInstanceOf(ErroBackup);
    const ruim = JSON.stringify({ app: "gerente-financeiro", schemaVersion: 1, dados: { contas: [], envelopes: [], movimentos: [{ tipo: "receita", id: "x" }], recorrencias: [], cartoes: [], produtos: [], investimentos: [], config: { id: "cfg", fontes: [], estrategias: [] } } });
    await expect(lerBackup(ruim)).rejects.toThrow(/inválidos/);
    expect(await db.movimentos.count()).toBe(1);
  });

  it("gera CSV com valores em reais", async () => {
    await salvarMovimento(db, receita(8990));
    const csv = movimentosCSV(await carregarDados(db));
    expect(csv).toContain('"89,90"');
    expect(csv).toContain('"20/10/2026"');
  });
});

describe("modo demonstração", () => {
  it("monta um cenário coerente", async () => {
    await popularDemo(db, HOJE);
    const d = await carregarDados(db);
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.alocado + sit.saldos.aDistribuir).toBe(sit.saldos.caixa);
    expect(sit.saldos.aDistribuir).toBe(20000); // o recebimento de hoje ainda não foi distribuído
    expect(sit.estoque.porProduto["p-google"].qtd).toBe(30 - 11);
    expect(sit.compromissos.some((c) => c.origem === "fatura")).toBe(true);
  });
});
