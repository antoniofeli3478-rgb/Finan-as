import { describe, expect, it } from "vitest";
import { base, mov, ENV } from "./fixtures";
import { brl, dividir, parseCents } from "../src/core/money";
import { addMeses, br } from "../src/core/dates";
import { calcularSaldos, extratoEnvelope } from "../src/core/ledger";
import { calcularSituacao } from "../src/core/situacao";
import { faturaDaCompra, faturasDoCartao, parcelasDe } from "../src/core/cartao";
import { calcularEstoque } from "../src/core/estoque";
import { ocorrenciasNovas, datasParaGerar } from "../src/core/recorrencia";
import { proporDistribuicao, validarDistribuicao } from "../src/core/distribuicao";
import { disponivelParaRetirada, indicadores, simular } from "../src/core/negocio";
import { relatorioPeriodo, cenariosMeta } from "../src/core/relatorios";
import { podeComprar } from "../src/core/consultor";
import { possivelDuplicata, validarMovimento } from "../src/core/validacao";
import type { CompraCartao, CompraEstoque, Despesa, MovEnvelope, PagamentoFatura, Receita, Recorrencia, Transferencia, Venda } from "../src/core/types";

const HOJE = "2026-10-20";

const receita = (valor: number, extra: Partial<Receita> = {}) => mov<Receita>({ tipo: "receita", valor, fonteId: "eventos", contaId: "inter", status: "recebida", data: "2026-10-05", ...extra });
const despesa = (valor: number, extra: Partial<Despesa> = {}) => mov<Despesa>({ tipo: "despesa", valor, categoria: "Lazer", escopo: "pessoal", envelopeId: ENV.livre, status: "paga", contaId: "inter", data: "2026-10-06", ...extra });
const distribuir = (itens: [string, number][], data = "2026-10-05") => mov<MovEnvelope>({ tipo: "envelope", origem: "distribuicao", itens: itens.map(([envelopeId, valor]) => ({ envelopeId, valor })), data });

