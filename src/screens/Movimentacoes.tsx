import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { addMesKey, br, mesDe, nomeMes } from "../core/dates";
import { lancamentos, ordenar } from "../core/ledger";
import type { Movimento } from "../core/types";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { LinhaMov } from "../ui/LinhaMov";
import { Button, Card, Chips, Selecao, Vazio } from "../ui/ui";

type Grupo = "todos" | "entradas" | "saidas" | "pendentes" | "envelopes" | "negocio" | "outros";

const grupoDe = (m: Movimento): Grupo[] => {
  const g: Grupo[] = [];
  if (m.tipo === "receita" || m.tipo === "venda") g.push("entradas");
  if (m.tipo === "despesa" || m.tipo === "cartao_compra" || m.tipo === "cartao_pagamento" || m.tipo === "estoque_compra") g.push("saidas");
  if ((m.tipo === "receita" && m.status === "pendente") || (m.tipo === "despesa" && m.status === "pendente") || (m.tipo === "estoque_compra" && m.status === "pendente")) g.push("pendentes");
  if (m.tipo === "envelope") g.push("envelopes");
  if (m.tipo === "venda" || m.tipo === "estoque_compra" || (m.tipo === "receita" && m.negocioId) || ((m.tipo === "despesa" || m.tipo === "cartao_compra") && m.escopo === "negocio") || (m.tipo === "envelope" && m.origem === "retirada")) g.push("negocio");
  if (m.tipo === "transferencia" || m.tipo === "investimento" || m.tipo === "ajuste") g.push("outros");
  return g;
};

export function Movimentacoes() {
  const { d, hoje } = useApp();
  const ac = useAcoes();
  const [mes, setMes] = useState<string | "tudo">(mesDe(hoje));
  const [grupo, setGrupo] = useState<Grupo>("todos");
  const [conta, setConta] = useState("todas");
  const [categoria, setCategoria] = useState("todas");
  const [busca, setBusca] = useState("");

  const categorias = useMemo(() => [...new Set(d.movimentos.flatMap((m) => ("categoria" in m ? [m.categoria] : [])))].sort(), [d.movimentos]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ordenar(d.movimentos).reverse().filter((m) =>
      (mes === "tudo" || m.data.startsWith(mes)) &&
      (grupo === "todos" || grupoDe(m).includes(grupo)) &&
      (conta === "todas" || lancamentos(m).some((l) => l.contaId === conta) || ("contaId" in m && m.contaId === conta)) &&
      (categoria === "todas" || ("categoria" in m && m.categoria === categoria)) &&
      (!q || `${m.descricao} ${"cliente" in m ? m.cliente ?? "" : ""}`.toLowerCase().includes(q)));
  }, [d.movimentos, mes, grupo, conta, categoria, busca]);

  const porDia = useMemo(() => {
    const g = new Map<string, Movimento[]>();
    for (const m of filtrados) { if (!g.has(m.data)) g.set(m.data, []); g.get(m.data)!.push(m); }
    return [...g.entries()];
  }, [filtrados]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Movimentações</h1>
        <Button tamanho="sm" onClick={() => ac.nova()}><Plus size={16} />Adicionar</Button>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {mes !== "tudo" && <button aria-label="Mês anterior" className="grid h-10 w-10 place-items-center rounded-xl border border-line" onClick={() => setMes(addMesKey(mes, -1))}><ChevronLeft size={18} /></button>}
          <div className="flex-1 text-center font-semibold capitalize">{mes === "tudo" ? "Todo o período" : nomeMes(mes)}</div>
          {mes !== "tudo" && <button aria-label="Próximo mês" className="grid h-10 w-10 place-items-center rounded-xl border border-line" onClick={() => setMes(addMesKey(mes, 1))}><ChevronRight size={18} /></button>}
          <Button variante="outline" tamanho="sm" onClick={() => setMes(mes === "tudo" ? mesDe(hoje) : "tudo")}>{mes === "tudo" ? "Por mês" : "Tudo"}</Button>
        </div>
        <Chips value={grupo} onChange={setGrupo} opcoes={[{ valor: "todos", rotulo: "Todos" }, { valor: "entradas", rotulo: "Entradas" }, { valor: "saidas", rotulo: "Saídas" }, { valor: "pendentes", rotulo: "Pendentes" }, { valor: "envelopes", rotulo: "Envelopes" }, { valor: "negocio", rotulo: "Negócio" }, { valor: "outros", rotulo: "Transferências e outros" }]} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição ou cliente" className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-[15px] outline-none focus:border-accent" /></div>
          <Selecao value={conta} onChange={setConta} opcoes={[{ valor: "todas", rotulo: "Todas as contas" }, ...d.contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]} />
          <Selecao value={categoria} onChange={setCategoria} opcoes={[{ valor: "todas", rotulo: "Todas as categorias" }, ...categorias.map((c) => ({ valor: c, rotulo: c }))]} />
        </div>
      </div>

      {porDia.length ? (
        <div className="flex flex-col gap-4">
          {porDia.map(([dia, ms]) => (
            <div key={dia} className="flex flex-col gap-1.5">
              <div className="px-1 text-[13px] font-semibold text-muted">{dia === hoje ? "Hoje" : br(dia)}</div>
              <Card className="divide-y divide-line overflow-hidden">{ms.map((m) => <LinhaMov key={m.id} m={m} d={d} mostrarData={false} onClick={() => ac.nova({ editId: m.id })} />)}</Card>
            </div>
          ))}
          <div className="text-center text-[13px] text-muted">{filtrados.length} movimentação(ões). Toque em uma para editar ou apagar.</div>
        </div>
      ) : (
        <Vazio titulo="Nenhuma movimentação aqui" acao={<Button onClick={() => ac.nova()}>Adicionar movimentação</Button>}>Mude o mês ou os filtros, ou registre algo novo.</Vazio>
      )}
    </div>
  );
}
