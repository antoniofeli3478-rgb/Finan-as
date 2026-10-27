import { describe, expect, it } from "vitest";
import { converterNfc } from "../src/integracoes/nfc";
import { base, ENV } from "./fixtures";
import { calcularSituacao } from "../src/core/situacao";
import { indicadores } from "../src/core/negocio";

// Formato real gravado pelo app Plaquinhas NFC (valores em reais)
const nfc = {
  versao: 1,
  tipos: [{ id: "google", nome: "Google" }, { id: "pix", nome: "Pix" }],
  movs: [
    { id: "e1", mov: "entrada", tipo: "google", qtd: 40, valor: 280, data: "2026-09-01", criadoEm: 1 },
    { id: "e2", mov: "entrada", tipo: "google", qtd: 10, valor: 116.7, data: "2026-10-22", criadoEm: 2 },
    { id: "v-antiga", mov: "venda", tipo: "google", qtd: 2, valor: 160, preco: 80, data: "2026-09-10", pag: "Pix", criadoEm: 3 },
    { id: "v-dividida", mov: "venda", tipo: "google", qtd: 3, valor: 105, preco: 35, data: "2026-10-21", pagamentos: [{ forma: "Pix", valor: 35 }, { forma: "Dinheiro", valor: 30, recebidoEm: "2026-10-23" }, { forma: "A receber", valor: 40 }], criadoEm: 4 },
    { id: "v-cartao", mov: "venda", tipo: "google", qtd: 1, valor: 100, preco: 100, data: "2026-10-22", taxa: 4, pagamentos: [{ forma: "Cartão", valor: 100 }], criadoEm: 5 },
    { id: "loja1", mov: "loja", tipo: "google", qtd: 10, preco: 35, quem: "Loja do Zé", data: "2026-10-01", acertos: [{ data: "2026-10-15", devolvidas: 2 }], criadoEm: 6 },
    { id: "v-loja", mov: "venda", tipo: "google", qtd: 4, valor: 140, preco: 35, data: "2026-10-15", consigId: "loja1", pagamentos: [{ forma: "A receber", valor: 140 }], criadoEm: 7 },
  ],
  cfg: { taxaCartao: 3 },
};
const lig = { ativo: true, contaId: "inter", desde: "2026-10-20" };

describe("ligação com o Plaquinhas NFC", () => {
  it("converte reais em centavos e respeita os totais", () => {
    const r = converterNfc(JSON.stringify(nfc), lig, ENV.negocio);
    expect(r.encontrado).toBe(true);
    expect(r.registros).toBe(7);
    const v = r.vendasConv.find((x) => x.id === "nfc:v-dividida")!;
    expect(v.qtd * v.precoUnit - v.desconto).toBe(10500);
    expect(v.recebimentos.map((x) => [x.valor, x.data])).toEqual([[3500, "2026-10-21"], [3000, "2026-10-23"]]);
  });
  it("estoque igual ao do app das placas (com placas nas lojas)", () => {
    const g = converterNfc(JSON.stringify(nfc), lig, ENV.negocio).estoque.find((e) => e.tipoId === "google")!;
    expect(g.recebidas).toBe(50);
    expect(g.vendidas).toBe(10);
    expect(g.naLoja).toBe(10 - 4 - 2);
    expect(g.emEstoque).toBe(50 - 10 - 4);
  });
  it("dinheiro de antes da ligação não entra no caixa, mas conta no faturamento", () => {
    const d = base();
    const r = converterNfc(JSON.stringify(nfc), lig, ENV.negocio);
    d.produtos = r.produtos; d.movimentos = [...r.vendasConv, ...r.compras];
    const sit = calcularSituacao(d, "2026-10-25");
    // Caixa: Pix 35 + Dinheiro 30 + Cartão 100 − taxa 4 − compra de 22/10 (116,70) = 44,30
    expect(sit.saldos.contas.inter).toBe(3500 + 3000 + 10000 - 400 - 11670);
    expect(sit.saldoEnv(sit.env.negocio)).toBe(sit.saldos.contas.inter);
    // A venda antiga (setembro, antes da ligação) é faturamento, não caixa
    expect(indicadores(d, sit, "2026-09-01", "2026-09-30").faturamento).toBe(16000);
    // A receber: 40 da venda dividida + 140 da loja
    expect(sit.totalAReceber).toBe(4000 + 14000);
  });
  it("sem ligação ativa, nada mexe no caixa", () => {
    const d = base();
    const r = converterNfc(JSON.stringify(nfc), null, ENV.negocio);
    d.produtos = r.produtos; d.movimentos = [...r.vendasConv, ...r.compras];
    expect(calcularSituacao(d, "2026-10-25").saldos.caixa).toBe(0);
  });
  it("aparelho sem dados ou com dados estragados não quebra o Finanças", () => {
    expect(converterNfc(null, lig, ENV.negocio).encontrado).toBe(false);
    expect(converterNfc("{quebrado", lig, ENV.negocio).erro).toMatch(/não puderam/);
    expect(converterNfc(JSON.stringify({ outra: 1 }), lig, ENV.negocio).erro).toMatch(/formato/);
  });
});