describe("dinheiro em centavos (regra 17)", () => {
  it("lê o jeito brasileiro de escrever valores", () => {
    expect(parseCents("80")).toBe(8000);
    expect(parseCents("89,90")).toBe(8990);
    expect(parseCents("1.234,56")).toBe(123456);
    expect(parseCents("R$ 11,67")).toBe(1167);
    expect(parseCents("0,1")).toBe(10);
    expect(parseCents("12.5")).toBe(1250);
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("1,234,5")).toBeNull();
  });
  it("soma sem erro de arredondamento", () => {
    expect([10, 20].reduce((a, b) => a + b)).toBe(30); // 0,10 + 0,20 = 0,30
    expect(brl(30)).toBe("R$ 0,30");
  });
  it("divide parcelas sem perder centavo", () => {
    const p = dividir(10000, 3);
    expect(p).toEqual([3334, 3333, 3333]);
    expect(p.reduce((a, b) => a + b)).toBe(10000);
  });
  it("mostra datas como DD/MM/AAAA e soma meses no fim do mês", () => {
    expect(br("2026-01-31")).toBe("31/01/2026");
    expect(addMeses("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("recebimento e despesa", () => {
  it("recebimento recebido aumenta o saldo e fica a distribuir", () => {
    const d = base(); d.movimentos = [receita(50000)];
    const s = calcularSaldos(d);
    expect(s.contas.inter).toBe(50000);
    expect(s.aDistribuir).toBe(50000);
  });
  it("recebimento pendente não aumenta o saldo (regra 4)", () => {
    const d = base(); d.movimentos = [receita(50000, { status: "pendente", previstaPara: "2026-10-25" })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(0);
    expect(sit.totalAReceber).toBe(50000);
    expect(sit.livreReal).toBe(0);
  });
  it("despesa paga reduz conta e envelope (regra 2)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.livre, 50000]]), despesa(12000)];
    const s = calcularSaldos(d);
    expect(s.contas.inter).toBe(38000);
    expect(s.envelopes[ENV.livre]).toBe(38000);
  });
  it("despesa pendente é compromisso, não saída (regra 3)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.livre, 50000]]), despesa(15000, { status: "pendente", envelopeId: ENV.obrigacoes, vencimento: "2026-10-25", contaId: null })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(50000);
    expect(sit.totalAPagar).toBe(15000);
    // R$ 500 livres, mas R$ 150 de conta sem cobertura: só R$ 350 são livres de verdade (regra 13)
    expect(sit.livreReal).toBe(35000);
  });
  it("o exemplo do briefing: R$ 200 de saldo com R$ 150 comprometidos não mostra R$ 200 livres", () => {
    const d = base(); d.movimentos = [receita(20000), distribuir([[ENV.livre, 20000]]), despesa(15000, { status: "pendente", envelopeId: ENV.obrigacoes, vencimento: "2026-10-28", contaId: null })];
    expect(calcularSituacao(d, HOJE).livreReal).toBe(5000);
  });
  it("dinheiro a distribuir não conta como livre", () => {
    const d = base(); d.movimentos = [receita(30000)];
    expect(calcularSituacao(d, HOJE).livreReal).toBe(0);
  });
});

describe("transferências e envelopes", () => {
  it("transferência entre contas próprias não é receita nem despesa (regra 1)", () => {
    const d = base(); d.movimentos = [receita(50000), mov<Transferencia>({ tipo: "transferencia", valor: 20000, deContaId: "inter", paraContaId: "carteira", data: "2026-10-07" })];
    const s = calcularSaldos(d);
    expect(s.caixa).toBe(50000);
    expect(s.contas.carteira).toBe(20000);
    const r = relatorioPeriodo(d, calcularSituacao(d, HOJE), "2026-10-01", "2026-10-31");
    expect(r.receitasPessoais).toBe(50000);
    expect(r.gastosPessoais).toBe(0);
  });
  it("aporte em meta só muda a finalidade, sem criar receita (regra 9)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.livre, 50000]]), mov<MovEnvelope>({ tipo: "envelope", origem: "aporte", itens: [{ envelopeId: ENV.livre, valor: -10000 }, { envelopeId: ENV.pc, valor: 10000 }], data: "2026-10-08" })];
    const s = calcularSaldos(d);
    expect(s.caixa).toBe(50000);
    expect(s.envelopes[ENV.pc]).toBe(10000);
    expect(relatorioPeriodo(d, calcularSituacao(d, HOJE), "2026-10-01", "2026-10-31").receitasPessoais).toBe(50000);
  });
  it("saldo do envelope bate com o histórico (regra 11)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.livre, 30000], [ENV.pc, 20000]]), despesa(5000)];
    const ext = extratoEnvelope(d.movimentos, ENV.livre);
    expect(ext.at(-1)!.saldo).toBe(calcularSaldos(d).envelopes[ENV.livre]);
  });
  it("envelopes + a distribuir = dinheiro nas contas (regra 12)", () => {
    const d = base(); d.contas[0].saldoInicial = 10000; d.movimentos = [receita(50000), distribuir([[ENV.livre, 30000], [ENV.pc, 20000]]), despesa(5000)];
    const s = calcularSaldos(d);
    expect(s.alocado + s.aDistribuir).toBe(s.caixa);
    expect(s.aDistribuir).toBe(10000);
  });
  it("reservado não aparece como livre (regra 13)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.pc, 40000], [ENV.livre, 10000]])];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.livreReal).toBe(10000);
    expect(sit.reservado).toBe(40000);
  });
});

