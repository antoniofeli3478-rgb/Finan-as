// Ligação com o app Plaquinhas NFC.
//
// Os dois apps ficam no mesmo endereço (antoniofeli3478-rgb.github.io), então o navegador deixa
// o Finanças LER o que o Plaquinhas NFC guarda (chave "placas-nfc:v1" do localStorage).
// O Finanças só lê: nunca grava nada nos dados das placas.
//
// Cada venda e cada entrada de estoque do NFC vira, aqui dentro, uma venda/compra "somente leitura"
// (id começando com "nfc:"). Assim o lucro, o caixa do negócio, o a receber e a retirada pessoal
// usam os números reais do app das placas, sem você digitar nada duas vezes.
//
// Dinheiro anterior à data da ligação ("desde") não entra no caixa: ele já está no saldo que você
// informou nas contas. Essas vendas continuam valendo para faturamento e lucro.

import { diffDias, isISODate, type ISODate } from "../core/dates";
import type { Cents } from "../core/money";
import type { CompraEstoque, ID, Produto, Recebimento, Venda } from "../core/types";

export const CHAVE_NFC = "placas-nfc:v1";
export const URL_APP_NFC = "https://antoniofeli3478-rgb.github.io/claude-skills/";
export const PREFIXO = "nfc:";

export interface LigacaoNfc {
  ativo: boolean;
  /** Conta onde cai o dinheiro das placas (Pix, dinheiro, cartão). */
  contaId: ID;
  /** A partir de quando o dinheiro das placas passa a entrar no caixa do Finanças. */
  desde: ISODate;
}

/** Formato guardado pelo app Plaquinhas NFC (versões 1.0 a 1.3). Valores em REAIS. */
interface NfcPagamento { forma: string; valor: number; recebidoEm?: string }
interface NfcMov {
  id: string; mov: "venda" | "entrada" | "loja"; tipo: string; qtd: number; valor?: number; preco?: number;
  data: string; quem?: string; obs?: string; pag?: string; pagamentos?: NfcPagamento[]; taxa?: number;
  consigId?: string; acertos?: { data: string; devolvidas: number }[]; criadoEm?: number;
}
interface NfcTipo { id: string; nome: string; cor?: string }
interface NfcEstado { tipos: NfcTipo[]; movs: NfcMov[]; cfg?: { taxaCartao?: number } }

export interface EstoqueNfc { tipoId: string; nome: string; cor?: string; emEstoque: number; naLoja: number; recebidas: number; vendidas: number }

export interface ResultadoNfc {
  encontrado: boolean;
  erro: string | null;
  registros: number;
  vendas: number;
  estoque: EstoqueNfc[];
  produtos: Produto[];
  vendasConv: Venda[];
  compras: CompraEstoque[];
}

const vazio = (erro: string | null = null): ResultadoNfc => ({ encontrado: false, erro, registros: 0, vendas: 0, estoque: [], produtos: [], vendasConv: [], compras: [] });

const cents = (v: unknown): Cents => Math.round((Number(v) || 0) * 100);

/** Lê o texto guardado pelo app das placas (ou null se não houver neste aparelho). */
export function lerTextoNfc(): string | null {
  try { return localStorage.getItem(CHAVE_NFC); } catch { return null; }
}

function valido(x: unknown): x is NfcEstado {
  const o = x as NfcEstado;
  return !!o && Array.isArray(o.tipos) && Array.isArray(o.movs);
}

/** Quanto ainda falta receber numa venda do NFC. */
const pendenteNfc = (m: NfcMov) => (m.pagamentos ?? []).filter((p) => p.forma === "A receber").reduce((a, p) => a + cents(p.valor), 0);

