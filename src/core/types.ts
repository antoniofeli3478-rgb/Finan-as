// Modelo de dados do Gerente Financeiro.
//
// Regra central: SALDOS NÃO SÃO GUARDADOS. Eles são sempre recalculados a partir das
// movimentações (ver ledger.ts). Editar ou apagar uma movimentação refaz todas as contas,
// e o saldo de um envelope sempre bate com o histórico dele.

import type { Cents } from "./money";
import type { ISODate } from "./dates";

export type ID = string;

/** Onde o dinheiro está de verdade: banco, carteira, conta do negócio. */
export interface Conta {
  id: ID;
  nome: string;
  tipo: "banco" | "dinheiro" | "outro";
  saldoInicial: Cents;
  /** Último saldo que a pessoa conferiu no banco, para conciliação. */
  conferido?: { data: ISODate; saldo: Cents } | null;
  arquivada: boolean;
  ordem: number;
}

export type TipoEnvelope = "obrigacoes" | "negocio" | "pc" | "reserva" | "investimentos" | "livre" | "objetivo";

/**
 * Para que o dinheiro serve. A soma dos envelopes + "a distribuir" é igual ao dinheiro nas contas.
 * Envelopes com meta (PC, reserva, objetivos) funcionam como metas de economia.
 */
export interface Envelope {
  id: ID;
  nome: string;
  tipo: TipoEnvelope;
  cor: string;
  /** Meta em centavos (PC, reserva, objetivos). null = sem meta. */
  meta: Cents | null;
  /** Reserva: meta manual ou "meses de despesas essenciais". */
  metaModo?: "manual" | "despesas";
  mesesReserva?: number;
  /** Prazo desejado da meta. */
  prazo?: ISODate | null;
  /** Negócio: capital de giro mínimo que nunca deve ser retirado. */
  minimo?: Cents;
  arquivado: boolean;
  ordem: number;
}

export type Escopo = "pessoal" | "negocio";

export interface Base {
  id: ID;
  data: ISODate;
  descricao: string;
  nota?: string;
  criadoEm: number;
  atualizadoEm: number;
}

/** Dinheiro que entra para você (trabalho, conteúdo, outras rendas). */
export interface Receita extends Base {
  tipo: "receita";
  valor: Cents;
  fonteId: ID;
  contaId: ID;
  status: "recebida" | "pendente";
  /** Para pendentes: quando você espera receber. */
  previstaPara?: ISODate | null;
}

/** Gasto pago na hora (pix, débito, dinheiro) ou conta a pagar (pendente). */
export interface Despesa extends Base {
  tipo: "despesa";
  valor: Cents;
  categoria: string;
  escopo: Escopo;
  /** Envelope de onde o dinheiro sai quando for pago. */
  envelopeId: ID;
  status: "paga" | "pendente";
  /** Conta de onde saiu (paga) ou vai sair. */
  contaId?: ID | null;
  vencimento?: ISODate | null;
  pagaEm?: ISODate | null;
  prioridade?: 1 | 2 | 3;
  /** Gerada por uma conta recorrente. */
  recorrenciaId?: ID | null;
  ocorrencia?: ISODate | null;
  /** Valor ainda é estimativa (conta variável, ex.: fatura de luz). */
  estimado?: boolean;
}

/** Entre suas próprias contas. Não é receita nem despesa. */
export interface Transferencia extends Base {
  tipo: "transferencia";
  valor: Cents;
  deContaId: ID;
  paraContaId: ID;
}

/**
 * Muda a finalidade do dinheiro, sem tirar de conta nenhuma.
 * Itens positivos sem contrapartida saem de "a distribuir"; negativos voltam para lá.
 */
export interface MovEnvelope extends Base {
  tipo: "envelope";
  origem: "distribuicao" | "transferencia" | "retirada" | "aporte";
  itens: { envelopeId: ID; valor: Cents }[];
  /** Recebimento que originou a distribuição (para não distribuir duas vezes). */
  receitaId?: ID | null;
}

export interface CompraCartao extends Base {
  tipo: "cartao_compra";
  valor: Cents;
  cartaoId: ID;
  parcelas: number;
  categoria: string;
  escopo: Escopo;
}

export interface PagamentoFatura extends Base {
  tipo: "cartao_pagamento";
  valor: Cents;
  cartaoId: ID;
  /** Fatura paga, pelo mês de fechamento "AAAA-MM". */
  fatura: string;
  contaId: ID;
  envelopeId: ID;
}

/** Compra de placas/materiais que entram no estoque. */
export interface CompraEstoque extends Base {
  tipo: "estoque_compra";
  produtoId: ID;
  qtd: number;
  valor: Cents;
  /** "inicial" = estoque que você já tinha antes de usar o app (não mexe no dinheiro). */
  status: "paga" | "pendente" | "inicial";
  contaId?: ID | null;
  envelopeId: ID;
  vencimento?: ISODate | null;
  pagaEm?: ISODate | null;
  fornecedor?: string;
}

