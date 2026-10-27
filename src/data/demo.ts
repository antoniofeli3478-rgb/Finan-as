// Dados de DEMONSTRAÇÃO. Ficam num banco separado (gerente-financeiro-demo) e nunca
// se misturam com os seus. Todos os nomes e valores são fictícios.

import { addDias, addMeses, type ISODate } from "../core/dates";
import { ENV } from "../core/defaults";
import type { Movimento, NovoMov } from "../core/types";
import type { FinDB } from "./db";
import { apagarTudo, gerarRecorrencias, novoId } from "./repo";

export async function popularDemo(db: FinDB, hoje: ISODate) {
  await apagarTudo(db);
  const d = (n: number) => addDias(hoje, n);
  let t = Date.now() - 1e7;
  const m = <T extends Movimento = Movimento>(x: NovoMov<T>): T => ({ id: novoId(), criadoEm: ++t, atualizadoEm: t, ...x } as unknown as T);

  await db.contas.update("conta-inter", { saldoInicial: 85000 });
  await db.contas.update("conta-dinheiro", { saldoInicial: 12000 });
  await db.envelopes.update(ENV.negocio, { minimo: 20000 });
  await db.envelopes.update(ENV.pc, { meta: 500000, prazo: addMeses(hoje, 8) });
  await db.cartoes.put({ id: "cartao-demo", nome: "Inter (exemplo)", limite: 150000, limiteDisponivelInformado: null, fechamentoDia: 3, vencimentoDia: 10, arquivado: false });
  await db.produtos.bulkPut([
    { id: "p-google", nome: "Placa Google Avaliações", categoria: "Google", precoVenda: 8000, custoReferencia: 1400, custoHistorico: [{ data: d(-60), custo: 1400 }, { data: d(-20), custo: 1167 }], custoAdicional: 0, estoqueMinimo: 10, fornecedor: "Fornecedor exemplo", ativo: true },
    { id: "p-pix", nome: "Placa Pix", categoria: "Pix", precoVenda: 8990, custoReferencia: 1400, custoHistorico: [], custoAdicional: 0, estoqueMinimo: 5, ativo: true },
  ]);
  await db.investimentos.put({ id: "inv-demo", nome: "CDB liquidez diária (exemplo)", instituicao: "Banco exemplo", valorAtual: 30500, atualizadoEm: d(-3), arquivado: false });
  await db.recorrencias.bulkPut([
    { id: "rec-casa", nome: "Ajuda em casa", valor: 30000, variavel: false, categoria: "Casa", escopo: "pessoal", envelopeId: ENV.obrigacoes, frequencia: "mensal", intervalo: 1, inicio: d(6), geradoAte: null, prioridade: 1, ativa: true, contaId: "conta-inter" },
    { id: "rec-academia", nome: "Academia", valor: 16000, variavel: false, categoria: "Academia e esporte", escopo: "pessoal", envelopeId: ENV.obrigacoes, frequencia: "mensal", intervalo: 1, inicio: d(12), geradoAte: null, prioridade: 2, ativa: true, contaId: "conta-inter" },
    { id: "rec-spotify", nome: "Spotify", valor: 1300, variavel: false, categoria: "Assinaturas", escopo: "pessoal", envelopeId: ENV.obrigacoes, frequencia: "mensal", intervalo: 1, inicio: d(2), geradoAte: null, prioridade: 3, ativa: true, contaId: "conta-inter" },
  ]);

  const movs: Movimento[] = [
    m({ tipo: "envelope", origem: "distribuicao", data: d(-40), descricao: "Saldo inicial distribuído", receitaId: null, itens: [{ envelopeId: ENV.obrigacoes, valor: 60000 }, { envelopeId: ENV.negocio, valor: 40000 }, { envelopeId: ENV.pc, valor: 15000 }, { envelopeId: ENV.reserva, valor: 5000 }, { envelopeId: ENV.livre, valor: 17000 }] }),
    m({ tipo: "estoque_compra", produtoId: "p-google", qtd: 30, valor: 35010, status: "paga", contaId: "conta-inter", envelopeId: ENV.negocio, data: d(-35), descricao: "Lote de 30 placas Google", fornecedor: "Fornecedor exemplo" }),
    m({ tipo: "estoque_compra", produtoId: "p-pix", qtd: 6, valor: 8400, status: "inicial", contaId: null, envelopeId: ENV.negocio, data: d(-40), descricao: "Estoque que já existia" }),
  ];
  const vendas: [number, string, number, number, number, string][] = [
    [-30, "p-google", 2, 8000, 0, "Padaria (exemplo)"], [-26, "p-google", 1, 8000, 0, "Barbearia (exemplo)"], [-21, "p-pix", 1, 8990, 0, "Mercadinho (exemplo)"],
    [-17, "p-google", 3, 7500, 0, "Clínica (exemplo)"], [-12, "p-google", 2, 8000, 0, "Pet shop (exemplo)"], [-6, "p-google", 1, 8000, 0, "Lanchonete (exemplo)"],
  ];
  for (const [dia, prod, qtd, preco, desc, cliente] of vendas) {
    movs.push(m({ tipo: "venda", produtoId: prod, qtd, precoUnit: preco, desconto: desc, forma: "Pix", cliente, cancelada: false, data: d(dia), descricao: "Venda", recebimentos: [{ id: novoId(), valor: qtd * preco - desc, data: d(dia), contaId: "conta-inter" }], despesasDiretas: 0, custoAdicionalUnit: 0, envelopeId: ENV.negocio, previstaPara: null }));
  }
  movs.push(m({ tipo: "venda", produtoId: "p-google", qtd: 2, precoUnit: 8000, desconto: 1000, forma: "Pix", cliente: "Restaurante (exemplo)", cancelada: false, data: d(-4), descricao: "Venda", recebimentos: [{ id: novoId(), valor: 5000, data: d(-4), contaId: "conta-inter" }], despesasDiretas: 600, contaDespesasId: "conta-dinheiro", custoAdicionalUnit: 0, envelopeId: ENV.negocio, previstaPara: d(3) }));
  movs.push(m({ tipo: "despesa", valor: 2500, categoria: "Transporte e prospecção", escopo: "negocio", envelopeId: ENV.negocio, status: "paga", contaId: "conta-dinheiro", data: d(-15), descricao: "Uber para prospecção" }));
  // Trabalhos e distribuição
  const rec1 = m<Extract<Movimento, { tipo: "receita" }>>({ tipo: "receita", valor: 25000, fonteId: "eventos", contaId: "conta-inter", status: "recebida", data: d(-20), descricao: "Recreação em festa (exemplo)" });
  movs.push(rec1, m({ tipo: "envelope", origem: "distribuicao", data: d(-20), descricao: "Distribuição", receitaId: rec1.id, itens: [{ envelopeId: ENV.obrigacoes, valor: 13000 }, { envelopeId: ENV.pc, valor: 3600 }, { envelopeId: ENV.reserva, valor: 2400 }, { envelopeId: ENV.livre, valor: 6000 }] }));
  const rec2 = m<Extract<Movimento, { tipo: "receita" }>>({ tipo: "receita", valor: 18000, fonteId: "eventos", contaId: "conta-inter", status: "recebida", data: d(-9), descricao: "Evento corporativo (exemplo)" });
  movs.push(rec2, m({ tipo: "envelope", origem: "distribuicao", data: d(-9), descricao: "Distribuição", receitaId: rec2.id, itens: [{ envelopeId: ENV.obrigacoes, valor: 8000 }, { envelopeId: ENV.pc, valor: 3000 }, { envelopeId: ENV.reserva, valor: 2000 }, { envelopeId: ENV.livre, valor: 5000 }] }));
  movs.push(m({ tipo: "receita", valor: 15000, fonteId: "conteudo", contaId: "conta-inter", status: "pendente", previstaPara: d(-1), data: d(-8), descricao: "Edição de vídeo para cliente (exemplo)" }));
  movs.push(m({ tipo: "receita", valor: 20000, fonteId: "eventos", contaId: "conta-inter", status: "recebida", data: d(0), descricao: "Recreação infantil (exemplo)" }));
  // Gastos
  movs.push(m({ tipo: "despesa", valor: 30000, categoria: "Casa", escopo: "pessoal", envelopeId: ENV.obrigacoes, status: "paga", contaId: "conta-inter", data: d(-24), descricao: "Ajuda em casa (mês passado)", pagaEm: d(-24) }));
  movs.push(m({ tipo: "despesa", valor: 4500, categoria: "Alimentação", escopo: "pessoal", envelopeId: ENV.livre, status: "paga", contaId: "conta-dinheiro", data: d(-7), descricao: "Lanche com amigos" }));
  movs.push(m({ tipo: "cartao_compra", valor: 12000, cartaoId: "cartao-demo", parcelas: 1, categoria: "Compras", escopo: "pessoal", data: d(-5), descricao: "Tênis (exemplo)" }));
  movs.push(m({ tipo: "cartao_compra", valor: 60000, cartaoId: "cartao-demo", parcelas: 6, categoria: "Estudos", escopo: "pessoal", data: d(-18), descricao: "Curso de edição (exemplo)" }));
  movs.push(m({ tipo: "investimento", investimentoId: "inv-demo", direcao: "aporte", valor: 30000, contaId: "conta-inter", envelopeId: null, data: d(-50), descricao: "Aporte inicial" }));
  await db.movimentos.bulkPut(movs);
  // o aporte de 300 saiu do Inter antes da distribuição inicial
  await db.contas.update("conta-inter", { saldoInicial: 85000 + 30000 + 40000 });
  await gerarRecorrencias(db, hoje);
  await db.config.update("cfg", { setupDispensado: true });
}
