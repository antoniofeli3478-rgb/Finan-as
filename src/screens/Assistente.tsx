// Assistente de configuração: 8 passos, todos opcionais. Os valores do seu relato aparecem
// só como sugestões editáveis. O progresso fica salvo: dá para parar e continuar depois.

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { addMeses, fromParts } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { calcularSaldos } from "../core/ledger";
import { SUGESTOES } from "../core/defaults";
import type { Recorrencia } from "../core/types";
import { useApp } from "../app/store";
import { db } from "../data/db";
import { conciliar, distribuir, gerarRecorrencias, novoId, novoMov, salvarMovimento } from "../data/repo";
import { Aviso, Button, Campo, cn, Data, Dinheiro, Folha, Interruptor, Numero, Segmentos, Selecao, Texto, useUi } from "../ui/ui";

const PASSOS = [
  { id: "contas", nome: "Saldos das contas" },
  { id: "fixas", nome: "Contas fixas" },
  { id: "cartao", nome: "Cartão" },
  { id: "pc", nome: "Meta do PC" },
  { id: "reserva", nome: "Reserva" },
  { id: "produtos", nome: "Plaquinhas NFC" },
  { id: "negocio", nome: "Capital do negócio" },
  { id: "prioridades", nome: "Prioridades" },
];

export function Assistente({ onFechar }: { onFechar: () => void }) {
  const { d } = useApp();
  const primeiroPendente = Math.max(0, PASSOS.findIndex((p) => !d.config.setup[p.id]));
  const [i, setI] = useState(primeiroPendente);
  const passo = PASSOS[i];
  const concluir = async (ok = true) => {
    if (ok) await db().config.update("cfg", { setup: { ...d.config.setup, [passo.id]: true } });
    if (i < PASSOS.length - 1) setI(i + 1);
    else { await db().config.update("cfg", { setupDispensado: true }); onFechar(); }
  };
  return (
    <Folha aberta onFechar={onFechar} titulo="Configurar com a sua realidade" largura="lg">
      <div className="flex flex-col gap-5 pb-2">
        <div className="scroll-x flex gap-1.5">
          {PASSOS.map((p, k) => (
            <button key={p.id} onClick={() => setI(k)} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold", k === i ? "border-accent text-accent" : d.config.setup[p.id] ? "border-line text-good" : "border-line text-muted")}>
              {d.config.setup[p.id] ? <Check size={13} /> : <span>{k + 1}</span>}{p.nome}
            </button>
          ))}
        </div>
        <p className="text-[13.5px] text-muted">Nada aqui é obrigatório. Pule o que não souber agora: tudo pode ser mudado depois.</p>
        {passo.id === "contas" && <PassoContas onOk={concluir} />}
        {passo.id === "fixas" && <PassoFixas onOk={concluir} />}
        {passo.id === "cartao" && <PassoCartao onOk={concluir} />}
        {passo.id === "pc" && <PassoPC onOk={concluir} />}
        {passo.id === "reserva" && <PassoReserva onOk={concluir} />}
        {passo.id === "produtos" && <PassoNfc onOk={concluir} />}
        {passo.id === "negocio" && <PassoNegocio onOk={concluir} />}
        {passo.id === "prioridades" && <PassoPrioridades onOk={concluir} />}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <button className="text-[13.5px] font-semibold text-muted" onClick={onFechar}>Continuar depois</button>
          <button className="text-[13.5px] font-semibold text-muted" onClick={() => concluir(false)}>Pular este passo</button>
        </div>
      </div>
    </Folha>
  );
}

type P = { onOk: (ok?: boolean) => void };