describe("distribuição de um recebimento", () => {
  it("cobre primeiro as contas próximas, depois metas, e o resto vai para o livre", () => {
    const d = base();
    d.movimentos = [despesa(15000, { status: "pendente", envelopeId: ENV.obrigacoes, vencimento: "2026-10-25", contaId: null }), receita(50000, { data: HOJE })];
    const sit = calcularSituacao(d, HOJE);
    const est = d.config.estrategias.find((e) => e.id === "est-trabalho")!; // 30% PC, 20% reserva
    const p = proporDistribuicao(50000, est, d, sit);
    const v = (id: string) => p.itens.find((i) => i.envelopeId === id)?.valor ?? 0;
    expect(v(ENV.obrigacoes)).toBe(15000);
    expect(v(ENV.pc)).toBe(10500); // 30% de 350
    expect(v(ENV.reserva)).toBe(7000); // 20% de 350: sem meta definida, não há teto
    expect(v(ENV.livre)).toBe(17500);
    expect(p.itens.reduce((a, i) => a + i.valor, 0)).toBe(50000);
    expect(p.deficit).toBe(0);
  });
  it("não reserva duas vezes a mesma conta", () => {
    const d = base();
    d.movimentos = [despesa(15000, { status: "pendente", envelopeId: ENV.obrigacoes, vencimento: "2026-10-25", contaId: null }), receita(50000, { data: "2026-10-01" }), distribuir([[ENV.obrigacoes, 15000], [ENV.livre, 35000]], "2026-10-01"), receita(30000, { data: HOJE })];
    const sit = calcularSituacao(d, HOJE);
    const p = proporDistribuicao(30000, d.config.estrategias[0], d, sit);
    expect(p.itens.find((i) => i.envelopeId === ENV.obrigacoes)).toBeUndefined();
  });
  it("valor insuficiente mostra o déficit e não inventa saldo", () => {
    const d = base();
    d.movimentos = [despesa(30000, { status: "pendente", envelopeId: ENV.obrigacoes, vencimento: "2026-10-22", contaId: null }), receita(10000, { data: HOJE })];
    const sit = calcularSituacao(d, HOJE);
    const p = proporDistribuicao(10000, d.config.estrategias[0], d, sit);
    expect(p.itens).toEqual([expect.objectContaining({ envelopeId: ENV.obrigacoes, valor: 10000 })]);
    expect(p.deficit).toBe(20000);
    expect(p.alertas.join(" ")).toMatch(/faltam R\$ 200,00/i);
  });
  it("respeita a meta: não manda para o PC mais do que falta", () => {
    const d = base(); d.envelopes.find((e) => e.id === ENV.pc)!.meta = 10000;
    d.movimentos = [receita(100000, { data: HOJE })];
    const sit = calcularSituacao(d, HOJE);
    const est = { ...d.config.estrategias[0], regras: [{ envelopeId: ENV.pc, modo: "percentual" as const, valor: 50 }] };
    const p = proporDistribuicao(100000, est, d, sit);
    expect(p.itens.find((i) => i.envelopeId === ENV.pc)!.valor).toBe(10000);
    expect(p.itens.find((i) => i.envelopeId === ENV.livre)!.valor).toBe(90000);
  });
  it("recusa distribuir mais do que existe", () => {
    expect(validarDistribuicao([{ envelopeId: ENV.pc, valor: 60000 }], 50000)).toMatch(/só há/);
    expect(validarDistribuicao([{ envelopeId: ENV.pc, valor: 50000 }], 50000)).toBeNull();
  });
});