export function converterNfc(texto: string | null, lig: LigacaoNfc | null, envNegocioId: ID): ResultadoNfc {
  if (!texto) return vazio();
  let bruto: unknown;
  try { bruto = JSON.parse(texto); } catch { return vazio("Os dados do Plaquinhas NFC neste aparelho não puderam ser lidos."); }
  if (!valido(bruto)) return vazio("Os dados do Plaquinhas NFC estão num formato desconhecido.");
  const S = bruto;
  const desde = lig && isISODate(lig.desde) ? lig.desde : "9999-12-31";
  const conta = lig?.contaId ?? "";
  const antes = (data: string) => diffDias(data, desde) < 0;
  const taxaPadrao = S.cfg?.taxaCartao ?? 0;
  const movs = S.movs.filter((m) => m && typeof m.id === "string" && isISODate(m.data) && Number.isFinite(m.qtd) && m.qtd > 0);

  // Produtos = tipos de placa. Custo de referência = custo médio das entradas com custo.
  const produtos: Produto[] = [];
  const idsTipo = new Set(S.tipos.map((t) => t.id).concat(movs.map((m) => m.tipo)));
  for (const tid of idsTipo) {
    const t = S.tipos.find((x) => x.id === tid);
    const ent = movs.filter((m) => m.mov === "entrada" && m.tipo === tid && (m.valor ?? 0) > 0);
    const qtdC = ent.reduce((a, m) => a + m.qtd, 0);
    const custo = qtdC ? Math.round(ent.reduce((a, m) => a + cents(m.valor), 0) / qtdC) : 0;
    const ven = movs.filter((m) => m.mov === "venda" && m.tipo === tid);
    const qtdV = ven.reduce((a, m) => a + m.qtd, 0);
    const preco = qtdV ? Math.round(ven.reduce((a, m) => a + cents(m.valor), 0) / qtdV) : 0;
    produtos.push({ id: PREFIXO + tid, nome: t?.nome ?? "Tipo apagado", categoria: "Plaquinhas NFC", precoVenda: preco, custoReferencia: custo, custoHistorico: [], custoAdicional: 0, estoqueMinimo: 5, ativo: true });
  }

  const compras: CompraEstoque[] = movs.filter((m) => m.mov === "entrada").map((m) => {
    const valor = cents(m.valor);
    // Compra depois da ligação e com custo: saiu do caixa do negócio. Antes disso, ou sem custo, só entra no estoque.
    const paga = valor > 0 && !antes(m.data) && !!conta;
    return {
      id: PREFIXO + m.id, tipo: "estoque_compra", produtoId: PREFIXO + m.tipo, qtd: m.qtd, valor, status: paga ? "paga" : "inicial",
      contaId: paga ? conta : null, envelopeId: envNegocioId, vencimento: null, pagaEm: paga ? m.data : null, fornecedor: m.quem ?? "",
      data: m.data, descricao: `Entrada de ${m.qtd} placa(s) no Plaquinhas NFC`, criadoEm: m.criadoEm ?? 0, atualizadoEm: m.criadoEm ?? 0,
    };
  });

  const vendasConv: Venda[] = movs.filter((m) => m.mov === "venda").map((m) => {
    const total = cents(m.valor);
    const precoUnit = m.preco != null ? cents(m.preco) : Math.round(total / m.qtd);
    const desconto = m.qtd * precoUnit - total; // corrige arredondamento para o total bater
    const pend = pendenteNfc(m);
    const recebidoTotal = Math.max(0, total - pend);
    const pags = (m.pagamentos ?? (m.pag ? [{ forma: m.pag, valor: m.valor ?? 0 }] : [])).filter((p) => p.forma !== "A receber");
    const recebimentos: Recebimento[] = [];
    let somado = 0;
    pags.forEach((p, i) => {
      const v = Math.min(cents(p.valor), recebidoTotal - somado);
      if (v <= 0) return;
      somado += v;
      const dt = p.recebidoEm && isISODate(p.recebidoEm) ? p.recebidoEm : m.data;
      recebimentos.push({ id: `${PREFIXO}${m.id}:${i}`, valor: v, data: dt, contaId: conta, historico: antes(dt) || !conta });
    });
    // Vendas antigas sem forma de pagamento: o NFC considera recebidas
    if (recebidoTotal - somado > 0) recebimentos.push({ id: `${PREFIXO}${m.id}:resto`, valor: recebidoTotal - somado, data: m.data, contaId: conta, historico: antes(m.data) || !conta });
    // Taxa da maquininha sobre a parte paga no cartão
    const taxa = m.taxa != null && m.taxa >= 0 ? m.taxa : taxaPadrao;
    const noCartao = (m.pagamentos ?? []).filter((p) => p.forma === "Cartão").reduce((a, p) => a + cents(p.valor), 0);
    const taxaCents = Math.round((noCartao * taxa) / 100);
    const formas = [...new Set((m.pagamentos ?? []).map((p) => p.forma))].join(" + ") || m.pag || "";
    return {
      id: PREFIXO + m.id, tipo: "venda", produtoId: PREFIXO + m.tipo, qtd: m.qtd, precoUnit, desconto, forma: formas,
      cliente: m.quem ?? "", cancelada: false, recebimentos, previstaPara: null,
      despesasDiretas: taxaCents, contaDespesasId: taxaCents > 0 && !antes(m.data) && conta ? conta : null, custoAdicionalUnit: 0,
      envelopeId: envNegocioId, data: m.data, descricao: m.consigId ? "Venda pela loja (Plaquinhas NFC)" : "Venda no Plaquinhas NFC",
      nota: m.obs, criadoEm: m.criadoEm ?? 0, atualizadoEm: m.criadoEm ?? 0,
    };
  });

  // Estoque como o app das placas mostra (inclui placas deixadas em lojas)
  const estoque: EstoqueNfc[] = [...idsTipo].map((tid) => {
    const t = S.tipos.find((x) => x.id === tid);
    const recebidas = movs.filter((m) => m.mov === "entrada" && m.tipo === tid).reduce((a, m) => a + m.qtd, 0);
    const vendidas = movs.filter((m) => m.mov === "venda" && m.tipo === tid).reduce((a, m) => a + m.qtd, 0);
    const naLoja = movs.filter((m) => m.mov === "loja" && m.tipo === tid).reduce((a, l) => {
      const vend = movs.filter((v) => v.mov === "venda" && v.consigId === l.id).reduce((x, v) => x + v.qtd, 0);
      const dev = (l.acertos ?? []).reduce((x, ac) => x + (ac.devolvidas || 0), 0);
      return a + Math.max(0, l.qtd - vend - dev);
    }, 0);
    return { tipoId: tid, nome: t?.nome ?? "Tipo apagado", cor: t?.cor, recebidas, vendidas, naLoja, emEstoque: recebidas - vendidas - naLoja };
  });

  return { encontrado: true, erro: null, registros: movs.length, vendas: vendasConv.length, estoque, produtos, vendasConv, compras };
}

export const ehDoNfc = (id: string) => id.startsWith(PREFIXO);