export interface Recebimento {
  id: ID; valor: Cents; data: ISODate; contaId: ID;
  /** Recebido antes de o app acompanhar o caixa (já está no saldo informado): conta no faturamento, não no caixa. */
  historico?: boolean;
}

export interface Venda extends Base {
  tipo: "venda";
  produtoId: ID;
  qtd: number;
  precoUnit: Cents;
  desconto: Cents;
  forma: string;
  cliente?: string;
  cancelada: boolean;
  recebimentos: Recebimento[];
  previstaPara?: ISODate | null;
  /** Gastos ligados a esta venda (ex.: transporte). Saem do envelope do negócio na data da venda. */
  despesasDiretas: Cents;
  contaDespesasId?: ID | null;
  /** Custo adicional por unidade (embalagem, gravação) no momento da venda. */
  custoAdicionalUnit: Cents;
  envelopeId: ID;
}

export interface MovInvestimento extends Base {
  tipo: "investimento";
  investimentoId: ID;
  direcao: "aporte" | "resgate";
  valor: Cents;
  contaId: ID;
  envelopeId: ID | null;
}

/** Corrige o saldo de uma conta para bater com o banco. */
export interface Ajuste extends Base {
  tipo: "ajuste";
  contaId: ID;
  valor: Cents;
}

export type Movimento =
  | Receita | Despesa | Transferencia | MovEnvelope | CompraCartao | PagamentoFatura
  | CompraEstoque | Venda | MovInvestimento | Ajuste;

export type TipoMov = Movimento["tipo"];

/** Campos de uma movimentação nova (sem id e datas de controle), tipo por tipo. */
export type NovoMov<T extends Movimento = Movimento> = T extends Movimento ? Omit<T, "id" | "criadoEm" | "atualizadoEm"> : never;

export interface Recorrencia {
  id: ID;
  nome: string;
  valor: Cents;
  variavel: boolean;
  categoria: string;
  escopo: Escopo;
  envelopeId: ID;
  frequencia: "semanal" | "mensal" | "anual" | "dias";
  /** A cada quantas unidades (ex.: a cada 2 semanas, a cada 15 dias). */
  intervalo: number;
  /** Primeiro vencimento. */
  inicio: ISODate;
  /** Até que data as ocorrências já foram criadas (evita duplicar ao reabrir o app). */
  geradoAte: ISODate | null;
  prioridade: 1 | 2 | 3;
  ativa: boolean;
  /** Conta sugerida para pagar. */
  contaId?: ID | null;
}

export interface Cartao {
  id: ID;
  nome: string;
  limite: Cents;
  limiteDisponivelInformado?: Cents | null;
  fechamentoDia: number;
  vencimentoDia: number;
  arquivado: boolean;
}

export interface Produto {
  id: ID;
  nome: string;
  categoria: string;
  precoVenda: Cents;
  /** Custo por unidade usado nas simulações e quando não há estoque com custo conhecido. */
  custoReferencia: Cents;
  custoHistorico: { data: ISODate; custo: Cents }[];
  custoAdicional: Cents;
  estoqueMinimo: number;
  fornecedor?: string;
  ativo: boolean;
}

export interface Investimento {
  id: ID;
  nome: string;
  instituicao: string;
  /** Valor atual informado por você. O app não inventa rentabilidade. */
  valorAtual: Cents;
  atualizadoEm: ISODate | null;
  observacoes?: string;
  arquivado: boolean;
}

export interface Fonte {
  id: ID;
  nome: string;
  estrategiaId: ID;
}

export interface RegraDistribuicao {
  envelopeId: ID;
  /** necessidade: só o que falta (contas, capital de giro). percentual: % do que sobrou. */
  modo: "necessidade" | "percentual";
  valor: number;
}

export interface Estrategia {
  id: ID;
  nome: string;
  regras: RegraDistribuicao[];
  /** Envelope que recebe o que sobrar. */
  restoEnvelopeId: ID;
}

export interface Config {
  id: "cfg";
  versao: number;
  tema: "escuro" | "claro" | "sistema";
  /** Quantos dias à frente contam como "contas próximas". */
  horizonteDias: number;
  fontes: Fonte[];
  estrategias: Estrategia[];
  ultimoBackup: number | null;
  /** Passos do assistente inicial já feitos. */
  setup: { [passo: string]: boolean };
  setupDispensado: boolean;
  categorias: { pessoal: string[]; negocio: string[] };
  /** Negócios ligados (apps separados). Por enquanto: Plaquinhas NFC. */
  negocios?: { nfc?: { ativo: boolean; contaId: ID; desde: ISODate } };
}

export interface Dados {
  contas: Conta[];
  envelopes: Envelope[];
  movimentos: Movimento[];
  recorrencias: Recorrencia[];
  cartoes: Cartao[];
  produtos: Produto[];
  investimentos: Investimento[];
  config: Config;
}