describe("estoque, vendas e lucro", () => {
  const compra = (qtd: number, valor: number, extra: Partial<CompraEstoque> = {}) => mov<CompraEstoque>({ tipo: "estoque_compra", produtoId: "google", qtd, valor, status: "paga", contaId: "inter", envelopeId: ENV.negocio, data: "2026-10-02", ...extra });
  const venda = (qtd: number, preco: number, extra: Partial<Venda> = {}) => mov<Venda>({ tipo: "venda", produtoId: "google", qtd, precoUnit: preco, desconto: 0, forma: "Pix", cancelada: false, recebimentos: [], despesasDiretas: 0, custoAdicionalUnit: 0, envelopeId: ENV.negocio, data: "2026-10-10", ...extra });

  it("compra de estoque aumenta o estoque, tira do caixa do negócio e não é lucro (regra 7)", () => {
    const d = base(); d.movimentos = [receita(100000), distribuir([[ENV.negocio, 100000]]), compra(30, 35000)];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.estoque.porProduto.google.qtd).toBe(30);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(65000);
    const ind = indicadores(d, sit, "2026-10-01", "2026-10-31");
    expect(ind.lucroLiquido).toBe(0);
    expect(ind.comprasEstoque).toBe(35000);
  });
  it("venda reduz o estoque e reconhece o custo (regras 6 e 8)", () => {
    const v = venda(2, 8000, { recebimentos: [{ id: "r1", valor: 16000, data: "2026-10-10", contaId: "inter" }] });
    const d = base(); d.movimentos = [compra(30, 35000), v];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.estoque.porProduto.google.qtd).toBe(28);
    expect(sit.estoque.cmvVenda[v.id]).toBe(2333); // 2 × 350/30 = 23,33
    const ind = indicadores(d, sit, "2026-10-01", "2026-10-31");
    expect(ind.faturamento).toBe(16000);
    expect(ind.lucroBruto).toBe(16000 - 2333);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(16000 - 35000);
  });
  it("venda de R$ 80 não é R$ 80 de lucro", () => {
    const v = venda(1, 8000, { recebimentos: [{ id: "r", valor: 8000, data: "2026-10-10", contaId: "inter" }], despesasDiretas: 500, contaDespesasId: "inter" });
    const d = base(); d.movimentos = [compra(1, 1400), v];
    const ind = indicadores(d, calcularSituacao(d, HOJE), "2026-10-01", "2026-10-31");
    expect(ind.lucroLiquido).toBe(8000 - 1400 - 500);
  });
  it("venda pendente fatura mas não entra no caixa (regra 4)", () => {
    const d = base(); d.movimentos = [compra(10, 14000), venda(3, 8000, { previstaPara: "2026-10-30" })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(-14000);
    expect(sit.totalAReceber).toBe(24000);
    const ind = indicadores(d, sit, "2026-10-01", "2026-10-31");
    expect(ind.faturamento).toBe(24000);
    expect(ind.recebido).toBe(0);
  });
  it("pagamento parcial e venda cancelada", () => {
    const parcial = venda(2, 8000, { recebimentos: [{ id: "r", valor: 5000, data: "2026-10-10", contaId: "inter" }] });
    const cancelada = venda(5, 8000, { cancelada: true });
    const d = base(); d.movimentos = [compra(10, 14000), parcial, cancelada];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.totalAReceber).toBe(11000);
    expect(sit.estoque.porProduto.google.qtd).toBe(8);
    expect(indicadores(d, sit, "2026-10-01", "2026-10-31").unidades).toBe(2);
  });
  it("compra de estoque pendente vira conta do negócio sem tirar do caixa", () => {
    const d = base(); d.movimentos = [compra(20, 23340, { status: "pendente", contaId: null, vencimento: "2026-11-05" })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(0);
    expect(sit.estoque.porProduto.google.qtd).toBe(20);
    expect(sit.compromissos[0]).toMatchObject({ escopo: "negocio", valor: 23340 });
  });
  it("editar o custo de uma compra antiga recalcula o lucro das vendas seguintes (regra 15)", () => {
    const c = compra(10, 14000), v = venda(1, 8000);
    const d = base(); d.movimentos = [c, v];
    expect(calcularEstoque(d.produtos, d.movimentos).cmvVenda[v.id]).toBe(1400);
    c.valor = 11670;
    expect(calcularEstoque(d.produtos, d.movimentos).cmvVenda[v.id]).toBe(1167);
  });
  it("retirada pessoal respeita contas, reposição e capital de giro", () => {
    const d = base(); d.envelopes.find((e) => e.id === ENV.negocio)!.minimo = 20000;
    d.movimentos = [receita(100000), distribuir([[ENV.negocio, 100000]]), compra(2, 2800), despesa(5000, { status: "pendente", escopo: "negocio", envelopeId: ENV.negocio, contaId: null, vencimento: "2026-10-30" })];
    const sit = calcularSituacao(d, HOJE);
    const r = disponivelParaRetirada(d, sit);
    // caixa 972 − contas 50 − reposição (5−2)×14 = 42 − mínimo 200 = 680
    expect(r.valor).toBe(97200 - 5000 - 4200 - 20000);
  });
  it("simulação: lucro, capital de giro e semanas até a meta", () => {
    const s = simular({ unidadesSemana: 5, preco: 8000, custoUnit: 1400, custoAdicional: 0, despesasSemana: 3000, semanas: 4, prazoRecebimentoDias: 7, pctPatrimonio: 50, estoqueAtual: 10, faltaMeta: 100000 });
    expect(s.lucroSemana).toBe(5 * 6600 - 3000);
    expect(s.paraPatrimonioSemana).toBe(15000);
    expect(s.semanasMeta).toBe(7);
    expect(s.estoqueDuraSemanas).toBe(2);
    expect(s.avisos.join(" ")).toMatch(/estoque atual acaba/);
  });
});

