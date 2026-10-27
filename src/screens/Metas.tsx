import { useMemo, useState } from "react";
import { Pencil, Plus, TrendingUp } from "lucide-react";
import { br } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { aportesSemanais, cenariosMeta } from "../core/relatorios";
import type { Envelope, Investimento } from "../core/types";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { db } from "../data/db";
import { Barras } from "../ui/graficos";
import { Aviso, Button, Campo, Card, cn, Data, Dinheiro, Folha, Money, Progresso, Secao, Stat, Texto, Vazio, useUi } from "../ui/ui";
import { EditarEnvelope } from "./Envelopes";

export function Metas() {
  const { sit } = useApp();
  const ac = useAcoes();
  const [editar, setEditar] = useState<Envelope | "novo" | null>(null);
  const pc = sit.metas.find((m) => m.envelope.tipo === "pc");
  const outras = sit.metas.filter((m) => m.envelope.tipo !== "pc");
  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Metas</h1>
        <Button variante="outline" tamanho="sm" onClick={() => setEditar("novo")}><Plus size={16} />Novo objetivo</Button>
      </header>
      {pc && <MetaPrincipal m={pc} onEditar={() => setEditar(pc.envelope)} />}
      <Secao titulo="Outras metas">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {outras.map((m) => (
            <Card key={m.envelope.id} className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><i className="h-3 w-3 rounded-full" style={{ background: m.envelope.cor }} />{m.envelope.nome}</div><button aria-label="Editar" onClick={() => setEditar(m.envelope)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"><Pencil size={15} /></button></div>
              <div className="num text-[24px] font-semibold">{brl(m.saldo)}</div>
              <Progresso pct={m.pct} cor={m.envelope.cor} />
              <div className="text-[12.5px] text-muted">
                {m.meta ? (m.falta > 0 ? `Faltam ${brl(m.falta)} de ${brl(m.meta)} (${Math.floor(m.pct)}%)` : `Meta de ${brl(m.meta)} atingida`) : m.envelope.tipo === "reserva" ? "Marque contas fixas como essenciais para calcular a meta, ou defina um valor." : "Sem meta definida."}
                {m.envelope.tipo === "reserva" && m.envelope.metaModo === "despesas" && sit.despesasEssenciaisMes > 0 && ` · ${m.envelope.mesesReserva ?? 3} meses de contas essenciais (${brl(sit.despesasEssenciaisMes)}/mês)`}
                {m.envelope.prazo ? ` · prazo ${br(m.envelope.prazo)}` : ""}
              </div>
              {m.envelope.tipo === "reserva" && <div className="text-[12.5px] text-muted">A reserva nunca conta como dinheiro livre: é só para imprevistos reais.</div>}
              <Button variante="soft" tamanho="sm" className="self-start" onClick={() => ac.nova({ tipo: "aporte", envelopeDestino: m.envelope.id })}>Aportar</Button>
            </Card>
          ))}
          {sit.env.negocio && (
            <Card className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center gap-2 font-semibold"><i className="h-3 w-3 rounded-full" style={{ background: sit.env.negocio.cor }} />Capital de giro do negócio</div>
              <div className="num text-[24px] font-semibold">{brl(sit.capitalNegocio.caixa)}</div>
              <Progresso pct={sit.env.negocio.minimo ? (sit.capitalNegocio.caixa / sit.env.negocio.minimo) * 100 : 0} cor={sit.env.negocio.cor} />
              <div className="text-[12.5px] text-muted">{sit.env.negocio.minimo ? `Mínimo de ${brl(sit.env.negocio.minimo)}` : "Mínimo ainda não definido"} · reposição necessária {brl(sit.reposicao.total)}</div>
              <Button variante="outline" tamanho="sm" className="self-start" onClick={() => setEditar(sit.env.negocio!)}>Definir mínimo</Button>
            </Card>
          )}
        </div>
      </Secao>
      <Investimentos />
      {editar && <EditarEnvelope env={editar === "novo" ? null : editar} onFechar={() => setEditar(null)} />}
    </div>
  );
}

