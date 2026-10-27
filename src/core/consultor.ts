// Consultor financeiro: respostas por regras e contas, sem IA e sem internet.
// Quando falta dado, ele diz o que falta em vez de chutar. A decisão é sempre sua.

import { addDias, br, diffDias, mesDe } from "./dates";
import { brl, type Cents } from "./money";
import type { Dados } from "./types";
import type { Situacao } from "./situacao";
import { disponivelParaRetirada, indicadores } from "./negocio";
import { aportesSemanais, relatorioPeriodo } from "./relatorios";
import { faturaDaCompra, datasDaFatura } from "./cartao";

export type Veredito = "sim" | "cuidado" | "nao" | "sem-dados" | "info";
export interface Resposta { veredito: Veredito; titulo: string; linhas: string[] }

export function podeComprar(sit: Situacao, d: Dados, valor: Cents, forma: "avista" | "cartao", parcelas = 1): Resposta {
  const linhas: string[] = [];
  if (!(valor > 0)) return { veredito: "sem-dados", titulo: "Coloque o valor da compra", linhas: [] };
  const L = sit.livreReal;
  linhas.push(`Dinheiro livre de verdade agora: ${brl(L)}.`);
  if (sit.cobertura.pessoal.descoberto > 0) linhas.push(`Já descontei ${brl(sit.cobertura.pessoal.descoberto)} de contas até ${br(sit.horizonte)} que ainda não têm dinheiro separado.`);
  if (sit.saldos.aDistribuir > 0) linhas.push(`Há ${brl(sit.saldos.aDistribuir)} a distribuir que não contei como livre.`);
  if (forma === "cartao") {
    const c = d.cartoes.find((x) => !x.arquivado);
    if (!c) return { veredito: "sem-dados", titulo: "Nenhum cartão cadastrado", linhas: ["Cadastre seu cartão em Contas e faturas para eu avaliar compras no crédito."] };
    const n = Math.max(1, parcelas);
    const parcela = Math.ceil(valor / n);
    const key = faturaDaCompra(sit.hoje, c);
    const { vencimento } = datasDaFatura(key, c);
    linhas.push(`No cartão ${c.nome}, ${n > 1 ? `${n}x de ${brl(parcela)}` : brl(valor)}, primeira parcela na fatura que vence em ${br(vencimento)}.`);
    const disp = c.limite - (sit.limiteUsado[c.id] ?? 0);
    if (valor > disp) return { veredito: "nao", titulo: "Não cabe no limite do cartão", linhas: [...linhas, `Limite disponível estimado: ${brl(disp)}.`] };
    if (parcela <= L) return { veredito: n > 1 ? "cuidado" : "sim", titulo: n > 1 ? "Cabe, mas prende seu dinheiro nos próximos meses" : "Dá para comprar", linhas: [...linhas, `Separe ${brl(parcela)} do dinheiro livre para a fatura, senão você gasta o mesmo dinheiro duas vezes.`, n > 1 ? `Serão ${n} meses com ${brl(parcela)} já comprometidos.` : ""].filter(Boolean) };
    return { veredito: "nao", titulo: "A parcela é maior que seu dinheiro livre", linhas: [...linhas, `A fatura vai cobrar ${brl(parcela)} e hoje você tem ${brl(L)} livre. Comprar agora é usar dinheiro de contas ou metas.`] };
  }
  if (valor <= L) {
    return { veredito: "sim", titulo: "Dá para comprar", linhas: [...linhas, `Depois da compra sobram ${brl(L - valor)} livres. Contas, negócio, PC e reserva continuam intactos.`] };
  }
  const falta = valor - L;
  linhas.push(`Faltam ${brl(falta)} de dinheiro livre.`);
  const pc = sit.env.pc;
  if (pc) {
    const sem = aportesSemanais(d, pc.id, sit.hoje);
    const media = Math.floor(sem.reduce((a, b) => a + b, 0) / sem.length);
    linhas.push(media > 0 ? `Se sair do PC, a meta atrasa cerca de ${Math.ceil(falta / media)} semana(s) no seu ritmo atual.` : `Se sair do PC, ele fica ${brl(falta)} mais longe.`);
  }
  linhas.push("A reserva de emergência não foi considerada: ela é só para imprevistos reais.");
  return { veredito: L > 0 ? "cuidado" : "nao", titulo: L > 0 ? "Só com dinheiro que já tem outra finalidade" : "Agora não", linhas };
}