describe("negócios lançados à mão", () => {
  const SEGUNDO = "env-neg-2";
  const venda = (valor: number, extra: Partial<Receita> = {}) => receita(valor, { fonteId: "", negocioId: ENV.negocio, data: "2026-10-10", ...extra });
  const comDois = () => { const d = base(); d.envelopes.push({ id: SEGUNDO, nome: "Revenda", tipo: "negocio", cor: "#000", meta: null, minimo: 0, arquivado: false, ordem: 9 }); return d; };

  it("venda recebida entra na conta e no caixa do negócio, não no seu dinheiro", () => {
    const d = base(); d.movimentos = [venda(8000)];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.contas.inter).toBe(8000);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(8000);
    expect(sit.saldos.aDistribuir).toBe(0);
  });
  it("venda a receber fatura mas não entra no caixa", () => {
    const d = base(); d.movimentos = [venda(8000, { status: "pendente", previstaPara: "2026-10-25" })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(0);
    expect(sit.capitalNegocio.aReceber).toBe(8000);
    const x = indicadores(d, sit, "2026-10-01", "2026-10-31");
    expect(x.faturamento).toBe(8000);
    expect(x.recebido).toBe(0);
  });
  it("lucro do negócio = vendas − gastos do negócio, separado por negócio", () => {
    const d = comDois();
    d.movimentos = [venda(16000), venda(5000, { negocioId: SEGUNDO }), despesa(3500, { escopo: "negocio", envelopeId: ENV.negocio, categoria: "Compra de mercadoria" })];
    const sit = calcularSituacao(d, HOJE);
    const a = indicadores(d, sit, "2026-10-01", "2026-10-31", ENV.negocio);
    const b = indicadores(d, sit, "2026-10-01", "2026-10-31", SEGUNDO);
    expect(a.faturamento).toBe(16000);
    expect(a.lucroLiquido).toBe(12500);
    expect(b.lucroLiquido).toBe(5000);
    expect(indicadores(d, sit, "2026-10-01", "2026-10-31").lucroLiquido).toBe(17500);
    expect(sit.capitalNegocio.caixa).toBe(16000 - 3500 + 5000);
  });
  it("venda do negócio não conta como renda pessoal no relatório (só o lucro)", () => {
    const d = base(); d.movimentos = [receita(20000), venda(10000), despesa(4000, { escopo: "negocio", envelopeId: ENV.negocio })];
    const sit = calcularSituacao(d, HOJE);
    const r = relatorioPeriodo(d, sit, "2026-10-01", "2026-10-31");
    expect(r.receitasPessoais).toBe(20000);
    expect(r.ganhos).toBe(20000 + 6000);
  });
  it("retirada é calculada por negócio", () => {
    const d = comDois(); d.envelopes.find((e) => e.id === ENV.negocio)!.minimo = 3000;
    d.movimentos = [venda(10000), venda(7000, { negocioId: SEGUNDO })];
    const sit = calcularSituacao(d, HOJE);
    expect(disponivelParaRetirada(d, sit, ENV.negocio).valor).toBe(7000);
    expect(disponivelParaRetirada(d, sit, SEGUNDO).valor).toBe(7000);
  });
  it("venda precisa de um negócio válido, mas não de fonte", () => {
    const d = base();
    expect(validarMovimento(venda(1000), d)).toEqual([]);
    expect(validarMovimento(venda(1000, { negocioId: ENV.pc }), d).join(" ")).toMatch(/negócio/);
  });
});

describe("cartão de crédito", () => {
  const compraC = (valor: number, data: string, parcelas = 1, extra: Partial<CompraCartao> = {}) => mov<CompraCartao>({ tipo: "cartao_compra", valor, cartaoId: "cartao", parcelas, categoria: "Compras", escopo: "pessoal", data, ...extra });

  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento, na seguinte", () => {
    const c = base().cartoes[0];
    expect(faturaDaCompra("2026-10-09", c)).toBe("2026-10");
    expect(faturaDaCompra("2026-10-10", c)).toBe("2026-11");
  });
  it("compra no cartão é despesa e compromisso, mas não sai do banco agora", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.livre, 50000]]), compraC(10000, "2026-10-15")];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(50000);
    expect(sit.faturaAtual).toBe(10000);
    expect(relatorioPeriodo(d, sit, "2026-10-01", "2026-10-31").gastosPessoais).toBe(10000);
  });
  it("pagar a fatura tira do banco e não duplica a despesa (regra 5)", () => {
    const d = base(); d.movimentos = [receita(50000), distribuir([[ENV.obrigacoes, 20000], [ENV.livre, 30000]]), compraC(10000, "2026-10-02"),
      mov<PagamentoFatura>({ tipo: "cartao_pagamento", valor: 10000, cartaoId: "cartao", fatura: "2026-10", contaId: "inter", envelopeId: ENV.obrigacoes, data: "2026-10-17" })];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.saldos.caixa).toBe(40000);
    expect(sit.faturas.cartao.find((f) => f.key === "2026-10")!.status).toBe("paga");
    expect(relatorioPeriodo(d, sit, "2026-10-01", "2026-10-31").gastosPessoais).toBe(10000);
    expect(sit.totalAPagar).toBe(0);
  });
  it("parcelamento cai nas faturas certas (regra 16)", () => {
    const d = base(); const c = compraC(30000, "2026-10-12", 3);
    const ps = parcelasDe(c, d.cartoes[0]);
    expect(ps.map((p) => [p.fatura, p.valor])).toEqual([["2026-11", 10000], ["2026-12", 10000], ["2027-01", 10000]]);
    d.movimentos = [c];
    const fs = faturasDoCartao(d.cartoes[0], d.movimentos, HOJE);
    expect(fs.find((f) => f.key === "2026-11")!.status).toBe("aberta");
    expect(fs.find((f) => f.key === "2027-01")!.status).toBe("futura");
    expect(calcularSituacao(d, HOJE).limiteUsado.cartao).toBe(30000);
  });
  it("fatura vencida aparece como atrasada", () => {
    const d = base(); d.movimentos = [compraC(5000, "2026-09-05")];
    const sit = calcularSituacao(d, HOJE);
    expect(sit.faturas.cartao.find((f) => f.key === "2026-09")!.status).toBe("vencida");
    expect(sit.compromissos.find((c) => c.origem === "fatura")!.atrasado).toBe(true);
  });
});

