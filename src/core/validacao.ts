// Confere uma movimentação antes de salvar. Devolve a lista de problemas (vazia = ok).

import { diffDias, isISODate } from "./dates";
import { brl } from "./money";
import type { Dados, Movimento, Receita } from "./types";
import { totaisVenda } from "./ledger";

const centavos = (v: unknown) => typeof v === "number" && Number.isInteger(v);

export function validarMovimento(m: Movimento, d: Dados): string[] {
  const e: string[] = [];
  const conta = (id?: string | null) => !!id && d.contas.some((c) => c.id === id);
  const envelope = (id?: string | null) => !!id && d.envelopes.some((x) => x.id === id);
  if (!isISODate(m.data)) e.push("Data inválida.");
  const valor = (m as { valor?: number }).valor;
  if (m.tipo !== "envelope" && m.tipo !== "venda" && m.tipo !== "ajuste" && (!centavos(valor) || (valor as number) <= 0)) e.push("Coloque um valor maior que zero.");
  switch (m.tipo) {
    case "receita":
      if (!conta(m.contaId)) e.push("Escolha a conta onde o dinheiro entra.");
      if (!d.config.fontes.some((f) => f.id === m.fonteId)) e.push("Escolha de onde veio o dinheiro.");
      break;
    case "despesa":
      if (!envelope(m.envelopeId)) e.push("Escolha de qual envelope o dinheiro sai.");
      if (m.status === "paga" && !conta(m.contaId)) e.push("Escolha a conta de onde o dinheiro saiu.");
      if (m.vencimento && !isISODate(m.vencimento)) e.push("Vencimento inválido.");
      break;
    case "transferencia":
      if (!conta(m.deContaId) || !conta(m.paraContaId)) e.push("Escolha as duas contas.");
      if (m.deContaId === m.paraContaId) e.push("A conta de origem e a de destino precisam ser diferentes.");
      break;
    case "envelope":
      if (!m.itens.length) e.push("Nenhum valor para mover.");
      if (m.itens.some((i) => !envelope(i.envelopeId) || !centavos(i.valor))) e.push("Valores ou envelopes inválidos.");
      if (m.origem === "transferencia" && m.itens.reduce((a, i) => a + i.valor, 0) !== 0) e.push("Uma transferência entre envelopes precisa tirar de um e pôr no outro o mesmo valor.");
      break;
    case "cartao_compra":
      if (!d.cartoes.some((c) => c.id === m.cartaoId)) e.push("Escolha o cartão.");
      if (!(Number.isInteger(m.parcelas) && m.parcelas >= 1 && m.parcelas <= 48)) e.push("Parcelas entre 1 e 48.");
      break;
    case "cartao_pagamento":
      if (!d.cartoes.some((c) => c.id === m.cartaoId)) e.push("Escolha o cartão.");
      if (!/^\d{4}-\d{2}$/.test(m.fatura)) e.push("Escolha a fatura.");
      if (!conta(m.contaId)) e.push("Escolha a conta que pagou.");
      if (!envelope(m.envelopeId)) e.push("Escolha o envelope.");
      break;
    case "estoque_compra":
      if (!d.produtos.some((p) => p.id === m.produtoId)) e.push("Escolha o produto.");
      if (!(Number.isInteger(m.qtd) && m.qtd > 0)) e.push("Quantidade precisa ser 1 ou mais.");
      if (m.status === "paga" && !conta(m.contaId)) e.push("Escolha a conta que pagou.");
      break;
    case "venda": {
      if (!d.produtos.some((p) => p.id === m.produtoId)) e.push("Escolha o produto.");
      if (!(Number.isInteger(m.qtd) && m.qtd > 0)) e.push("Quantidade precisa ser 1 ou mais.");
      if (!centavos(m.precoUnit) || m.precoUnit < 0) e.push("Preço inválido.");
      if (!centavos(m.desconto) || m.desconto < 0) e.push("Desconto inválido.");
      const t = totaisVenda(m);
      if (t.bruto < 0) e.push("O desconto é maior que o valor da venda.");
      if (t.recebido > t.bruto) e.push(`Recebido (${brl(t.recebido)}) maior que o valor da venda (${brl(t.bruto)}).`);
      if (m.recebimentos.some((r) => !conta(r.contaId) || !(r.valor > 0))) e.push("Recebimento sem conta ou com valor inválido.");
      if (m.despesasDiretas > 0 && !conta(m.contaDespesasId)) e.push("Escolha a conta de onde saíram as despesas da venda.");
      break;
    }
    case "investimento":
      if (!d.investimentos.some((i) => i.id === m.investimentoId)) e.push("Escolha o investimento.");
      if (!conta(m.contaId)) e.push("Escolha a conta.");
      break;
    case "ajuste":
      if (!conta(m.contaId)) e.push("Escolha a conta.");
      if (!centavos(m.valor) || m.valor === 0) e.push("O ajuste precisa ter uma diferença.");
      break;
  }
  return e;
}

/** Recebimento parecido já registrado (mesmo valor e fonte, até 1 dia de diferença) (regra 14). */
export function possivelDuplicata(r: Receita, d: Dados): Receita | null {
  return (d.movimentos.find((m) => m.tipo === "receita" && m.id !== r.id && m.valor === r.valor && m.fonteId === r.fonteId && Math.abs(diffDias(m.data, r.data)) <= 1) as Receita) ?? null;
}
