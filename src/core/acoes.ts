// "O que preciso fazer agora?": ações concretas calculadas dos seus dados.

import { br, diffDias } from "./dates";
import { brl } from "./money";
import type { Dados } from "./types";
import type { Situacao } from "./situacao";
import { disponivelParaRetirada } from "./negocio";

export type TipoAcao = "pagar" | "distribuir" | "reservar" | "cobrar" | "repor" | "fatura" | "cobrir" | "conciliar" | "backup" | "configurar" | "retirar";

export interface Acao { tipo: TipoAcao; urgencia: 1 | 2 | 3; titulo: string; detalhe: string; alvo?: string }

export function acoesAgora(sit: Situacao, d: Dados, agoraMs: number): Acao[] {
  const a: Acao[] = [];
  for (const c of sit.compromissos.filter((c) => c.atrasado)) {
    a.push({ tipo: c.origem === "fatura" ? "fatura" : "pagar", urgencia: 3, titulo: `Pagar ${c.descricao}`, detalhe: `${brl(c.valor)} venceu em ${br(c.vencimento)}.`, alvo: c.chave });
  }
  if (sit.saldos.aDistribuir > 0) a.push({ tipo: "distribuir", urgencia: 3, titulo: `Distribuir ${brl(sit.saldos.aDistribuir)}`, detalhe: "Dinheiro que entrou e ainda não tem destino. Enquanto não for distribuído, ele não conta como livre." });
  if (sit.saldos.aDistribuir < 0) a.push({ tipo: "cobrir", urgencia: 3, titulo: "Seus envelopes somam mais que o dinheiro nas contas", detalhe: `Diferença de ${brl(-sit.saldos.aDistribuir)}. Confira o saldo do banco (conciliação) ou tire dinheiro de algum envelope.` });
  if (sit.cobertura.pessoal.descoberto > 0) {
    const prox = sit.compromissos.find((c) => c.escopo === "pessoal" && !c.atrasado);
    a.push({ tipo: "reservar", urgencia: 2, titulo: `Separar ${brl(sit.cobertura.pessoal.descoberto)} para contas`, detalhe: prox ? `A próxima é ${prox.descricao}, ${brl(prox.valor)} em ${br(prox.vencimento)}.` : "Contas próximas sem dinheiro reservado." });
  }
  for (const f of sit.compromissos.filter((c) => c.origem === "fatura" && !c.atrasado && diffDias(c.vencimento, sit.hoje) <= 7)) {
    a.push({ tipo: "fatura", urgencia: 2, titulo: `Revisar e pagar ${f.descricao}`, detalhe: `${brl(f.valor)} vence em ${br(f.vencimento)}.`, alvo: f.chave });
  }
  for (const e of d.envelopes) {
    const s = sit.saldos.envelopes[e.id] ?? 0;
    if (s < 0) a.push({ tipo: "cobrir", urgencia: 2, titulo: `${e.nome} está negativo`, detalhe: `Faltam ${brl(-s)}: você gastou mais do que tinha separado ali.`, alvo: e.id });
  }
  for (const r of sit.aReceber.filter((r) => r.atrasado)) a.push({ tipo: "cobrar", urgencia: 2, titulo: `Cobrar ${r.descricao}`, detalhe: `${brl(r.valor)} previsto para ${br(r.previsto)}.`, alvo: r.movId });
  if (sit.reposicao.itens.length) a.push({ tipo: "repor", urgencia: 1, titulo: "Repor estoque", detalhe: `${sit.reposicao.itens.map((i) => `${i.produto.nome}: faltam ${i.falta}`).join("; ")}. Custo estimado ${brl(sit.reposicao.total)}.` });
  const ret = disponivelParaRetirada(d, sit);
  if (ret.valor > 0 && sit.livreReal < 0) a.push({ tipo: "retirar", urgencia: 1, titulo: `O negócio pode te pagar ${brl(ret.valor)}`, detalhe: "Seu dinheiro livre está negativo e o negócio tem sobra além do capital de giro." });
  for (const c of d.contas.filter((c) => !c.arquivada)) {
    if (!c.conferido || diffDias(sit.hoje, c.conferido.data) > 14) a.push({ tipo: "conciliar", urgencia: 1, titulo: `Conferir o saldo de ${c.nome}`, detalhe: c.conferido ? `Última conferência em ${br(c.conferido.data)}.` : "Compare com o app do banco para garantir que nada ficou sem registrar.", alvo: c.id });
  }
  const dias = d.config.ultimoBackup ? Math.floor((agoraMs - d.config.ultimoBackup) / 86400000) : null;
  if (d.movimentos.length >= 5 && (dias == null || dias > 14)) a.push({ tipo: "backup", urgencia: 1, titulo: "Fazer backup", detalhe: dias == null ? "Você ainda não fez nenhum backup. Os dados ficam só neste aparelho." : `Último backup há ${dias} dias.` });
  return a.sort((x, y) => y.urgencia - x.urgencia);
}
