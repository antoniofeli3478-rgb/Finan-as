import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Boxes, CreditCard, Hourglass, PiggyBank, Receipt, Scale, Store, TrendingUp, Wallet } from "lucide-react";
import { br } from "../core/dates";
import type { Cents } from "../core/money";
import { totaisVenda } from "../core/ledger";
import type { Dados, Movimento } from "../core/types";
import { Badge, cn, Money } from "./ui";

export interface InfoMov { icone: ReactNode; titulo: string; sub: string; valor: Cents | null; cor?: boolean; badge?: { tom: "good" | "warn" | "bad" | "neutro" | "accent"; texto: string } }

export const NOMES_TIPO: Record<Movimento["tipo"], string> = {
  receita: "Recebimento", despesa: "Despesa", transferencia: "Transferência", envelope: "Envelopes", cartao_compra: "Compra no cartão",
  cartao_pagamento: "Pagamento de fatura", estoque_compra: "Compra de estoque", venda: "Venda", investimento: "Investimento", ajuste: "Ajuste de saldo",
};

export function infoMov(m: Movimento, d: Dados): InfoMov {
  const conta = (id?: string | null) => d.contas.find((c) => c.id === id)?.nome ?? "";
  const env = (id?: string | null) => d.envelopes.find((e) => e.id === id)?.nome ?? "";
  switch (m.tipo) {
    case "receita": return { icone: m.status === "pendente" ? <Hourglass size={18} /> : <ArrowDownLeft size={18} />, titulo: m.descricao, sub: `${d.config.fontes.find((f) => f.id === m.fonteId)?.nome ?? ""} · ${conta(m.contaId)}`, valor: m.valor, cor: m.status === "recebida", badge: m.status === "pendente" ? { tom: "warn", texto: "a receber" } : undefined };
    case "despesa": return { icone: m.status === "pendente" ? <Receipt size={18} /> : <ArrowUpRight size={18} />, titulo: m.descricao, sub: `${m.categoria} · ${env(m.envelopeId)}${m.status === "pendente" && m.vencimento ? ` · vence ${br(m.vencimento)}` : ""}`, valor: -m.valor, cor: m.status === "paga", badge: m.status === "pendente" ? { tom: "warn", texto: "a pagar" } : m.escopo === "negocio" ? { tom: "neutro", texto: "negócio" } : undefined };
    case "transferencia": return { icone: <ArrowLeftRight size={18} />, titulo: m.descricao, sub: `${conta(m.deContaId)} → ${conta(m.paraContaId)}`, valor: m.valor };
    case "envelope": {
      const pos = m.itens.filter((i) => i.valor > 0), neg = m.itens.filter((i) => i.valor < 0);
      const sub = m.origem === "retirada" ? `Do negócio para você` : `${neg.length ? neg.map((i) => env(i.envelopeId)).join(", ") : "A distribuir"} → ${pos.map((i) => env(i.envelopeId)).join(", ")}`;
      const v = m.origem === "retirada" ? -m.itens[0].valor : pos.reduce((a, i) => a + i.valor, 0);
      return { icone: m.origem === "retirada" ? <Wallet size={18} /> : <PiggyBank size={18} />, titulo: m.descricao, sub, valor: v };
    }
    case "cartao_compra": return { icone: <CreditCard size={18} />, titulo: m.descricao, sub: `${m.categoria} · ${d.cartoes.find((c) => c.id === m.cartaoId)?.nome ?? "cartão"}${m.parcelas > 1 ? ` · ${m.parcelas}x` : ""}`, valor: -m.valor };
    case "cartao_pagamento": return { icone: <CreditCard size={18} />, titulo: m.descricao || "Pagamento de fatura", sub: `Fatura ${m.fatura.split("-").reverse().join("/")} · ${conta(m.contaId)}`, valor: -m.valor, cor: true };
    case "estoque_compra": return { icone: <Boxes size={18} />, titulo: m.descricao, sub: `${m.qtd} un. · ${d.produtos.find((p) => p.id === m.produtoId)?.nome ?? ""}`, valor: m.status === "inicial" ? m.valor : -m.valor, cor: m.status === "paga", badge: m.status === "pendente" ? { tom: "warn", texto: "a pagar" } : m.status === "inicial" ? { tom: "neutro", texto: "estoque inicial" } : undefined };
    case "venda": {
      const t = totaisVenda(m);
      return { icone: <Store size={18} />, titulo: m.cliente ? `Venda · ${m.cliente}` : m.descricao, sub: `${m.qtd} × ${d.produtos.find((p) => p.id === m.produtoId)?.nome ?? ""}`, valor: t.bruto, cor: t.status === "recebida",
        badge: t.status === "cancelada" ? { tom: "neutro", texto: "cancelada" } : t.status === "pendente" ? { tom: "warn", texto: "a receber" } : t.status === "parcial" ? { tom: "warn", texto: "parcial" } : undefined };
    }
    case "investimento": return { icone: <TrendingUp size={18} />, titulo: m.descricao, sub: `${d.investimentos.find((i) => i.id === m.investimentoId)?.nome ?? ""} · ${conta(m.contaId)}`, valor: m.direcao === "aporte" ? -m.valor : m.valor };
    case "ajuste": return { icone: <Scale size={18} />, titulo: m.descricao, sub: conta(m.contaId), valor: m.valor, cor: true };
  }
}

export function LinhaMov({ m, d, onClick, mostrarData = true }: { m: Movimento; d: Dados; onClick?: () => void; mostrarData?: boolean }) {
  const i = infoMov(m, d);
  return (
    <button onClick={onClick} className="grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 text-left transition hover:bg-surface-2">
      <span className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-surface-2 text-muted">{i.icone}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5"><span className="truncate text-[14.5px] font-semibold">{i.titulo || NOMES_TIPO[m.tipo]}</span>{i.badge && <Badge tom={i.badge.tom}>{i.badge.texto}</Badge>}</span>
        <span className="block truncate text-[12.5px] text-muted">{mostrarData ? `${br(m.data)} · ` : ""}{i.sub}</span>
      </span>
      {i.valor != null && <Money c={i.valor} sinal={i.cor && i.valor > 0} className={cn("text-[14.5px] font-semibold", i.cor ? (i.valor < 0 ? "" : "text-good") : "text-muted")} />}
    </button>
  );
}
