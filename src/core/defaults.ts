// Configuração inicial. Valores citados por você aparecem só como SUGESTÕES editáveis
// (no assistente), nunca como saldos.

import type { Config, Envelope, Estrategia, Fonte } from "./types";

export const ENV = { obrigacoes: "env-obrigacoes", negocio: "env-negocio", pc: "env-pc", reserva: "env-reserva", investimentos: "env-investimentos", livre: "env-livre" } as const;

export function envelopesIniciais(): Envelope[] {
  return [
    { id: ENV.obrigacoes, nome: "Obrigações", tipo: "obrigacoes", cor: "#e0a458", meta: null, arquivado: false, ordem: 1 },
    { id: ENV.negocio, nome: "Plaquinhas NFC", tipo: "negocio", cor: "#5aa9e6", meta: null, minimo: 0, arquivado: false, ordem: 2 },
    { id: ENV.pc, nome: "Meta do PC", tipo: "pc", cor: "#b38cff", meta: 500000, prazo: null, arquivado: false, ordem: 3 },
    { id: ENV.reserva, nome: "Reserva de emergência", tipo: "reserva", cor: "#4fbf9f", meta: null, metaModo: "despesas", mesesReserva: 3, arquivado: false, ordem: 4 },
    { id: ENV.investimentos, nome: "Para investir", tipo: "investimentos", cor: "#7fc8a9", meta: null, arquivado: false, ordem: 5 },
    { id: ENV.livre, nome: "Dinheiro livre", tipo: "livre", cor: "#f2c14e", meta: null, arquivado: false, ordem: 6 },
  ];
}

export function estrategiasIniciais(): Estrategia[] {
  const obr = { envelopeId: ENV.obrigacoes, modo: "necessidade" as const, valor: 100 };
  return [
    { id: "est-trabalho", nome: "Trabalhos e eventos", restoEnvelopeId: ENV.livre, regras: [obr, { envelopeId: ENV.pc, modo: "percentual", valor: 30 }, { envelopeId: ENV.reserva, modo: "percentual", valor: 20 }] },
    { id: "est-nfc", nome: "Lucro retirado dos negócios", restoEnvelopeId: ENV.livre, regras: [obr, { envelopeId: ENV.pc, modo: "percentual", valor: 40 }, { envelopeId: ENV.reserva, modo: "percentual", valor: 20 }] },
    { id: "est-outras", nome: "Outras rendas", restoEnvelopeId: ENV.livre, regras: [obr, { envelopeId: ENV.pc, modo: "percentual", valor: 25 }, { envelopeId: ENV.reserva, modo: "percentual", valor: 25 }] },
    { id: "est-extra", nome: "Receitas extraordinárias", restoEnvelopeId: ENV.livre, regras: [obr, { envelopeId: ENV.negocio, modo: "necessidade", valor: 30 }, { envelopeId: ENV.reserva, modo: "percentual", valor: 40 }, { envelopeId: ENV.pc, modo: "percentual", valor: 40 }] },
  ];
}

export function fontesIniciais(): Fonte[] {
  return [
    { id: "eventos", nome: "Eventos e recreação", estrategiaId: "est-trabalho" },
    { id: "temporario", nome: "Serviços temporários", estrategiaId: "est-trabalho" },
    { id: "conteudo", nome: "Conteúdo e serviços digitais", estrategiaId: "est-outras" },
    { id: "nfc", nome: "Retirada de negócio", estrategiaId: "est-nfc" },
    { id: "outras", nome: "Outras rendas", estrategiaId: "est-outras" },
    { id: "extra", nome: "Receita extraordinária", estrategiaId: "est-extra" },
  ];
}

export const SCHEMA_VERSION = 1;

export function configInicial(): Config {
  return {
    id: "cfg", versao: SCHEMA_VERSION, tema: "escuro", horizonteDias: 30,
    fontes: fontesIniciais(), estrategias: estrategiasIniciais(), ultimoBackup: null, setup: {}, setupDispensado: false,
    categorias: {
      pessoal: ["Casa", "Academia e esporte", "Assinaturas", "Alimentação", "Lazer", "Transporte", "Compras", "Saúde", "Estudos", "Outros"],
      negocio: ["Compra de mercadoria", "Transporte e prospecção", "Embalagens", "Materiais", "Taxas", "Divulgação", "Outros do negócio"],
    },
  };
}

/** Sugestões tiradas do que você contou. Aparecem no assistente para você aceitar ou mudar. */
export const SUGESTOES = {
  contas: [
    { nome: "Ajuda em casa", valor: 30000, categoria: "Casa", prioridade: 1 as const },
    { nome: "Academia", valor: 16000, categoria: "Academia e esporte", prioridade: 2 as const },
    { nome: "Spotify", valor: 1300, categoria: "Assinaturas", prioridade: 3 as const },
    { nome: "Muay Thai (se confirmar)", valor: 13000, categoria: "Academia e esporte", prioridade: 3 as const },
    { nome: "Assinatura do Claude", valor: 0, categoria: "Assinaturas", prioridade: 2 as const },
  ],
  produtos: [
    { nome: "Placa NFC Google Avaliações", categoria: "Google", precoVenda: 8000, custoReferencia: 1400 },
    { nome: "Placa NFC Pix", categoria: "Pix", precoVenda: 8990, custoReferencia: 1400 },
  ],
  pcMeta: 500000,
  pcFaixa: [400000, 600000],
};
