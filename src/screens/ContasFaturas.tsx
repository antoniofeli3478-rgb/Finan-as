import { useMemo, useState } from "react";
import { CreditCard, Landmark, Pencil, Plus } from "lucide-react";
import { addDias, br, diffDias } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { datasDaFatura, faturaDaCompra, type Fatura } from "../core/cartao";
import { extratoConta } from "../core/ledger";
import { mensalEquivalente } from "../core/situacao";
import type { Cartao, Conta, Despesa, Escopo, Recorrencia } from "../core/types";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { ir } from "../app/rotas";
import { db } from "../data/db";
import { gerarRecorrencias, novoId } from "../data/repo";
import { infoMov } from "../ui/LinhaMov";
import { Aviso, Badge, Button, Campo, Card, cn, Data, Dinheiro, Folha, Interruptor, Money, Numero, Progresso, Segmentos, Selecao, Texto, Vazio, useUi } from "../ui/ui";

type Aba = "agenda" | "fixas" | "cartoes" | "bancos";

export function ContasFaturas({ aba: abaRota }: { aba: string }) {
  const aba = (["agenda", "fixas", "cartoes", "bancos"].includes(abaRota) ? abaRota : "agenda") as Aba;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Contas e faturas</h1>
      <Segmentos value={aba} onChange={(v) => ir("contas", v)} opcoes={[{ valor: "agenda", rotulo: "Agenda" }, { valor: "fixas", rotulo: "Contas fixas" }, { valor: "cartoes", rotulo: "Cartões" }, { valor: "bancos", rotulo: "Contas" }]} />
      {aba === "agenda" && <Agenda />}
      {aba === "fixas" && <Fixas />}
      {aba === "cartoes" && <Cartoes />}
      {aba === "bancos" && <Bancos />}
    </div>
  );
}

