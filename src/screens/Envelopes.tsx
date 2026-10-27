import { useMemo, useState } from "react";
import { History, Pencil, Plus } from "lucide-react";
import { br } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { extratoEnvelope } from "../core/ledger";
import type { Envelope } from "../core/types";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { db } from "../data/db";
import { novoId } from "../data/repo";
import { infoMov } from "../ui/LinhaMov";
import { Aviso, Badge, Button, Campo, Card, cn, Data, Dinheiro, Folha, Money, Numero, Progresso, Segmentos, Texto, useUi } from "../ui/ui";

const DESCRICOES: Record<Envelope["tipo"], string> = {
  obrigacoes: "Para as contas que você precisa pagar.",
  negocio: "Caixa de um negócio seu: mercadoria, materiais e operação. Não é seu salário.",
  pc: "Seu principal objetivo de compra.",
  reserva: "Só para imprevistos reais. Não conta como dinheiro disponível.",
  investimentos: "Dinheiro separado para aplicar.",
  livre: "Lazer, comida fora e compras pessoais, sem mexer no resto.",
  objetivo: "Objetivo criado por você.",
};

export function Envelopes() {
  const { d, sit } = useApp();
  const ac = useAcoes();
  const [editar, setEditar] = useState<Envelope | "novo" | null>(null);
  const [extrato, setExtrato] = useState<Envelope | null>(null);
  const envs = d.envelopes.filter((e) => !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  const s = sit.saldos;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-[28px] font-semibold tracking-tight">Envelopes</h1><p className="text-[14px] text-muted">Cada real nas suas contas tem uma finalidade. A soma dos envelopes com o "a distribuir" é igual ao saldo das contas.</p></div>
        <div className="flex gap-2"><Button variante="outline" tamanho="sm" onClick={() => setEditar("novo")}><Plus size={16} />Novo objetivo</Button><Button tamanho="sm" onClick={() => ac.nova({ tipo: "aporte" })}>Mover dinheiro</Button></div>
      </header>

      <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3"><div className="text-[12.5px] text-muted">Nas contas</div><Money c={s.caixa} className="text-[18px] font-semibold" /></div>
        <div className="rounded-xl bg-surface-2 p-3"><div className="text-[12.5px] text-muted">Nos envelopes</div><Money c={s.alocado} className="text-[18px] font-semibold" /></div>
        <button onClick={() => s.aDistribuir > 0 && ac.distribuir()} className={cn("col-span-2 rounded-xl p-3 text-left sm:col-span-1", s.aDistribuir > 0 ? "bg-accent-soft" : s.aDistribuir < 0 ? "bg-bad-soft" : "bg-surface-2")}>
          <div className={cn("text-[12.5px]", s.aDistribuir > 0 ? "font-semibold text-accent" : s.aDistribuir < 0 ? "font-semibold text-bad" : "text-muted")}>{s.aDistribuir < 0 ? "Falta cobrir" : "A distribuir"}</div>
          <Money c={s.aDistribuir} className="text-[18px] font-semibold" />
        </button>
      </Card>
      {s.aDistribuir < 0 && <Aviso tom="bad">Os envelopes somam {brl(-s.aDistribuir)} a mais do que existe nas contas. Isso acontece quando um saldo real é menor do que o registrado. Confira o saldo do banco (Ajuste de saldo) ou tire de algum envelope.</Aviso>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {envs.map((e) => {
          const saldo = s.envelopes[e.id] ?? 0;
          const meta = sit.metas.find((m) => m.envelope.id === e.id);
          const extra = e.tipo === "obrigacoes" ? sit.cobertura.pessoal : e.tipo === "negocio" ? sit.cobertura.negocio : null;
          return (
            <Card key={e.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold"><i className="h-3 w-3 rounded-full" style={{ background: e.cor }} />{e.nome}</div>
                  <div className="text-[13px] leading-snug text-muted">{DESCRICOES[e.tipo]}</div>
                </div>
                <div className="flex gap-1">
                  <button aria-label="Histórico" onClick={() => setExtrato(e)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><History size={17} /></button>
                  <button aria-label="Editar" onClick={() => setEditar(e)} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2"><Pencil size={16} /></button>
                </div>
              </div>
              <div className={cn("num text-[26px] font-semibold tracking-tight", saldo < 0 && "text-bad")}>{brl(saldo)}</div>
              {meta?.meta != null && <><Progresso pct={meta.pct} cor={e.cor} /><div className="text-[12.5px] text-muted">{meta.falta > 0 ? `Faltam ${brl(meta.falta)} de ${brl(meta.meta)}` : "Meta atingida"}{e.prazo ? ` · prazo ${br(e.prazo)}` : ""}</div></>}
              {extra && extra.necessario > 0 && <div className="text-[12.5px] text-muted">Contas até {br(sit.horizonte)}: {brl(extra.necessario)}. {extra.descoberto > 0 ? <b className="text-warn">Faltam {brl(extra.descoberto)}.</b> : <b className="text-good">Cobertas.</b>}</div>}
              {e.tipo === "negocio" && <div className="text-[12.5px] text-muted">Capital de giro mínimo: {e.minimo ? brl(e.minimo) : "não definido"}</div>}
              {saldo < 0 && <Badge tom="bad" className="self-start">Gastou mais do que tinha aqui</Badge>}
              <div className="flex gap-2">
                <Button variante="soft" tamanho="sm" onClick={() => ac.nova({ tipo: "aporte", envelopeDestino: e.id })}>Colocar dinheiro</Button>
                {e.tipo === "livre" && <Button variante="outline" tamanho="sm" onClick={() => ac.nova({ tipo: "despesa" })}>Registrar gasto</Button>}
              </div>
            </Card>
          );
        })}
      </div>
      {editar && <EditarEnvelope env={editar === "novo" ? null : editar} onFechar={() => setEditar(null)} />}
      {extrato && <Extrato env={extrato} onFechar={() => setExtrato(null)} />}
    </div>
  );
}

const CORES = ["#e0a458", "#5aa9e6", "#b38cff", "#4fbf9f", "#7fc8a9", "#f2c14e", "#ef7a85", "#8fb3ff", "#c9a27e", "#9aa3b2"];

export function EditarEnvelope({ env, onFechar }: { env: Envelope | null; onFechar: () => void }) {
  const { d, sit } = useApp();
  const { toast, confirmar } = useUi();
  const [nome, setNome] = useState(env?.nome ?? "");
  const [cor, setCor] = useState(env?.cor ?? CORES[6]);
  const [meta, setMeta] = useState<Cents | null>(env?.meta ?? null);
  const [prazo, setPrazo] = useState(env?.prazo ?? "");
  const [minimo, setMinimo] = useState<Cents | null>(env?.minimo ?? null);
  const [metaModo, setMetaModo] = useState<"manual" | "despesas">(env?.metaModo ?? "manual");
  const [meses, setMeses] = useState(env?.mesesReserva ?? 3);
  const tipo = env?.tipo ?? "objetivo";
  const salvar = async () => {
    if (!nome.trim()) { toast("Dê um nome ao envelope.", true); return; }
    const novo: Envelope = { ...(env ?? { id: novoId(), tipo: "objetivo", arquivado: false, ordem: d.envelopes.length + 1 } as Envelope), nome: nome.trim(), cor, meta: tipo === "negocio" ? null : meta, prazo: prazo || null, minimo: minimo ?? 0, metaModo, mesesReserva: meses };
    await db().envelopes.put(novo);
    toast("Envelope salvo");
    onFechar();
  };
  const arquivar = async () => {
    if (!env) return;
    const saldo = sit.saldos.envelopes[env.id] ?? 0;
    if (saldo !== 0) { toast(`Mova os ${brl(saldo)} deste envelope para outro antes de arquivar.`, true); return; }
    if (!(await confirmar({ titulo: "Arquivar objetivo?", texto: "Ele some da lista, mas o histórico continua guardado.", botao: "Arquivar" }))) return;
    await db().envelopes.update(env.id, { arquivado: true });
    onFechar();
  };
  return (
    <Folha aberta onFechar={onFechar} titulo={env ? `Editar ${env.nome}` : "Novo objetivo"} rodape={<div className="flex gap-2">{env?.tipo === "objetivo" && <Button variante="outline" onClick={arquivar}>Arquivar</Button>}<Button className="flex-1" onClick={salvar}>Salvar</Button></div>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Curso de 3D, viagem, câmera" /></Campo>
        <Campo grupo rotulo="Cor"><div className="flex flex-wrap gap-2">{CORES.map((c) => <button key={c} aria-label={c} onClick={() => setCor(c)} className={cn("h-8 w-8 rounded-full", cor === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface")} style={{ background: c }} />)}</div></Campo>
        {tipo === "reserva" && <Campo grupo rotulo="Como calcular a meta"><Segmentos value={metaModo} onChange={setMetaModo} opcoes={[{ valor: "despesas", rotulo: "Meses de contas essenciais" }, { valor: "manual", rotulo: "Valor que eu escolho" }]} /></Campo>}
        {tipo === "reserva" && metaModo === "despesas" && <Campo rotulo="Quantos meses" dica={`Suas contas essenciais somam ${brl(sit.despesasEssenciaisMes)} por mês (contas fixas marcadas como essenciais). Meta: ${brl(sit.despesasEssenciaisMes * meses)}.`}><Numero value={meses} onChange={(n) => setMeses(Math.max(1, Math.min(24, n)))} min={1} /></Campo>}
        {tipo === "negocio" ? (
          <Campo rotulo="Capital de giro mínimo" dica="O app avisa quando uma retirada deixaria o negócio abaixo disso."><Dinheiro value={minimo} onChange={setMinimo} /></Campo>
        ) : (tipo !== "reserva" || metaModo === "manual") && tipo !== "obrigacoes" && tipo !== "livre" && (
          <Campo rotulo="Meta" dica={tipo === "pc" ? "Sua referência: entre R$ 4.000 e R$ 6.000." : "Deixe vazio se não tiver meta."}><Dinheiro value={meta} onChange={setMeta} /></Campo>
        )}
        {(tipo === "pc" || tipo === "objetivo" || tipo === "reserva") && <Campo rotulo="Prazo desejado (opcional)"><Data value={prazo} onChange={setPrazo} /></Campo>}
      </div>
    </Folha>
  );
}

function Extrato({ env, onFechar }: { env: Envelope; onFechar: () => void }) {
  const { d } = useApp();
  const linhas = useMemo(() => extratoEnvelope(d.movimentos, env.id).reverse(), [d.movimentos, env.id]);
  return (
    <Folha aberta onFechar={onFechar} titulo={`Histórico · ${env.nome}`}>
      {linhas.length ? (
        <div className="flex flex-col divide-y divide-line">
          {linhas.map((l) => (
            <div key={l.mov.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5">
              <span className="truncate text-[14px] font-semibold">{infoMov(l.mov, d).titulo}</span>
              <Money c={l.valor} sinal cor className="text-right text-[14px] font-semibold" />
              <span className="text-[12.5px] text-muted">{br(l.mov.data)}</span>
              <span className="text-right text-[12.5px] text-muted">saldo <Money c={l.saldo} /></span>
            </div>
          ))}
        </div>
      ) : <div className="py-6 text-center text-muted">Nenhuma movimentação neste envelope.</div>}
    </Folha>
  );
}