function MetaPrincipal({ m, onEditar }: { m: NonNullable<ReturnType<typeof useApp>["sit"]["metas"][number]>; onEditar: () => void }) {
  const { d, hoje } = useApp();
  const ac = useAcoes();
  const semanais = useMemo(() => aportesSemanais(d, m.envelope.id, hoje, 8), [d, m.envelope.id, hoje]);
  const [custom, setCustom] = useState<Partial<Record<"conservador" | "intermediario" | "otimista", Cents>>>({});
  const c = cenariosMeta(semanais, m.falta, hoje, Object.keys(custom).length ? custom : undefined);
  const chaves = ["conservador", "intermediario", "otimista"] as const;
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-muted"><i className="h-3 w-3 rounded-full" style={{ background: m.envelope.cor }} />{m.envelope.nome}</div>
          <div className="mt-1 font-display text-[40px] font-semibold leading-none num">{brl(m.saldo)}</div>
          <div className="mt-1 text-[14px] text-muted">{m.meta ? `de ${brl(m.meta)} · faltam ${brl(m.falta)}` : "Defina o valor do PC"}{m.envelope.prazo ? ` · prazo ${br(m.envelope.prazo)}` : ""}</div>
        </div>
        <Button variante="outline" tamanho="sm" onClick={onEditar}><Pencil size={14} />Meta</Button>
      </div>
      <Progresso pct={m.pct} cor={m.envelope.cor} alto />
      <div className="flex gap-2"><Button onClick={() => ac.nova({ tipo: "aporte", envelopeDestino: m.envelope.id })}>Aportar no PC</Button></div>
      <div>
        <div className="mb-2 text-[13.5px] font-semibold text-muted">Aportes nas últimas 8 semanas</div>
        <Barras dados={semanais.map((v, i) => ({ rotulo: i === 7 ? "esta" : `-${7 - i}`, valores: [v] }))} series={[{ nome: "Aporte da semana", cor: m.envelope.cor }]} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="text-[13.5px] font-semibold text-muted">Quando chego lá?</div>
        {!c.suficiente && <Aviso tom="info">Ainda não há aportes suficientes (menos de 2 semanas com aporte) para prever uma data. Coloque abaixo quanto você acha que consegue guardar por semana.</Aviso>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {c.cenarios.map((x, i) => (
            <div key={x.nome} className={cn("flex flex-col gap-2 rounded-xl p-3", i === 1 ? "bg-accent-soft" : "bg-surface-2")}>
              <div className="text-[13px] font-semibold">{x.nome}</div>
              <Campo rotulo="Por semana"><Dinheiro value={custom[chaves[i]] ?? x.porSemana} onChange={(v) => setCustom((s) => ({ ...s, [chaves[i]]: v ?? 0 }))} /></Campo>
              <div className="text-[13.5px]">{x.data ? <><b>{br(x.data)}</b><span className="text-muted"> · {x.semanas} semana(s)</span></> : x.semanas === 0 ? <b className="text-good">Meta atingida</b> : <span className="text-muted">Sem previsão</span>}</div>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-muted">Premissas: intermediário = média das últimas 8 semanas sem a melhor semana; conservador = 70% disso; otimista = média com todas as semanas. Uma semana excepcional não vira renda garantida.</p>
        {m.envelope.prazo && m.falta > 0 && <Aviso tom="info">Para chegar até {br(m.envelope.prazo)}, guarde cerca de {brl(Math.ceil(m.falta / Math.max(1, Math.ceil((new Date(m.envelope.prazo).getTime() - new Date(hoje).getTime()) / (7 * 86400000)))))} por semana.</Aviso>}
      </div>
    </Card>
  );
}

function Investimentos() {
  const { d, sit, hoje } = useApp();
  const ac = useAcoes();
  const { toast } = useUi();
  const [editar, setEditar] = useState<Investimento | null>(null);
  const [valorAtual, setValorAtual] = useState<Cents | null>(null);
  const [data, setData] = useState(hoje);
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");
  const invs = d.investimentos.filter((i) => !i.arquivado);
  const abrir = (i: Investimento) => { setEditar(i); setValorAtual(i.valorAtual); setData(hoje); setNome(i.nome); setObs(i.observacoes ?? ""); };
  const salvar = async () => {
    if (!editar || valorAtual == null) return;
    await db().investimentos.update(editar.id, { valorAtual, atualizadoEm: data, nome: nome.trim() || editar.nome, observacoes: obs });
    toast("Investimento atualizado");
    setEditar(null);
  };
  return (
    <Secao titulo="Investimentos" acao={<Button variante="outline" tamanho="sm" onClick={() => ac.nova({ tipo: "investimento" })}><Plus size={16} />Aplicar</Button>}>
      {invs.length ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat rotulo="Valor atual" valor={<Money c={sit.investimentos.valorAtual} />} />
            <Stat rotulo="Aportado (líquido)" valor={<Money c={sit.investimentos.aportado} />} />
            <Stat rotulo="Resultado" valor={<Money c={sit.investimentos.valorAtual - sit.investimentos.aportado} sinal />} tom={sit.investimentos.valorAtual - sit.investimentos.aportado < 0 ? "bad" : "good"} />
          </div>
          <Card className="divide-y divide-line">
            {invs.map((i) => {
              const ap = sit.investimentos.porId[i.id]?.aportado ?? 0;
              return (
                <button key={i.id} onClick={() => abrir(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-accent"><TrendingUp size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{i.nome}</span><span className="text-[12.5px] text-muted">{i.instituicao}{i.atualizadoEm ? ` · valor atualizado em ${br(i.atualizadoEm)}` : ""}</span></span>
                  <span className="text-right"><Money c={i.valorAtual} className="block font-semibold" /><Money c={i.valorAtual - ap} sinal cor className="text-[12.5px]" /></span>
                </button>
              );
            })}
          </Card>
          <p className="text-[12.5px] text-muted">O app não inventa rendimento: o valor atual é o que você informa olhando o app do banco. Investimento não é dinheiro para pagar contas.</p>
        </>
      ) : <Vazio titulo="Nenhum investimento registrado" acao={<Button variante="outline" onClick={() => ac.nova({ tipo: "investimento" })}>Registrar aplicação</Button>}>Quando aplicar, registre aqui. O dinheiro sai da conta, não vira gasto e passa a contar no patrimônio.</Vazio>}
      {editar && (
        <Folha aberta onFechar={() => setEditar(null)} titulo={editar.nome} rodape={<div className="grid grid-cols-2 gap-2"><Button variante="outline" onClick={() => { setEditar(null); ac.nova({ tipo: "investimento" }); }}>Aplicar ou resgatar</Button><Button onClick={salvar}>Salvar</Button></div>}>
          <div className="flex flex-col gap-4">
            <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Campo rotulo="Valor atual (como está no banco)" dica={`Aportado líquido: ${brl(sit.investimentos.porId[editar.id]?.aportado ?? 0)}. A diferença é o rendimento ou a perda.`}><Dinheiro value={valorAtual} onChange={setValorAtual} grande /></Campo>
            <Campo rotulo="Data da consulta"><Data value={data} onChange={setData} /></Campo>
            <Campo rotulo="Observações"><Texto value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 100% do CDI, liquidez diária" /></Campo>
          </div>
        </Folha>
      )}
    </Secao>
  );
}