// ── Agenda ──
function Agenda() {
  const { sit, hoje } = useApp();
  const ac = useAcoes();
  const [dias, setDias] = useState(60);
  const ate = addDias(hoje, dias);
  type Ev = { data: string; tipo: "pagar" | "receber" | "meta"; titulo: string; valor: Cents; atrasado: boolean; acao?: () => void; badge?: string };
  const eventos = useMemo(() => {
    const e: Ev[] = [];
    for (const c of sit.compromissos) if (c.vencimento <= ate) e.push({ data: c.vencimento, tipo: "pagar", titulo: c.descricao, valor: c.valor, atrasado: c.atrasado, acao: () => ac.pagarConta(c), badge: c.origem === "fatura" ? "fatura" : c.escopo === "negocio" ? "negócio" : c.estimado ? "estimado" : undefined });
    for (const r of sit.aReceber) if (r.previsto <= ate) e.push({ data: r.previsto, tipo: "receber", titulo: r.descricao, valor: r.valor, atrasado: r.atrasado, acao: () => ac.receber(r), badge: r.escopo === "negocio" ? "venda" : undefined });
    for (const m of sit.metas) if (m.envelope.prazo && m.envelope.prazo <= ate && m.falta > 0) e.push({ data: m.envelope.prazo, tipo: "meta", titulo: `Prazo: ${m.envelope.nome}`, valor: m.falta, atrasado: m.envelope.prazo < hoje });
    return e.sort((a, b) => a.data.localeCompare(b.data));
  }, [sit, ate]); // eslint-disable-line
  const atrasados = eventos.filter((e) => e.atrasado);
  const proximos = eventos.filter((e) => !e.atrasado);
  const porData = new Map<string, Ev[]>();
  for (const e of proximos) { if (!porData.has(e.data)) porData.set(e.data, []); porData.get(e.data)!.push(e); }
  const linha = (e: Ev, i: number) => (
    <button key={i} onClick={e.acao} disabled={!e.acao} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2 disabled:hover:bg-transparent">
      <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate text-[14.5px] font-semibold">{e.titulo}</span>{e.badge && <Badge>{e.badge}</Badge>}</span>
        <span className={cn("text-[12.5px]", e.tipo === "receber" ? "text-good" : e.tipo === "meta" ? "text-accent" : "text-muted")}>{e.tipo === "pagar" ? "Pagar" : e.tipo === "receber" ? "Receber" : "Falta para a meta"}{e.atrasado ? ` · desde ${br(e.data)}` : ""}</span></span>
      <Money c={e.tipo === "pagar" ? -e.valor : e.valor} className={cn("text-[14.5px] font-semibold", e.tipo === "receber" && "text-good")} />
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="p-3"><div className="text-[12.5px] text-muted">A pagar até {br(sit.horizonte)}</div><Money c={sit.cobertura.pessoal.necessario + sit.cobertura.negocio.necessario} className="text-[18px] font-semibold" /></Card>
        <Card className="p-3"><div className="text-[12.5px] text-muted">Já separado</div><Money c={Math.max(0, sit.cobertura.pessoal.reservado)} className="text-[18px] font-semibold" /><div className="text-[11.5px] text-muted">envelope de obrigações</div></Card>
        <Card className="p-3"><div className="text-[12.5px] text-muted">Sem cobertura</div><Money c={sit.cobertura.pessoal.descoberto} className={cn("text-[18px] font-semibold", sit.cobertura.pessoal.descoberto > 0 && "text-warn")} /></Card>
        <Card className="p-3"><div className="text-[12.5px] text-muted">A receber</div><Money c={sit.totalAReceber} className="text-[18px] font-semibold text-good" /></Card>
      </div>
      {atrasados.length > 0 && <div className="flex flex-col gap-1.5"><div className="px-1 text-[13px] font-semibold text-bad">Atrasados</div><Card className="divide-y divide-line border-bad/40">{atrasados.map(linha)}</Card></div>}
      {[...porData.entries()].map(([data, evs]) => (
        <div key={data} className="flex flex-col gap-1.5">
          <div className="px-1 text-[13px] font-semibold text-muted">{data === hoje ? "Hoje" : `${br(data)} · em ${diffDias(data, hoje)} dia(s)`}</div>
          <Card className="divide-y divide-line">{evs.map(linha)}</Card>
        </div>
      ))}
      {!eventos.length && <Vazio titulo="Nada para os próximos dias">Cadastre suas contas fixas para elas aparecerem aqui sozinhas.</Vazio>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {dias < 365 && <Button variante="outline" tamanho="sm" onClick={() => setDias(dias + 60)}>Ver mais 60 dias</Button>}
        <Button variante="outline" tamanho="sm" onClick={() => ac.nova({ tipo: "despesa" })}>Nova conta a pagar</Button>
        <Button variante="outline" tamanho="sm" onClick={() => ac.nova({ tipo: "pendente" })}>Novo valor a receber</Button>
      </div>
      <p className="text-center text-[12.5px] text-muted">Os lembretes aparecem aqui e na Visão geral quando você abre o app. Com o app fechado, não há notificação.</p>
    </div>
  );
}

// ── Contas fixas (recorrências) ──
function Fixas() {
  const { d } = useApp();
  const [editar, setEditar] = useState<Recorrencia | "nova" | null>(null);
  const ativas = d.recorrencias.filter((r) => r.ativa);
  const mensal = ativas.reduce((a, r) => a + mensalEquivalente(r), 0);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between gap-3 p-4">
        <div><div className="text-[13px] text-muted">Contas fixas ativas, por mês</div><Money c={mensal} className="text-[22px] font-semibold" /></div>
        <Button tamanho="sm" onClick={() => setEditar("nova")}><Plus size={16} />Nova</Button>
      </Card>
      {d.recorrencias.length ? (
        <Card className="divide-y divide-line">
          {d.recorrencias.map((r) => (
            <button key={r.id} onClick={() => setEditar(r)} className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2", !r.ativa && "opacity-55")}>
              <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate font-semibold">{r.nome}</span>{r.prioridade === 1 && <Badge tom="accent">essencial</Badge>}{!r.ativa && <Badge>pausada</Badge>}{r.variavel && <Badge>variável</Badge>}</span>
                <span className="text-[12.5px] text-muted">{descFreq(r)} · {r.categoria}{r.escopo === "negocio" ? " · negócio" : ""}</span></span>
              <Money c={r.valor} className="font-semibold" />
            </button>
          ))}
        </Card>
      ) : <Vazio titulo="Nenhuma conta fixa" acao={<Button onClick={() => setEditar("nova")}>Cadastrar conta fixa</Button>}>Academia, ajuda em casa, assinaturas: cadastre uma vez e o app cria a conta a pagar de cada mês, sem repetir.</Vazio>}
      {editar && <EditarRecorrencia rec={editar === "nova" ? null : editar} onFechar={() => setEditar(null)} />}
    </div>
  );
}