export function gastoSemana(sit: Situacao): Resposta {
  const L = sit.livreReal;
  if (L <= 0) return { veredito: "nao", titulo: "Nada livre esta semana", linhas: [`Seu dinheiro livre real está em ${brl(L)}. Tudo o que você tem já tem destino.`] };
  const [y, m] = sit.hoje.split("-").map(Number);
  const fimMes = `${y}-${String(m).padStart(2, "0")}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
  const semanas = Math.max(1, Math.ceil((diffDias(fimMes, sit.hoje) + 1) / 7));
  return { veredito: "info", titulo: `Até ${brl(L)}, ou ${brl(Math.floor(L / semanas))} por semana até o fim do mês`, linhas: [
    `Você tem ${brl(L)} livres. Como sua renda varia, dividir pelas ${semanas} semana(s) que faltam no mês ajuda a não ficar zerado antes do próximo dinheiro entrar.`,
  ] };
}

export function quantoVenderParaPC(sit: Situacao, d: Dados): Resposta {
  const meta = sit.metas.find((m) => m.envelope.tipo === "pc");
  if (!meta || meta.meta == null) return { veredito: "sem-dados", titulo: "Defina o valor do PC", linhas: ["Em Metas, coloque quanto custa o PC que você quer."] };
  if (meta.falta <= 0) return { veredito: "sim", titulo: "A meta do PC já foi atingida", linhas: [] };
  // Margem real dos seus negócios nos últimos 90 dias (vendas lançadas − gastos do negócio)
  const x = indicadores(d, sit, addDias(sit.hoje, -89), sit.hoje);
  if (!x.faturamento) return { veredito: "sem-dados", titulo: "Ainda não há vendas lançadas", linhas: ["Lance as vendas e os gastos do negócio em Meus negócios. Com algumas semanas de dados eu calculo quanto você precisa vender."] };
  if (x.lucroLiquido <= 0) return { veredito: "nao", titulo: "Nos últimos 90 dias o negócio não deu lucro", linhas: [`Vendas de ${brl(x.faturamento)} e gastos de ${brl(x.despesasOperacionais + x.cmv)}. Antes de pensar no PC, vale rever preço e custos.`] };
  const margem = x.lucroLiquido / x.faturamento;
  const est = d.config.estrategias.find((e) => e.id === d.config.fontes.find((f) => f.id === "nfc")?.estrategiaId);
  const pctPC = est?.regras.find((r) => r.envelopeId === meta.envelope.id && r.modo === "percentual")?.valor ?? 100;
  const tudo = Math.ceil(meta.falta / margem);
  const comRegra = pctPC > 0 && pctPC < 100 ? Math.ceil(meta.falta / (margem * (pctPC / 100))) : tudo;
  const semanas = 90 / 7;
  const porSemana = x.faturamento / semanas;
  const linhas = [
    `Falta ${brl(meta.falta)} para o PC. Nos últimos 90 dias, de cada ${brl(10000)} vendidos sobraram ${brl(Math.round(margem * 10000))} de lucro (margem de ${Math.round(margem * 100)}%).`,
    `Se todo o lucro fosse para o PC: vender mais ${brl(tudo)}.`,
  ];
  if (comRegra !== tudo) linhas.push(`Com a sua regra atual (${pctPC}% do lucro retirado vai para o PC): vender mais ${brl(comRegra)}.`);
  if (porSemana > 0) linhas.push(`No seu ritmo (${brl(Math.round(porSemana))} vendidos por semana), isso leva umas ${Math.ceil(comRegra / porSemana)} semanas.`);
  return { veredito: "info", titulo: `Vender mais ${brl(comRegra)}`, linhas };
}

export function gastandoMais(d: Dados, sit: Situacao): Resposta {
  const ini30 = addDias(sit.hoje, -29), ini90 = addDias(sit.hoje, -89);
  const r30 = relatorioPeriodo(d, sit, ini30, sit.hoje), r90 = relatorioPeriodo(d, sit, ini90, sit.hoje);
  if (r90.ganhos === 0 && r90.gastosPessoais === 0) return { veredito: "sem-dados", titulo: "Ainda não há movimentações suficientes", linhas: ["Registre recebimentos e gastos por algumas semanas."] };
  const linhas = [
    `Últimos 30 dias: ganhou ${brl(r30.ganhos)} (rendas + lucro do negócio) e gastou ${brl(r30.gastosPessoais)} com você.`,
    `Últimos 90 dias: ganhou ${brl(r90.ganhos)} e gastou ${brl(r90.gastosPessoais)}.`,
  ];
  if (r30.resultado < 0) return { veredito: "nao", titulo: "Sim, nos últimos 30 dias você gastou mais do que ganhou", linhas: [...linhas, `Diferença: ${brl(-r30.resultado)}.`] };
  return { veredito: "sim", titulo: "Não, você está gastando menos do que ganha", linhas: [...linhas, r30.taxaPoupanca != null ? `Você guardou ${Math.round(r30.taxaPoupanca * 100)}% do que ganhou no mês.` : ""].filter(Boolean) };
}

export function comprometido(sit: Situacao): Resposta {
  const c = sit.saldos.caixa;
  const linhas = [
    `Dinheiro nas contas: ${brl(c)}.`,
    `Reservado em envelopes (contas, negócio, metas): ${brl(sit.reservado)}.`,
    `Contas a pagar registradas: ${brl(sit.totalAPagar)}${sit.faturaAtual ? `, incluindo ${brl(sit.faturaAtual)} da fatura atual` : ""}.`,
    `Livre de verdade: ${brl(sit.livreReal)}.`,
  ];
  const p = c > 0 ? Math.round(((c - Math.max(0, sit.livreReal)) / c) * 100) : 0;
  return { veredito: "info", titulo: c > 0 ? `${Math.min(100, Math.max(0, p))}% do seu dinheiro já tem destino` : "Você não tem saldo nas contas", linhas };
}

/** Gasto no negócio (ex.: um lote de placas): o caixa do negócio aguenta? */
export function podeComprarLote(sit: Situacao, d: Dados, negocioId: string, valor: Cents): Resposta {
  const e = d.envelopes.find((x) => x.id === negocioId);
  if (!e || !(valor > 0)) return { veredito: "sem-dados", titulo: "Escolha o negócio e o valor", linhas: [] };
  const caixa = sit.saldoEnv(e);
  const contas = sit.compromissos.filter((c) => c.escopo === "negocio" && c.envelopeId === e.id).reduce((a, c) => a + c.valor, 0);
  const minimo = e.minimo ?? 0;
  const livre = caixa - contas;
  const linhas = [`Gasto: ${brl(valor)}.`, `Caixa de ${e.nome}: ${brl(caixa)}${contas ? `, com ${brl(contas)} de contas do negócio a pagar` : ""}.`];
  if (valor <= livre - minimo) return { veredito: "sim", titulo: "Dá, com o dinheiro do negócio", linhas: [...linhas, `Depois do gasto o negócio fica com ${brl(livre - valor)} (mínimo definido: ${brl(minimo)}).`] };
  if (valor <= livre) return { veredito: "cuidado", titulo: "Dá, mas o caixa fica abaixo do mínimo", linhas: [...linhas, `Sobram ${brl(livre - valor)}, abaixo do capital de giro mínimo de ${brl(minimo)}.`] };
  return { veredito: "nao", titulo: "O negócio não tem dinheiro para isso agora", linhas: [...linhas, `Faltam ${brl(valor - livre)}. Se for usar dinheiro pessoal, mova primeiro para o envelope do negócio (Aporte em objetivo), para não misturar.`] };
}

export function reservarFatura(sit: Situacao, d: Dados): Resposta {
  if (!d.cartoes.length) return { veredito: "sem-dados", titulo: "Nenhum cartão cadastrado", linhas: [] };
  const prox = sit.compromissos.filter((c) => c.origem === "fatura").sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (!prox) return { veredito: "sim", titulo: "Nenhuma fatura em aberto", linhas: [] };
  const obr = sit.saldoEnv(sit.env.obrigacoes);
  const outras = sit.compromissos.filter((c) => c.escopo === "pessoal" && c.chave !== prox.chave && c.vencimento <= prox.vencimento).reduce((a, c) => a + c.valor, 0);
  const sobraPraFatura = Math.max(0, obr - outras);
  const falta = Math.max(0, prox.valor - sobraPraFatura);
  return { veredito: falta ? "cuidado" : "sim", titulo: falta ? `Separe mais ${brl(falta)} para a fatura` : "A fatura já está coberta", linhas: [
    `${prox.descricao}: ${brl(prox.valor)}, vence em ${br(prox.vencimento)}.`,
    `No envelope de obrigações há ${brl(obr)}${outras ? `, mas ${brl(outras)} são de outras contas que vencem antes` : ""}.`,
  ] };
}

export function lucroMes(d: Dados, sit: Situacao): Resposta {
  const k = mesDe(sit.hoje);
  const x = indicadores(d, sit, `${k}-01`, `${k}-31`);
  if (!x.vendas) return { veredito: "sem-dados", titulo: "Nenhuma venda lançada este mês", linhas: [] };
  return { veredito: x.lucroLiquido > 0 ? "sim" : "nao", titulo: `Lucro líquido de ${brl(x.lucroLiquido)} este mês`, linhas: [
    `Vendas de ${brl(x.faturamento)}. Recebido de fato: ${brl(x.recebido)}.`,
    `Gastos do negócio: ${brl(x.despesasOperacionais + x.cmv)}. Lucro líquido: ${brl(x.lucroLiquido)}${x.margem != null ? ` (margem de ${Math.round(x.margem * 100)}%)` : ""}.`,
    `Disponível para retirar sem travar o negócio: ${brl(disponivelParaRetirada(d, sit).valor)}.`,
  ] };
}

export interface Risco { nivel: 1 | 2 | 3; texto: string }

export function riscos(sit: Situacao, d: Dados): Risco[] {
  const r: Risco[] = [];
  const vencidas = sit.compromissos.filter((c) => c.atrasado);
  if (vencidas.length) r.push({ nivel: 3, texto: `${vencidas.length} conta(s) vencida(s), somando ${brl(vencidas.reduce((a, c) => a + c.valor, 0))}.` });
  if (sit.cobertura.pessoal.descoberto > 0) r.push({ nivel: 3, texto: `${brl(sit.cobertura.pessoal.descoberto)} de contas até ${br(sit.horizonte)} sem dinheiro separado.` });
  if (sit.livreReal < 0) r.push({ nivel: 3, texto: `Você já gastou ${brl(-sit.livreReal)} além do que estava livre.` });
  if (sit.saldos.caixa < 0) r.push({ nivel: 3, texto: "O saldo das suas contas está negativo." });
  if (sit.cobertura.negocio.descoberto > 0) r.push({ nivel: 2, texto: `O negócio tem ${brl(sit.cobertura.negocio.descoberto)} de contas próximas sem caixa.` });
  const reserva = sit.metas.find((m) => m.envelope.tipo === "reserva");
  if (reserva && reserva.saldo <= 0) r.push({ nivel: 2, texto: "Você ainda não tem reserva de emergência." });
  if (sit.reposicao.itens.length) r.push({ nivel: 2, texto: `Estoque abaixo do mínimo em ${sit.reposicao.itens.map((i) => i.produto.nome).join(", ")}.` });
  const atrasados = sit.aReceber.filter((a) => a.atrasado);
  if (atrasados.length) r.push({ nivel: 2, texto: `${brl(atrasados.reduce((a, x) => a + x.valor, 0))} a receber com a data já passada.` });
  for (const c of d.cartoes) {
    const disp = c.limite - (sit.limiteUsado[c.id] ?? 0);
    if (c.limite > 0 && disp < c.limite * 0.2) r.push({ nivel: 2, texto: `O cartão ${c.nome} está com menos de 20% do limite livre.` });
  }
  return r.sort((a, b) => b.nivel - a.nivel);
}

export function maiorRisco(sit: Situacao, d: Dados): Resposta {
  const r = riscos(sit, d);
  if (!r.length) return { veredito: "sim", titulo: "Nenhum risco importante agora", linhas: ["Contas cobertas, nada vencido e nenhum envelope negativo."] };
  return { veredito: r[0].nivel === 3 ? "nao" : "cuidado", titulo: r[0].texto, linhas: r.slice(1).map((x) => x.texto) };
}