describe("contas recorrentes", () => {
  const rec: Recorrencia = { id: "academia", nome: "Academia", valor: 16000, variavel: false, categoria: "Academia", escopo: "pessoal", envelopeId: ENV.obrigacoes, frequencia: "mensal", intervalo: 1, inicio: "2026-08-31", geradoAte: null, prioridade: 2, ativa: true };
  it("gera as datas do mês respeitando fim de mês", () => {
    expect(datasParaGerar(rec, "2026-11-30")).toEqual(["2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30"]);
  });
  it("não duplica ao reabrir o app", () => {
    const r = { ...rec, geradoAte: "2026-10-31" };
    expect(datasParaGerar(r, "2026-11-30")).toEqual(["2026-11-30"]);
    const ja = mov<Despesa>({ tipo: "despesa", valor: 16000, categoria: "Academia", escopo: "pessoal", envelopeId: ENV.obrigacoes, status: "pendente", data: "2026-11-30", recorrenciaId: "academia", ocorrencia: "2026-11-30" });
    expect(ocorrenciasNovas(r, [ja], "2026-11-30")).toEqual([]);
  });
  it("semanal a cada 2 semanas", () => {
    expect(datasParaGerar({ ...rec, frequencia: "semanal", intervalo: 2, inicio: "2026-10-01" }, "2026-10-31")).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
  });
});

describe("consultor, projeções e validação", () => {
  it("posso comprar algo de R$ 100?", () => {
    const d = base(); d.movimentos = [receita(30000), distribuir([[ENV.livre, 15000], [ENV.pc, 15000]])];
    const sit = calcularSituacao(d, HOJE);
    expect(podeComprar(sit, d, 10000, "avista").veredito).toBe("sim");
    expect(podeComprar(sit, d, 20000, "avista").veredito).toBe("cuidado");
  });
  it("projeção sem dados suficientes não promete data", () => {
    const c = cenariosMeta([0, 0, 0, 0, 0, 0, 0, 10000], 400000, HOJE);
    expect(c.suficiente).toBe(false);
    expect(c.cenarios.every((x) => x.data === null)).toBe(true);
  });
  it("uma semana excepcional não vira ritmo garantido", () => {
    const c = cenariosMeta([5000, 5000, 5000, 5000, 5000, 5000, 5000, 100000], 100000, HOJE);
    expect(c.base.intermediario).toBe(5000);
    expect(c.base.otimista).toBeGreaterThan(c.base.intermediario);
  });
  it("detecta recebimento duplicado (regra 14)", () => {
    const d = base(); const r1 = receita(50000, { data: "2026-10-05" }); d.movimentos = [r1];
    expect(possivelDuplicata(receita(50000, { data: "2026-10-06" }), d)).toBe(r1);
    expect(possivelDuplicata(receita(50000, { data: "2026-10-09" }), d)).toBeNull();
  });
  it("valida entradas inválidas", () => {
    const d = base();
    expect(validarMovimento(receita(0), d)).toContain("Coloque um valor maior que zero.");
    expect(validarMovimento(mov<Transferencia>({ tipo: "transferencia", valor: 100, deContaId: "inter", paraContaId: "inter", data: HOJE }), d).join()).toMatch(/diferentes/);
  });
  it("apagar uma movimentação refaz os saldos (regra 15)", () => {
    const d = base(); const r = receita(50000); d.movimentos = [r, despesa(1000, { envelopeId: ENV.livre })];
    expect(calcularSaldos(d).caixa).toBe(49000);
    d.movimentos = d.movimentos.filter((m) => m !== r);
    expect(calcularSaldos(d).caixa).toBe(-1000);
  });
});