const descFreq = (r: Recorrencia) => {
  const n = r.intervalo > 1 ? r.intervalo : 0;
  const dia = Number(r.inicio.slice(8));
  if (r.frequencia === "mensal") return n ? `a cada ${n} meses, dia ${dia}` : `todo dia ${dia}`;
  if (r.frequencia === "semanal") return n ? `a cada ${n} semanas` : "toda semana";
  if (r.frequencia === "anual") return `todo ano em ${br(r.inicio).slice(0, 5)}`;
  return `a cada ${r.intervalo} dias`;
};

export function EditarRecorrencia({ rec, onFechar, sugestao }: { rec: Recorrencia | null; onFechar: () => void; sugestao?: Partial<Recorrencia> }) {
  const { d, sit, hoje } = useApp();
  const { toast, confirmar } = useUi();
  const s = { ...sugestao, ...rec };
  const [nome, setNome] = useState(s.nome ?? "");
  const [valor, setValor] = useState<Cents | null>(s.valor ?? null);
  const [variavel, setVariavel] = useState(s.variavel ?? false);
  const [escopo, setEscopo] = useState<Escopo>(s.escopo ?? "pessoal");
  const [categoria, setCategoria] = useState(s.categoria ?? d.config.categorias.pessoal[0]);
  const [freq, setFreq] = useState<Recorrencia["frequencia"]>(s.frequencia ?? "mensal");
  const [intervalo, setIntervalo] = useState(s.intervalo ?? 1);
  const [inicio, setInicio] = useState(s.inicio ?? hoje);
  const [prioridade, setPrioridade] = useState<"1" | "2" | "3">(String(s.prioridade ?? 2) as "1" | "2" | "3");
  const [ativa, setAtiva] = useState(s.ativa ?? true);
  const [contaId, setContaId] = useState(s.contaId ?? d.contas[0]?.id ?? "");
  const salvar = async () => {
    if (!nome.trim()) { toast("Dê um nome à conta.", true); return; }
    if (valor == null || valor < 0) { toast("Coloque o valor (pode ser uma estimativa).", true); return; }
    const envelopeId = escopo === "negocio" ? sit.env.negocio?.id ?? "" : sit.env.obrigacoes?.id ?? "";
    const mudouAgenda = rec && (rec.inicio !== inicio || rec.frequencia !== freq || rec.intervalo !== intervalo);
    const r: Recorrencia = { id: rec?.id ?? novoId(), nome: nome.trim(), valor, variavel, categoria, escopo, envelopeId, frequencia: freq, intervalo: Math.max(1, intervalo), inicio, geradoAte: mudouAgenda ? null : rec?.geradoAte ?? null, prioridade: Number(prioridade) as 1 | 2 | 3, ativa, contaId };
    await db().recorrencias.put(r);
    if (rec) {
      // Atualiza as próximas ocorrências ainda não pagas
      const pend = d.movimentos.filter((m): m is Despesa => m.tipo === "despesa" && m.recorrenciaId === rec.id && m.status === "pendente");
      if (mudouAgenda || !ativa) await db().movimentos.bulkDelete(pend.filter((m) => m.data >= hoje).map((m) => m.id));
      else await Promise.all(pend.map((m) => db().movimentos.put({ ...m, valor, descricao: r.nome, categoria, prioridade: r.prioridade, estimado: variavel })));
    }
    await gerarRecorrencias(db(), hoje);
    toast("Conta fixa salva");
    onFechar();
  };
  const apagar = async () => {
    if (!rec || !(await confirmar({ titulo: "Apagar conta fixa?", texto: "As contas já pagas continuam no histórico. As próximas, ainda não pagas, serão apagadas.", botao: "Apagar", perigo: true }))) return;
    const pend = d.movimentos.filter((m): m is Despesa => m.tipo === "despesa" && m.recorrenciaId === rec.id && m.status === "pendente");
    await db().movimentos.bulkDelete(pend.map((m) => m.id));
    await db().recorrencias.delete(rec.id);
    onFechar();
  };
  return (
    <Folha aberta onFechar={onFechar} titulo={rec ? "Editar conta fixa" : "Nova conta fixa"} rodape={<div className="flex gap-2">{rec && <Button variante="outline" className="text-bad" onClick={apagar}>Apagar</Button>}<Button className="flex-1" onClick={salvar}>Salvar</Button></div>}>
      <div className="flex flex-col gap-4">
        <Segmentos value={escopo} onChange={(v) => { setEscopo(v); setCategoria(d.config.categorias[v][0]); }} opcoes={[{ valor: "pessoal", rotulo: "Pessoal" }, { valor: "negocio", rotulo: "Negócio" }]} />
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Academia" /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor"><Dinheiro value={valor} onChange={setValor} /></Campo>
          <Campo rotulo="Categoria"><Selecao value={categoria} onChange={setCategoria} opcoes={d.config.categorias[escopo].map((c) => ({ valor: c, rotulo: c }))} /></Campo>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3"><span className="text-[14px]"><b>Valor muda todo mês</b><br /><span className="text-muted">Ex.: fatura de luz. Você confirma o valor ao pagar.</span></span><Interruptor ligado={variavel} onChange={setVariavel} rotulo="Valor variável" /></label>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Repete"><Selecao value={freq} onChange={setFreq} opcoes={[{ valor: "mensal", rotulo: "Mensal" }, { valor: "semanal", rotulo: "Semanal" }, { valor: "anual", rotulo: "Anual" }, { valor: "dias", rotulo: "A cada X dias" }]} /></Campo>
          <Campo rotulo={freq === "dias" ? "A cada quantos dias" : "Intervalo"} dica={freq === "dias" ? undefined : `1 = todo ${freq === "mensal" ? "mês" : freq === "semanal" ? "semana" : "ano"}`}><Numero value={intervalo} onChange={setIntervalo} min={1} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Próximo vencimento"><Data value={inicio} onChange={setInicio} /></Campo>
          <Campo rotulo="Prioridade"><Selecao value={prioridade} onChange={setPrioridade} opcoes={[{ valor: "1", rotulo: "Essencial" }, { valor: "2", rotulo: "Importante" }, { valor: "3", rotulo: "Pode esperar" }]} /></Campo>
        </div>
        <Campo rotulo="Costuma pagar com"><Selecao value={contaId} onChange={setContaId} opcoes={d.contas.map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
        <label className="flex items-center justify-between gap-3"><span className="text-[14px] font-semibold">Ativa</span><Interruptor ligado={ativa} onChange={setAtiva} rotulo="Ativa" /></label>
        <Aviso tom="info">"Essencial" entra no cálculo da reserva de emergência. O app cria as contas a pagar dos próximos 45 dias, sem duplicar.</Aviso>
      </div>
    </Folha>
  );
}

// ── Cartões ──
function Cartoes() {
  const { d, sit } = useApp();
  const [editar, setEditar] = useState<Cartao | "novo" | null>(null);
  const [fatura, setFatura] = useState<{ c: Cartao; f: Fatura } | null>(null);
  const ac = useAcoes();
  const cartoes = d.cartoes.filter((c) => !c.arquivado);
  return (
    <div className="flex flex-col gap-4">
      {cartoes.map((c) => {
        const fs = sit.faturas[c.id] ?? [];
        const usado = sit.limiteUsado[c.id] ?? 0;
        const disp = c.limite - usado;
        const atual = fs.find((f) => f.status === "aberta");
        const fechadas = fs.filter((f) => f.status === "fechada" || f.status === "vencida");
        const futuras = fs.filter((f) => f.status === "futura" && f.total > 0);
        return (
          <Card key={c.id} className="flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-accent"><CreditCard size={20} /></span><div><div className="font-semibold">{c.nome}</div><div className="text-[12.5px] text-muted">Fecha dia {c.fechamentoDia} · vence dia {c.vencimentoDia} · melhor dia de compra: {c.fechamentoDia}</div></div></div>
              <button aria-label="Editar cartão" onClick={() => setEditar(c)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><Pencil size={16} /></button>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-muted">Limite usado</span><span className="num font-semibold">{brl(usado)} de {brl(c.limite)}</span></div>
              <Progresso pct={c.limite ? (usado / c.limite) * 100 : 0} cor={disp < c.limite * 0.2 ? "var(--bad)" : "var(--accent)"} />
              <div className="mt-1.5 text-[12.5px] text-muted">Disponível pelo app: {brl(disp)}{c.limiteDisponivelInformado != null && <> · no banco: {brl(c.limiteDisponivelInformado)}{c.limiteDisponivelInformado !== disp && <b className="text-warn"> (diferença de {brl(c.limiteDisponivelInformado - disp)}: falta registrar alguma compra?)</b>}</>}</div>
              <div className="mt-1 text-[12.5px] text-muted">Limite não é dinheiro seu: ele não entra no saldo nem no patrimônio.</div>
            </div>
            <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {[...fechadas, ...(atual ? [atual] : []), ...futuras.slice(0, 4)].map((f) => (
                <button key={f.key} onClick={() => setFatura({ c, f })} className="flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-surface-2">
                  <span><span className="font-semibold">Fatura de {br(f.vencimento)}</span> <StatusFatura f={f} /><span className="block text-[12.5px] text-muted">{f.parcelas.length} lançamento(s){f.pago ? ` · pago ${brl(f.pago)}` : ""}</span></span>
                  <Money c={f.saldo > 0 ? f.saldo : f.total} className="font-semibold" />
                </button>
              ))}
            </div>
            {atual && atual.saldo > Math.max(0, sit.saldoEnv(sit.env.obrigacoes)) && <Aviso tom="warn">A fatura atual ({brl(atual.saldo)}) é maior do que há no envelope de obrigações ({brl(Math.max(0, sit.saldoEnv(sit.env.obrigacoes)))}). Vá separando até {br(atual.vencimento)}.</Aviso>}
            {atual && atual.saldo > sit.saldos.caixa && <Aviso tom="bad">A fatura atual é maior que o dinheiro em todas as suas contas ({brl(sit.saldos.caixa)}).</Aviso>}
            <div className="flex gap-2"><Button variante="soft" tamanho="sm" onClick={() => ac.nova({ tipo: "cartao" })}>Registrar compra</Button></div>
          </Card>
        );
      })}
      {!cartoes.length && <Vazio titulo="Nenhum cartão cadastrado" icone={<CreditCard />} acao={<Button onClick={() => setEditar("novo")}>Cadastrar cartão</Button>}>Tudo manual, sem conectar ao banco: você informa o limite e as datas, e registra as compras.</Vazio>}
      {cartoes.length > 0 && <Button variante="outline" className="self-start" tamanho="sm" onClick={() => setEditar("novo")}><Plus size={16} />Outro cartão</Button>}
      {editar && <EditarCartao cartao={editar === "novo" ? null : editar} onFechar={() => setEditar(null)} />}
      {fatura && <DetalheFatura c={fatura.c} f={(sit.faturas[fatura.c.id] ?? []).find((x) => x.key === fatura.f.key) ?? fatura.f} onFechar={() => setFatura(null)} />}
    </div>
  );
}

function StatusFatura({ f }: { f: Fatura }) {
  const m = { aberta: ["accent", "aberta"], futura: ["neutro", "futura"], fechada: ["warn", "fechada"], vencida: ["bad", "vencida"], paga: ["good", "paga"] } as const;
  const [tom, txt] = m[f.status];
  return <Badge tom={tom}>{txt}</Badge>;
}

function DetalheFatura({ c, f, onFechar }: { c: Cartao; f: Fatura; onFechar: () => void }) {
  const { d, sit } = useApp();
  const ac = useAcoes();
  const pagamentos = d.movimentos.filter((m) => m.tipo === "cartao_pagamento" && m.cartaoId === c.id && m.fatura === f.key);
  const comp = sit.compromissos.find((x) => x.chave === `f:${c.id}:${f.key}`);
  return (
    <Folha aberta onFechar={onFechar} titulo={`Fatura de ${br(f.vencimento)}`} rodape={comp ? <Button className="w-full" onClick={() => { onFechar(); ac.pagarConta(comp); }}>Pagar {brl(f.saldo)}</Button> : undefined}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[12px] text-muted">Total</div><Money c={f.total} className="font-semibold" /></div>
          <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[12px] text-muted">Pago</div><Money c={f.pago} className="font-semibold" /></div>
          <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[12px] text-muted">Falta</div><Money c={Math.max(0, f.saldo)} className="font-semibold" /></div>
        </div>
        <div className="text-[13px] text-muted">Fecha em {br(f.fechamento)}, vence em {br(f.vencimento)}. <StatusFatura f={f} /></div>
        <div className="flex flex-col divide-y divide-line">
          {f.parcelas.map((p) => (
            <button key={p.compraId + p.numero} onClick={() => { onFechar(); ac.nova({ editId: p.compraId }); }} className="flex items-center justify-between gap-3 py-2.5 text-left">
              <span className="min-w-0"><span className="block truncate font-semibold">{p.descricao}</span><span className="text-[12.5px] text-muted">{br(p.data)} · {p.categoria}{p.de > 1 ? ` · parcela ${p.numero}/${p.de}` : ""}</span></span>
              <Money c={p.valor} className="font-semibold" />
            </button>
          ))}
          {!f.parcelas.length && <div className="py-4 text-center text-muted">Nenhuma compra nesta fatura.</div>}
        </div>
        {pagamentos.length > 0 && <div className="flex flex-col gap-1"><div className="text-[13px] font-semibold text-muted">Pagamentos</div>{pagamentos.map((p) => <button key={p.id} onClick={() => { onFechar(); ac.nova({ editId: p.id }); }} className="flex justify-between text-[14px]"><span>{br(p.data)}</span><Money c={(p as { valor: number }).valor} /></button>)}</div>}
      </div>
    </Folha>
  );
}

export function EditarCartao({ cartao, onFechar }: { cartao: Cartao | null; onFechar: () => void }) {
  const { d, hoje } = useApp();
  const { toast, confirmar } = useUi();
  const [nome, setNome] = useState(cartao?.nome ?? "Inter");
  const [limite, setLimite] = useState<Cents | null>(cartao?.limite ?? null);
  const [disp, setDisp] = useState<Cents | null>(cartao?.limiteDisponivelInformado ?? null);
  const [fech, setFech] = useState(cartao?.fechamentoDia ?? 1);
  const [venc, setVenc] = useState(cartao?.vencimentoDia ?? 10);
  const salvar = async () => {
    if (!nome.trim() || limite == null) { toast("Preencha o nome e o limite.", true); return; }
    if (fech < 1 || fech > 31 || venc < 1 || venc > 31) { toast("Os dias precisam estar entre 1 e 31.", true); return; }
    await db().cartoes.put({ id: cartao?.id ?? novoId(), nome: nome.trim(), limite, limiteDisponivelInformado: disp, fechamentoDia: fech, vencimentoDia: venc, arquivado: cartao?.arquivado ?? false });
    toast("Cartão salvo");
    onFechar();
  };
  const arquivar = async () => {
    if (!cartao) return;
    if (!(await confirmar({ titulo: "Arquivar cartão?", texto: "Ele some das listas, mas as compras e faturas continuam no histórico.", botao: "Arquivar" }))) return;
    await db().cartoes.update(cartao.id, { arquivado: true });
    onFechar();
  };
  const exemplo = { fechamentoDia: fech, vencimentoDia: venc };
  return (
    <Folha aberta onFechar={onFechar} titulo={cartao ? "Editar cartão" : "Novo cartão"} rodape={<div className="flex gap-2">{cartao && <Button variante="outline" onClick={arquivar}>Arquivar</Button>}<Button className="flex-1" onClick={salvar}>Salvar</Button></div>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Limite total"><Dinheiro value={limite} onChange={setLimite} /></Campo>
          <Campo rotulo="Disponível no banco" dica="Opcional, para conferir"><Dinheiro value={disp} onChange={setDisp} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Dia de fechamento"><Numero value={fech} onChange={setFech} min={1} max={31} /></Campo>
          <Campo rotulo="Dia de vencimento"><Numero value={venc} onChange={setVenc} min={1} max={31} /></Campo>
        </div>
        {fech >= 1 && fech <= 31 && venc >= 1 && venc <= 31 && <Aviso tom="info">Exemplo: uma compra hoje ({br(hoje)}) cai na fatura que vence em {br(datasDaFatura(faturaDaCompra(hoje, exemplo), exemplo).vencimento)}. Comprando a partir do dia {fech}, a compra só é cobrada na fatura seguinte.</Aviso>}
        {d.cartoes.length === 0 && <div className="text-[12.5px] text-muted">Os dados ficam só no seu aparelho. O app não se conecta ao banco.</div>}
      </div>
    </Folha>
  );
}

// ── Contas bancárias ──
function Bancos() {
  const { d, sit } = useApp();
  const ac = useAcoes();
  const [editar, setEditar] = useState<Conta | "nova" | null>(null);
  const [extrato, setExtrato] = useState<Conta | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between gap-3 p-4">
        <div><div className="text-[13px] text-muted">Saldo somado</div><Money c={sit.saldos.caixa} className="text-[22px] font-semibold" /></div>
        <Button tamanho="sm" variante="outline" onClick={() => setEditar("nova")}><Plus size={16} />Nova conta</Button>
      </Card>
      <Card className="divide-y divide-line">
        {d.contas.filter((c) => !c.arquivada).map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-muted"><Landmark size={18} /></span>
            <button className="min-w-0 flex-1 text-left" onClick={() => setExtrato(c)}>
              <div className="font-semibold">{c.nome}</div>
              <div className="text-[12.5px] text-muted">{c.conferido ? `Conferido em ${br(c.conferido.data)}` : "Nunca conferido com o banco"}</div>
            </button>
            <Money c={sit.saldos.contas[c.id] ?? 0} className="font-semibold" />
            <button aria-label="Editar conta" onClick={() => setEditar(c)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><Pencil size={16} /></button>
          </div>
        ))}
      </Card>
      <Button variante="soft" className="self-start" onClick={() => ac.nova({ tipo: "ajuste" })}>Conferir saldo com o banco</Button>
      <p className="text-[13px] text-muted">Conferir o saldo de vez em quando mostra se algum gasto ficou sem registrar. Se houver diferença, o app cria um ajuste.</p>
      {editar && <EditarConta conta={editar === "nova" ? null : editar} onFechar={() => setEditar(null)} />}
      {extrato && <ExtratoConta conta={extrato} onFechar={() => setExtrato(null)} />}
    </div>
  );
}

export function EditarConta({ conta, onFechar }: { conta: Conta | null; onFechar: () => void }) {
  const { d, sit } = useApp();
  const { toast, confirmar } = useUi();
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [tipo, setTipo] = useState<Conta["tipo"]>(conta?.tipo ?? "banco");
  const [saldoInicial, setSaldoInicial] = useState<Cents | null>(conta?.saldoInicial ?? 0);
  const salvar = async () => {
    if (!nome.trim()) { toast("Dê um nome à conta.", true); return; }
    await db().contas.put({ id: conta?.id ?? novoId(), nome: nome.trim(), tipo, saldoInicial: saldoInicial ?? 0, conferido: conta?.conferido ?? null, arquivada: conta?.arquivada ?? false, ordem: conta?.ordem ?? d.contas.length + 1 });
    toast("Conta salva");
    onFechar();
  };
  const arquivar = async () => {
    if (!conta) return;
    const s = sit.saldos.contas[conta.id] ?? 0;
    if (s !== 0) { toast(`A conta ainda tem ${brl(s)}. Transfira o saldo antes de arquivar.`, true); return; }
    if (!(await confirmar({ titulo: "Arquivar conta?", texto: "O histórico continua guardado.", botao: "Arquivar" }))) return;
    await db().contas.update(conta.id, { arquivada: true });
    onFechar();
  };
  return (
    <Folha aberta onFechar={onFechar} titulo={conta ? "Editar conta" : "Nova conta"} rodape={<div className="flex gap-2">{conta && <Button variante="outline" onClick={arquivar}>Arquivar</Button>}<Button className="flex-1" onClick={salvar}>Salvar</Button></div>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco Inter, Nubank, Carteira" /></Campo>
        <Campo grupo rotulo="Tipo"><Segmentos value={tipo} onChange={setTipo} opcoes={[{ valor: "banco", rotulo: "Banco" }, { valor: "dinheiro", rotulo: "Dinheiro" }, { valor: "outro", rotulo: "Outro" }]} /></Campo>
        <Campo rotulo="Saldo inicial" dica="O saldo quando você começou a usar o app. Para corrigir o saldo de hoje, use Conferir saldo."><Dinheiro value={saldoInicial} onChange={setSaldoInicial} /></Campo>
      </div>
    </Folha>
  );
}

function ExtratoConta({ conta, onFechar }: { conta: Conta; onFechar: () => void }) {
  const { d } = useApp();
  const linhas = useMemo(() => extratoConta(d.movimentos, conta.id, conta.saldoInicial).reverse(), [d.movimentos, conta]);
  return (
    <Folha aberta onFechar={onFechar} titulo={`Extrato · ${conta.nome}`}>
      <div className="flex flex-col divide-y divide-line">
        {linhas.map((l) => (
          <div key={l.mov.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5">
            <span className="truncate text-[14px] font-semibold">{infoMov(l.mov, d).titulo}</span>
            <Money c={l.valor} sinal cor className="text-right text-[14px] font-semibold" />
            <span className="text-[12.5px] text-muted">{br(l.mov.data)}</span>
            <span className="text-right text-[12.5px] text-muted">saldo <Money c={l.saldo} /></span>
          </div>
        ))}
        <div className="flex justify-between py-2.5 text-[13px] text-muted"><span>Saldo inicial</span><Money c={conta.saldoInicial} /></div>
      </div>
    </Folha>
  );
}
