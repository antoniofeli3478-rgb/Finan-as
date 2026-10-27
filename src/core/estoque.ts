// Estoque e custo das mercadorias vendidas (CMV), pelo custo médio.
// O estoque é recalculado do zero a partir das compras e vendas, em ordem de data,
// então editar uma compra antiga corrige o custo de todas as vendas seguintes.

import type { Cents } from "./money";
import type { CompraEstoque, ID, Movimento, Produto, Venda } from "./types";
import { ordenar } from "./ledger";

export interface EstoqueProduto {
  qtd: number;
  /** Valor do estoque a custo. */
  custoTotal: Cents;
  custoMedio: Cents;
  /** Vendeu mais do que tinha registrado em estoque. */
  negativo: boolean;
}

export interface ResultadoEstoque {
  porProduto: Record<ID, EstoqueProduto>;
  /** CMV de cada venda (custo das placas que saíram + custo adicional). */
  cmvVenda: Record<ID, Cents>;
  /** A venda usou o custo de referência porque não havia estoque com custo conhecido. */
  cmvEstimado: Record<ID, boolean>;
}

export function calcularEstoque(produtos: Produto[], movs: Movimento[]): ResultadoEstoque {
  const st: Record<ID, { qtd: number; custo: number }> = {};
  for (const p of produtos) st[p.id] = { qtd: 0, custo: 0 };
  const cmvVenda: Record<ID, Cents> = {};
  const cmvEstimado: Record<ID, boolean> = {};
  const prod = new Map(produtos.map((p) => [p.id, p]));
  for (const m of ordenar(movs)) {
    if (m.tipo === "estoque_compra") {
      const c = m as CompraEstoque;
      const s = (st[c.produtoId] ??= { qtd: 0, custo: 0 });
      if (s.qtd < 0) {
        // estava negativo: a compra primeiro "paga" o que já tinha saído
        s.qtd += c.qtd; s.custo = s.qtd > 0 ? Math.round((c.valor * s.qtd) / c.qtd) : 0;
      } else { s.qtd += c.qtd; s.custo += c.valor; }
    } else if (m.tipo === "venda" && !(m as Venda).cancelada) {
      const v = m as Venda;
      const s = (st[v.produtoId] ??= { qtd: 0, custo: 0 });
      const ref = prod.get(v.produtoId)?.custoReferencia ?? 0;
      const doEstoque = Math.max(0, Math.min(v.qtd, s.qtd));
      const semEstoque = v.qtd - doEstoque;
      const custoEstoque = doEstoque > 0 ? Math.round((s.custo * doEstoque) / s.qtd) : 0;
      s.custo -= custoEstoque; s.qtd -= v.qtd;
      if (s.qtd <= 0) s.custo = 0;
      cmvVenda[v.id] = custoEstoque + semEstoque * ref + v.qtd * (v.custoAdicionalUnit || 0);
      cmvEstimado[v.id] = semEstoque > 0;
    }
  }
  const porProduto: Record<ID, EstoqueProduto> = {};
  for (const [id, s] of Object.entries(st)) {
    porProduto[id] = { qtd: s.qtd, custoTotal: Math.max(0, s.custo), custoMedio: s.qtd > 0 ? Math.round(s.custo / s.qtd) : 0, negativo: s.qtd < 0 };
  }
  return { porProduto, cmvVenda, cmvEstimado };
}

/** Quanto custa repor o estoque de quem está abaixo do mínimo. */
export function reposicaoNecessaria(produtos: Produto[], est: ResultadoEstoque) {
  const itens = produtos.filter((p) => p.ativo).map((p) => {
    const qtd = est.porProduto[p.id]?.qtd ?? 0;
    const falta = Math.max(0, p.estoqueMinimo - qtd);
    return { produto: p, qtd, falta, custo: falta * p.custoReferencia };
  }).filter((i) => i.falta > 0);
  return { itens, total: itens.reduce((a, i) => a + i.custo, 0) };
}