function PassoContas({ onOk }: P) {
  const { d, hoje } = useApp();
  const saldos = calcularSaldos(d);
  const [vals, setVals] = useState<Record<string, Cents | null>>(Object.fromEntries(d.contas.map((c) => [c.id, saldos.contas[c.id] ?? 0])));
  const [nomes, setNomes] = useState<Record<string, string>>(Object.fromEntries(d.contas.map((c) => [c.id, c.nome])));
  const [extras, setExtras] = useState<{ id: string; nome: string; valor: Cents | null }[]>([]);
  const salvar = async () => {
    for (const c of d.contas) {
      const v = vals[c.id] ?? 0;
      const temMov = d.movimentos.some((m) => JSON.stringify(m).includes(`"${c.id}"`));
      if (nomes[c.id]?.trim() && nomes[c.id] !== c.nome) await db().contas.update(c.id, { nome: nomes[c.id].trim() });
      if (!temMov) await db().contas.update(c.id, { saldoInicial: v, conferido: { data: hoje, saldo: v } });
      else if (v !== (saldos.contas[c.id] ?? 0)) await conciliar(db(), c.id, v, hoje);
    }
    for (const e of extras) if (e.nome.trim()) await db().contas.put({ id: e.id, nome: e.nome.trim(), tipo: "banco", saldoInicial: e.valor ?? 0, conferido: { data: hoje, saldo: e.valor ?? 0 }, arquivada: false, ordem: d.contas.length + 1 });
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Quanto tem em cada conta hoje?</h3>
      <p className="text-[14px] text-muted">Olhe no app do banco e na carteira. Esse dinheiro entra como "a distribuir": nos próximos passos você diz o que já é do PC, da reserva e do negócio.</p>
      {d.contas.map((c) => (
        <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2"><Texto value={nomes[c.id]} onChange={(e) => setNomes({ ...nomes, [c.id]: e.target.value })} aria-label="Nome da conta" /><Dinheiro value={vals[c.id]} onChange={(v) => setVals({ ...vals, [c.id]: v })} aria-label={`Saldo de ${c.nome}`} /></div>
      ))}
      {extras.map((e, k) => (
        <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2"><Texto value={e.nome} placeholder="Nome da conta" onChange={(x) => setExtras(extras.map((y, j) => (j === k ? { ...y, nome: x.target.value } : y)))} /><Dinheiro value={e.valor} onChange={(v) => setExtras(extras.map((y, j) => (j === k ? { ...y, valor: v } : y)))} /></div>
      ))}
      <Button variante="outline" tamanho="sm" className="self-start" onClick={() => setExtras([...extras, { id: novoId(), nome: "", valor: 0 }])}><Plus size={15} />Outra conta</Button>
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoFixas({ onOk }: P) {
  const { d, sit, hoje } = useApp();
  const [itens, setItens] = useState(SUGESTOES.contas.map((s) => ({ ...s, ativo: s.valor > 0 && !s.nome.includes("se confirmar"), valor: s.valor as Cents | null, dia: 10, ja: d.recorrencias.some((r) => r.nome === s.nome) })));
  const salvar = async () => {
    const [y, m, dd] = hoje.split("-").map(Number);
    for (const it of itens.filter((x) => x.ativo && !x.ja)) {
      let inicio = fromParts(y, m, it.dia);
      if (it.dia < dd) inicio = addMeses(inicio, 1, it.dia);
      const r: Recorrencia = { id: novoId(), nome: it.nome.replace(" (se confirmar)", ""), valor: it.valor ?? 0, variavel: !it.valor, categoria: it.categoria, escopo: "pessoal", envelopeId: sit.env.obrigacoes?.id ?? "", frequencia: "mensal", intervalo: 1, inicio, geradoAte: null, prioridade: it.prioridade, ativa: true, contaId: d.contas[0]?.id ?? null };
      await db().recorrencias.put(r);
    }
    await gerarRecorrencias(db(), hoje);
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Quais contas você paga todo mês?</h3>
      <p className="text-[14px] text-muted">Sugestões a partir do que você contou. Marque só as que estão valendo e confira valores e dias. O resto você cadastra depois em Contas e faturas.</p>
      {itens.map((it, k) => (
        <div key={it.nome} className={cn("flex flex-col gap-2 rounded-xl border p-3", it.ativo ? "border-accent/50" : "border-line")}>
          <label className="flex items-center justify-between gap-3"><span className="font-semibold">{it.nome}{it.ja && <span className="ml-2 text-[12px] text-good">já cadastrada</span>}</span><Interruptor ligado={it.ativo} onChange={(v) => setItens(itens.map((x, j) => (j === k ? { ...x, ativo: v } : x)))} rotulo={it.nome} /></label>
          {it.ativo && !it.ja && (
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Valor" dica={!it.valor ? "Deixe vazio se não souber" : undefined}><Dinheiro value={it.valor} onChange={(v) => setItens(itens.map((x, j) => (j === k ? { ...x, valor: v } : x)))} /></Campo>
              <Campo rotulo="Dia do vencimento"><Numero value={it.dia} onChange={(n) => setItens(itens.map((x, j) => (j === k ? { ...x, dia: Math.max(1, Math.min(31, n)) } : x)))} /></Campo>
            </div>
          )}
        </div>
      ))}
      <Aviso tom="info">"Ajuda em casa" fica como essencial: entra no cálculo da reserva de emergência.</Aviso>
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoCartao({ onOk }: P) {
  const { d } = useApp();
  const c = d.cartoes[0];
  const [nome, setNome] = useState(c?.nome ?? "Inter");
  const [limite, setLimite] = useState<Cents | null>(c?.limite ?? null);
  const [fech, setFech] = useState(c?.fechamentoDia ?? 1);
  const [venc, setVenc] = useState(c?.vencimentoDia ?? 10);
  const [fatura, setFatura] = useState<Cents | null>(null);
  const salvar = async () => {
    if (limite == null) { onOk(false); return; }
    const id = c?.id ?? novoId();
    await db().cartoes.put({ id, nome, limite, limiteDisponivelInformado: null, fechamentoDia: fech, vencimentoDia: venc, arquivado: false });
    if (fatura && fatura > 0) {
      await salvarMovimento(db(), novoMov({ tipo: "cartao_compra", valor: fatura, cartaoId: id, parcelas: 1, categoria: "Outros", escopo: "pessoal", data: new Date(Date.now() - 86400000).toISOString().slice(0, 10), descricao: "Fatura já em aberto (saldo inicial)" }));
    }
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Seu cartão de crédito</h3>
      <p className="text-[14px] text-muted">Sem conectar ao banco: você só informa o limite e as datas. Se não usa cartão, pule.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Limite total"><Dinheiro value={limite} onChange={setLimite} /></Campo>
        <Campo rotulo="Dia de fechamento"><Numero value={fech} onChange={setFech} /></Campo>
        <Campo rotulo="Dia de vencimento"><Numero value={venc} onChange={setVenc} /></Campo>
      </div>
      {!c && <Campo rotulo="Quanto já tem na fatura atual (opcional)" dica="Entra como uma compra só, para o app saber o que vem por aí."><Dinheiro value={fatura} onChange={setFatura} /></Campo>}
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoPC({ onOk }: P) {
  const { sit, hoje } = useApp();
  const pc = sit.env.pc;
  const [meta, setMeta] = useState<Cents | null>(pc?.meta ?? SUGESTOES.pcMeta);
  const [prazo, setPrazo] = useState(pc?.prazo ?? addMeses(hoje, 10));
  const [guardado, setGuardado] = useState<Cents | null>(null);
  const salvar = async () => {
    if (!pc) return onOk(false);
    await db().envelopes.update(pc.id, { meta, prazo: prazo || null });
    if (guardado && guardado > 0) await distribuir(db(), [{ envelopeId: pc.id, valor: Math.min(guardado, Math.max(0, sit.saldos.aDistribuir)) }], hoje, { descricao: "Já guardado para o PC" });
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">A meta do PC</h3>
      <p className="text-[14px] text-muted">Para edição de vídeo, design, 3D e jogos. Sua referência é de {brl(SUGESTOES.pcFaixa[0])} a {brl(SUGESTOES.pcFaixa[1])}.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor da meta"><Dinheiro value={meta} onChange={setMeta} /></Campo>
        <Campo rotulo="Prazo desejado"><Data value={prazo} onChange={setPrazo} /></Campo>
      </div>
      <Campo rotulo="Quanto do seu saldo já é do PC?" dica={`Sai do que está a distribuir (${brl(Math.max(0, sit.saldos.aDistribuir))}).`}><Dinheiro value={guardado} onChange={setGuardado} /></Campo>
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoReserva({ onOk }: P) {
  const { sit, hoje } = useApp();
  const r = sit.env.reserva;
  const [modo, setModo] = useState<"despesas" | "manual">(r?.metaModo ?? "despesas");
  const [meses, setMeses] = useState(r?.mesesReserva ?? 3);
  const [meta, setMeta] = useState<Cents | null>(r?.meta ?? null);
  const [guardado, setGuardado] = useState<Cents | null>(null);
  const salvar = async () => {
    if (!r) return onOk(false);
    await db().envelopes.update(r.id, { metaModo: modo, mesesReserva: meses, meta: modo === "manual" ? meta : null });
    if (guardado && guardado > 0) await distribuir(db(), [{ envelopeId: r.id, valor: Math.min(guardado, Math.max(0, sit.saldos.aDistribuir)) }], hoje, { descricao: "Reserva que já existia" });
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Reserva de emergência</h3>
      <p className="text-[14px] text-muted">Dinheiro só para imprevistos reais. Ele nunca aparece como dinheiro livre.</p>
      <Segmentos value={modo} onChange={setModo} opcoes={[{ valor: "despesas", rotulo: "Meses de contas essenciais" }, { valor: "manual", rotulo: "Valor que eu escolho" }]} />
      {modo === "despesas" ? <Campo rotulo="Quantos meses" dica={`Contas essenciais hoje: ${brl(sit.despesasEssenciaisMes)}/mês → meta de ${brl(sit.despesasEssenciaisMes * meses)}.`}><Numero value={meses} onChange={(n) => setMeses(Math.max(1, Math.min(24, n)))} /></Campo> : <Campo rotulo="Meta"><Dinheiro value={meta} onChange={setMeta} /></Campo>}
      <Campo rotulo="Já tem algum valor guardado para isso?"><Dinheiro value={guardado} onChange={setGuardado} /></Campo>
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoNfc({ onOk }: P) {
  const { d, nfc, hoje } = useApp();
  const [contaId, setContaId] = useState(d.config.negocios?.nfc?.contaId ?? d.contas[0]?.id ?? "");
  const salvar = async () => {
    await db().config.update("cfg", { negocios: { ...d.config.negocios, nfc: { ativo: true, contaId, desde: d.config.negocios?.nfc?.desde ?? hoje } } });
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Ligar o Plaquinhas NFC</h3>
      <p className="text-[14px] text-muted">O app das placas continua separado. O Finanças só lê as vendas e o estoque de lá, para calcular o lucro e o caixa do negócio sem você digitar nada duas vezes.</p>
      {nfc.encontrado ? (
        <Aviso tom="good">Encontrei {nfc.registros} registros do Plaquinhas NFC neste aparelho ({nfc.vendas} vendas). {nfc.estoque.map((e) => `${e.nome}: ${e.emEstoque} em estoque`).join(" · ")}.</Aviso>
      ) : (
        <Aviso tom="warn">{nfc.erro ?? "Não encontrei dados do Plaquinhas NFC neste navegador. Dá para ligar mesmo assim: quando o app das placas tiver registros neste aparelho, eles aparecem aqui."}</Aviso>
      )}
      <Campo rotulo="Conta onde cai o dinheiro das placas"><Selecao value={contaId} onChange={setContaId} opcoes={d.contas.filter((c) => !c.arquivada).map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
      <Aviso tom="info">O dinheiro das vendas de antes de hoje já está no saldo que você informou, então só conta no faturamento e no lucro. Daqui para frente, o que você receber pelas placas entra no envelope do negócio.</Aviso>
      <Button onClick={salvar}>Ligar e continuar</Button>
    </div>
  );
}

function PassoNegocio({ onOk }: P) {
  const { sit, hoje } = useApp();
  const n = sit.env.negocio;
  const [capital, setCapital] = useState<Cents | null>(null);
  const [minimo, setMinimo] = useState<Cents | null>(n?.minimo || null);
  const salvar = async () => {
    if (!n) return onOk(false);
    await db().envelopes.update(n.id, { minimo: minimo ?? 0 });
    if (capital && capital > 0) await distribuir(db(), [{ envelopeId: n.id, valor: Math.min(capital, Math.max(0, sit.saldos.aDistribuir)) }], hoje, { descricao: "Capital inicial do negócio" });
    onOk();
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Dinheiro do negócio</h3>
      <p className="text-[14px] text-muted">Do seu saldo, quanto é do negócio (para comprar o próximo lote, materiais, transporte)? Esse dinheiro fica separado do seu.</p>
      <Campo rotulo="Capital do negócio hoje" dica={`Sai do que está a distribuir (${brl(Math.max(0, sit.saldos.aDistribuir))}).`}><Dinheiro value={capital} onChange={setCapital} /></Campo>
      <Campo rotulo="Capital de giro mínimo" dica="O suficiente para um lote novo. O app avisa se uma retirada deixar o negócio abaixo disso."><Dinheiro value={minimo} onChange={setMinimo} /></Campo>
      <Button onClick={salvar}>Salvar e continuar</Button>
    </div>
  );
}

function PassoPrioridades({ onOk }: P) {
  const { d, sit, hoje } = useApp();
  const { toast } = useUi();
  const pcId = sit.env.pc?.id, resId = sit.env.reserva?.id;
  const pegar = (estId: string, envId?: string) => d.config.estrategias.find((e) => e.id === estId)?.regras.find((r) => r.envelopeId === envId && r.modo === "percentual")?.valor ?? 0;
  const [vals, setVals] = useState({ tpc: pegar("est-trabalho", pcId), tres: pegar("est-trabalho", resId), npc: pegar("est-nfc", pcId), nres: pegar("est-nfc", resId) });
  const [restoLivre, setRestoLivre] = useState(true);
  const salvar = async () => {
    if (vals.tpc + vals.tres > 100 || vals.npc + vals.nres > 100) { toast("Em cada estratégia, as porcentagens precisam somar até 100%.", true); return; }
    const set = (estId: string, pc: number, res: number) => d.config.estrategias.map((e) => e.id !== estId ? e : { ...e, regras: e.regras.map((r) => (r.modo === "percentual" && r.envelopeId === pcId ? { ...r, valor: pc } : r.modo === "percentual" && r.envelopeId === resId ? { ...r, valor: res } : r)) });
    let est = set("est-trabalho", vals.tpc, vals.tres);
    est = est.map((e) => (e.id === "est-nfc" ? set("est-nfc", vals.npc, vals.nres).find((x) => x.id === "est-nfc")! : e));
    await db().config.update("cfg", { estrategias: est });
    const sobra = Math.max(0, sit.saldos.aDistribuir);
    if (restoLivre && sobra > 0 && sit.env.livre) await distribuir(db(), [{ envelopeId: sit.env.livre.id, valor: sobra }], hoje, { descricao: "Restante do saldo inicial" });
    onOk();
  };
  const linha = (rot: string, k: keyof typeof vals) => <Campo rotulo={rot}><Numero value={vals[k]} onChange={(n) => setVals({ ...vals, [k]: Math.max(0, Math.min(100, n)) })} /></Campo>;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-[20px] font-semibold">Prioridades de cada dinheiro que entra</h3>
      <p className="text-[14px] text-muted">Primeiro o app sempre cobre as contas próximas. Do que sobrar, quanto vai para o PC e para a reserva? O resto vira dinheiro livre. São sugestões: em cada recebimento você pode mudar.</p>
      <div className="rounded-xl border border-line p-3"><div className="mb-2 font-semibold">Trabalhos e eventos</div><div className="grid grid-cols-2 gap-2">{linha("% para o PC", "tpc")}{linha("% para a reserva", "tres")}</div></div>
      <div className="rounded-xl border border-line p-3"><div className="mb-2 font-semibold">Lucro retirado do negócio NFC</div><div className="grid grid-cols-2 gap-2">{linha("% para o PC", "npc")}{linha("% para a reserva", "nres")}</div></div>
      {sit.saldos.aDistribuir > 0 && <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3"><span className="text-[14px]"><b>Colocar o resto do saldo ({brl(sit.saldos.aDistribuir)}) como dinheiro livre</b><br /><span className="text-muted">Ou deixe a distribuir para decidir depois.</span></span><Interruptor ligado={restoLivre} onChange={setRestoLivre} rotulo="Resto como livre" /></label>}
      <Button onClick={salvar}>Concluir configuração</Button>
    </div>
  );
}
