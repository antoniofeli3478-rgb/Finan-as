// Meus negócios: cada negócio é um envelope do tipo "negocio", com caixa próprio.
// Tudo é lançado à mão: vendas (receitas do negócio), gastos do negócio e retiradas.
// Aqui ficam o resumo de cada um, a simulação e quanto dá para tirar para você.

import { useMemo, useState } from "react";
import { BriefcaseBusiness, Plus, ShoppingBag, Wallet, Receipt } from "lucide-react";
import { addDias, anoDe, br, inicioSemana, mesDe, nomeMesCurto } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { disponivelParaRetirada, indicadores, serieMensal, serieSemanal, simular } from "../core/negocio";
import { ordenar } from "../core/ledger";
import type { Envelope, Movimento } from "../core/types";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { ir } from "../app/rotas";
import { db } from "../data/db";
import { novoId } from "../data/repo";
import { Barras } from "../ui/graficos";
import { Aviso, Badge, Button, Campo, Card, Chips, Dinheiro, Folha, Money, Numero, Secao, Segmentos, Stat, Texto, Vazio, useUi } from "../ui/ui";

type Aba = "resumo" | "simulacao" | "retirada" | "ajustes";

const CORES = ["#5aa9e6", "#e07a5f", "#81b29a", "#c77dff", "#f2a65a", "#4ecdc4"];

function Icone({ e, size = 44 }: { e: Envelope; size?: number }) {
  return <span className="grid shrink-0 place-items-center rounded-xl text-white" style={{ width: size, height: size, background: e.cor }}><BriefcaseBusiness size={size / 2} /></span>;
}

export function MeusNegocios({ aba: id }: { aba: string }) {
  const { d } = useApp();
  const negocio = d.envelopes.find((e) => e.id === id && e.tipo === "negocio");
  if (!negocio) return <Lista />;
  return <Detalhe n={negocio} />;
}

/** Movimentações que mexem no caixa de um negócio. */
function doNegocio(m: Movimento, id: string) {
  if (m.tipo === "receita") return m.negocioId === id;
  if (m.tipo === "despesa") return m.envelopeId === id;
  if (m.tipo === "envelope") return m.itens.some((i) => i.envelopeId === id);
  return false;
}

function Lista() {
  const { d, sit, hoje } = useApp();
  const ac = useAcoes();
  const [novo, setNovo] = useState(false);
  const negocios = d.envelopes.filter((e) => e.tipo === "negocio" && !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  const k = mesDe(hoje);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">Meus negócios</h1>
          <p className="text-[14px] text-muted">O dinheiro de cada negócio fica separado do seu. Lance as vendas e os gastos à mão; para usar o lucro com você, faça uma retirada.</p>
        </div>
        <Button variante="outline" onClick={() => setNovo(true)}><Plus size={16} />Novo negócio</Button>
      </header>
      {!negocios.length && <Vazio titulo="Nenhum negócio ainda" icone={<BriefcaseBusiness />} acao={<Button onClick={() => setNovo(true)}>Criar meu negócio</Button>}>Por exemplo: Plaquinhas NFC, revenda, um serviço que você presta.</Vazio>}
      {negocios.map((n) => <CartaoNegocio key={n.id} n={n} ini={`${k}-01`} fim={`${k}-31`} />)}
      {negocios.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ac.nova({ tipo: "venda_negocio" })}><ShoppingBag size={16} />Registrar venda</Button>
          <Button variante="soft" onClick={() => ac.nova({ tipo: "despesa", negocioId: negocios[0].id })}><Receipt size={16} />Gasto do negócio</Button>
        </div>
      )}
      <p className="text-[12.5px] text-muted">Caixa de todos os negócios: {brl(sit.capitalNegocio.caixa)} · a receber {brl(sit.capitalNegocio.aReceber)}.</p>
      {novo && <NovoNegocio onFechar={() => setNovo(false)} />}
    </div>
  );
}

function CartaoNegocio({ n, ini, fim }: { n: Envelope; ini: string; fim: string }) {
  const { d, sit } = useApp();
  const x = useMemo(() => indicadores(d, sit, ini, fim, n.id), [d, sit, ini, fim, n.id]);
  const aReceber = sit.aReceber.filter((r) => r.escopo === "negocio" && (d.movimentos.find((m) => m.id === r.movId) as { negocioId?: string } | undefined)?.negocioId === n.id).reduce((a, r) => a + r.valor, 0);
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <button onClick={() => ir("negocios", n.id)} className="flex items-center gap-3 text-left">
        <Icone e={n} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[19px] font-semibold">{n.nome}</span>
          <span className="block text-[13px] text-muted">{x.vendas} venda(s) este mês</span>
        </span>
        <span className="text-[13px] font-semibold text-accent">Abrir →</span>
      </button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat rotulo="Vendido este mês" valor={<Money c={x.faturamento} />} />
        <Stat rotulo="Lucro do mês" valor={<Money c={x.lucroLiquido} />} tom={x.lucroLiquido < 0 ? "bad" : undefined} dica="vendas − gastos" />
        <Stat rotulo="Caixa do negócio" valor={<Money c={sit.saldoEnv(n)} />} />
        <Stat rotulo="A receber" valor={<Money c={aReceber} />} />
      </div>
    </Card>
  );
}

function NovoNegocio({ onFechar }: { onFechar: () => void }) {
  const { d } = useApp();
  const { toast } = useUi();
  const [nome, setNome] = useState("");
  const [minimo, setMinimo] = useState<Cents | null>(null);
  const salvar = async () => {
    if (!nome.trim()) { toast("Dê um nome ao negócio.", true); return; }
    const id = novoId();
    const qtd = d.envelopes.filter((e) => e.tipo === "negocio").length;
    await db().envelopes.put({ id, nome: nome.trim(), tipo: "negocio", cor: CORES[qtd % CORES.length], meta: null, minimo: minimo ?? 0, arquivado: false, ordem: Math.max(0, ...d.envelopes.map((e) => e.ordem)) + 1 });
    toast(`${nome.trim()} criado`);
    onFechar();
    ir("negocios", id);
  };
  return (
    <Folha aberta onFechar={onFechar} titulo="Novo negócio" rodape={<Button className="w-full" onClick={salvar}>Criar</Button>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plaquinhas NFC" maxLength={60} autoFocus /></Campo>
        <Campo rotulo="Capital de giro mínimo" dica="Opcional. O dinheiro que nunca deve sair do negócio (ex.: para o próximo lote)."><Dinheiro value={minimo} onChange={setMinimo} /></Campo>
        <Aviso tom="info">O negócio começa com caixa zero. Se já tem dinheiro separado para ele, use "Aporte em objetivo" para mover do seu dinheiro para o negócio.</Aviso>
      </div>
    </Folha>
  );
}

function Detalhe({ n }: { n: Envelope }) {
  const ac = useAcoes();
  const [aba, setAba] = useState<Aba>("resumo");
  return (
    <div className="flex flex-col gap-5">
      <button className="self-start text-[13px] font-semibold text-accent" onClick={() => ir("negocios")}>← Meus negócios</button>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><Icone e={n} /><h1 className="truncate font-display text-[26px] font-semibold tracking-tight">{n.nome}</h1>{n.arquivado && <Badge>arquivado</Badge>}</div>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => ac.nova({ tipo: "venda_negocio", negocioId: n.id })}><ShoppingBag size={16} />Venda</Button>
        <Button variante="soft" onClick={() => ac.nova({ tipo: "despesa", negocioId: n.id })}><Receipt size={16} />Gasto</Button>
        <Button variante="outline" onClick={() => ac.nova({ tipo: "retirada", negocioId: n.id })}><Wallet size={16} />Retirada</Button>
      </div>
      <Chips value={aba} onChange={setAba} opcoes={[{ valor: "resumo", rotulo: "Resumo" }, { valor: "simulacao", rotulo: "Simulação" }, { valor: "retirada", rotulo: "Retirada pessoal" }, { valor: "ajustes", rotulo: "Ajustes" }]} />
      {aba === "resumo" && <Resumo n={n} />}
      {aba === "simulacao" && <Simulacao n={n} />}
      {aba === "retirada" && <Retirada n={n} />}
      {aba === "ajustes" && <Ajustes n={n} />}
    </div>
  );
}

function Resumo({ n }: { n: Envelope }) {
  const { d, sit, hoje } = useApp();
  const ac = useAcoes();
  const [per, setPer] = useState<"semana" | "mes" | "ano">("mes");
  const ini = per === "semana" ? inicioSemana(hoje) : per === "mes" ? `${mesDe(hoje)}-01` : `${anoDe(hoje)}-01-01`;
  const x = useMemo(() => indicadores(d, sit, ini, per === "semana" ? addDias(ini, 6) : hoje, n.id), [d, sit, ini, per, hoje, n.id]);
  const semanal = useMemo(() => serieSemanal(d, sit, hoje, 8, n.id), [d, sit, hoje, n.id]);
  const mensal = useMemo(() => serieMensal(d, sit, hoje, 6, n.id), [d, sit, hoje, n.id]);
  const [serie, setSerie] = useState<"semanas" | "meses">("semanas");
  const ret = disponivelParaRetirada(d, sit, n.id);
  const movs = useMemo(() => ordenar(d.movimentos.filter((m) => doNegocio(m, n.id))).reverse(), [d.movimentos, n.id]);
  const [mostrar, setMostrar] = useState(15);
  const valorNoCaixa = (m: Movimento): Cents => {
    if (m.tipo === "receita") return m.valor;
    if (m.tipo === "despesa") return -m.valor;
    if (m.tipo === "envelope") return m.itens.filter((i) => i.envelopeId === n.id).reduce((a, i) => a + i.valor, 0);
    return 0;
  };
  const rotulo = (m: Movimento) => m.tipo === "receita" ? (m.status === "pendente" ? "Venda · a receber" : "Venda") : m.tipo === "despesa" ? (m.status === "pendente" ? "Gasto · a pagar" : "Gasto") : m.tipo === "envelope" && m.origem === "retirada" ? "Retirada" : "Movimento de envelope";
  return (
    <div className="flex flex-col gap-5">
      <Segmentos value={per} onChange={setPer} opcoes={[{ valor: "semana", rotulo: "Esta semana" }, { valor: "mes", rotulo: "Este mês" }, { valor: "ano", rotulo: "Este ano" }]} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat rotulo="Vendido" valor={<Money c={x.faturamento} />} dica={`${x.vendas} venda(s)`} />
        <Stat rotulo="Recebido de fato" valor={<Money c={x.recebido} />} dica="já entrou no caixa" />
        <Stat rotulo="Gastos do negócio" valor={<Money c={x.despesasOperacionais} />} dica="mercadoria, transporte, taxas" />
        <Stat rotulo="Lucro" valor={<Money c={x.lucroLiquido} />} tom={x.lucroLiquido < 0 ? "bad" : x.lucroLiquido > 0 ? "good" : undefined} dica={x.margem != null ? `margem de ${Math.round(x.margem * 100)}%` : "sem vendas"} />
      </div>
      <Aviso tom="info">Vendido é tudo o que você vendeu, mesmo o que ainda vão te pagar. Lucro é vendido menos os gastos do negócio no período. Só o recebido está no caixa.</Aviso>

      <Secao titulo="Evolução" acao={<Segmentos className="w-48" value={serie} onChange={setSerie} opcoes={[{ valor: "semanas", rotulo: "Semanas" }, { valor: "meses", rotulo: "Meses" }]} />}>
        <Card className="p-4">
          <Barras dados={serie === "semanas" ? semanal.map((s) => ({ rotulo: br(s.ini).slice(0, 5), valores: [s.faturamento, s.lucro] })) : mensal.map((s) => ({ rotulo: nomeMesCurto(s.key), valores: [s.faturamento, s.lucro] }))} series={[{ nome: "Vendido", cor: "#5aa9e6" }, { nome: "Lucro", cor: "var(--good)" }]} />
        </Card>
      </Secao>

      <Secao titulo="Dinheiro do negócio">
        <Card className="flex flex-col gap-2 p-4 text-[14px]">
          <div className="flex justify-between"><span className="text-muted">Caixa</span><Money c={sit.saldoEnv(n)} className="font-semibold" /></div>
          <div className="flex justify-between"><span className="text-muted">Contas do negócio a pagar</span><Money c={-ret.contas} className="font-semibold" /></div>
          <div className="flex justify-between"><span className="text-muted">Capital de giro mínimo</span><Money c={-ret.minimo} className="font-semibold" /></div>
          <div className="flex justify-between border-t border-line pt-2"><span className="font-semibold">Pode retirar para você</span><Money c={ret.valor} className="font-semibold text-accent" /></div>
        </Card>
      </Secao>

      <Secao titulo="Lançamentos">
        {movs.length ? (
          <Card className="divide-y divide-line">
            {movs.slice(0, mostrar).map((m) => (
              <button key={m.id} onClick={() => ac.nova({ editId: m.id })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px]">
                <span className="min-w-0"><span className="block truncate font-semibold">{m.descricao}</span><span className="text-[12.5px] text-muted">{br(m.data)} · {rotulo(m)}</span></span>
                <Money c={valorNoCaixa(m)} className="shrink-0 font-semibold" />
              </button>
            ))}
            {movs.length > mostrar && <button className="w-full px-4 py-3 text-[13.5px] font-semibold text-accent" onClick={() => setMostrar((k) => k + 30)}>Ver mais</button>}
          </Card>
        ) : <Vazio titulo="Nada lançado ainda" icone={<ShoppingBag />}>Use os botões Venda e Gasto lá em cima. Tudo o que você lançar aparece aqui.</Vazio>}
      </Secao>
    </div>
  );
}

function Simulacao({ n }: { n: Envelope }) {
  const { d, sit, hoje } = useApp();
  // Base real: últimas 8 semanas deste negócio
  const base = useMemo(() => indicadores(d, sit, addDias(inicioSemana(hoje), -49), hoje, n.id), [d, sit, hoje, n.id]);
  const pc = sit.metas.find((m) => m.envelope.tipo === "pc");
  const estNeg = d.config.estrategias.find((e) => e.id === d.config.fontes.find((f) => f.id === "nfc")?.estrategiaId);
  const pctPC = estNeg?.regras.find((r) => r.envelopeId === pc?.envelope.id)?.valor ?? 40;
  const [u, setU] = useState(Math.max(1, Math.round(base.vendas / 8) || 5));
  const [preco, setPreco] = useState<Cents | null>(base.vendas ? Math.round(base.faturamento / base.vendas) : 8000);
  const [custo, setCusto] = useState<Cents | null>(0);
  const [desp, setDesp] = useState<Cents | null>(base.vendas ? Math.round(base.despesasOperacionais / 8) : 3000);
  const [semanas, setSemanas] = useState(4);
  const [prazo, setPrazo] = useState(0);
  const [pct, setPct] = useState(pctPC);
  const r = simular({ unidadesSemana: u, preco: preco ?? 0, custoUnit: custo ?? 0, custoAdicional: 0, despesasSemana: desp ?? 0, semanas, prazoRecebimentoDias: prazo, pctPatrimonio: pct, estoqueAtual: null, faltaMeta: pc?.falta ?? null });
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-muted">"Se eu vender X por semana, quanto gero de lucro e quanto vai para o meu patrimônio?" {base.vendas ? `Os campos já vêm com a média das suas últimas 8 semanas (${(base.vendas / 8).toFixed(1).replace(".", ",")} vendas por semana).` : "Coloque os seus números."} Mude à vontade.</p>
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Campo rotulo="Vendas por semana"><Numero value={u} onChange={setU} /></Campo>
        <Campo rotulo="Valor médio de cada venda"><Dinheiro value={preco} onChange={setPreco} /></Campo>
        <Campo rotulo="Custo de cada venda" dica="Mercadoria de cada uma"><Dinheiro value={custo} onChange={setCusto} /></Campo>
        <Campo rotulo="Gastos por semana" dica="Transporte, etc."><Dinheiro value={desp} onChange={setDesp} /></Campo>
        <Campo rotulo="Prazo para receber (dias)"><Numero value={prazo} onChange={setPrazo} /></Campo>
        <Campo rotulo="Semanas simuladas"><Numero value={semanas} onChange={(k) => setSemanas(Math.max(1, Math.min(52, k)))} /></Campo>
        <Campo rotulo="% do lucro para o patrimônio"><Numero value={pct} onChange={(k) => setPct(Math.max(0, Math.min(100, k)))} /></Campo>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat rotulo="Lucro por venda" valor={<Money c={r.margemUnit} />} tom={r.margemUnit < 0 ? "bad" : undefined} />
        <Stat rotulo="Lucro por semana" valor={<Money c={r.lucroSemana} />} dica="depois dos gastos" tom={r.lucroSemana < 0 ? "bad" : "good"} />
        <Stat rotulo={`Lucro em ${semanas} semana(s)`} valor={<Money c={r.total.lucro} />} dica={`vendendo ${brl(r.total.faturamento)}`} />
        <Stat rotulo="Para o patrimônio" valor={<Money c={r.total.paraPatrimonio} />} dica={`${brl(r.paraPatrimonioSemana)} por semana`} tom="accent" />
        <Stat rotulo="Capital de giro necessário" valor={<Money c={r.capitalDeGiro} />} dica="para não parar de vender" />
        <Stat rotulo="PC nesse ritmo" valor={r.semanasMeta == null ? "—" : `${r.semanasMeta} sem.`} dica={pc?.meta ? `faltam ${brl(pc.falta)}` : "defina a meta do PC"} />
      </div>
      {r.avisos.map((a) => <Aviso key={a} tom="warn">{a}</Aviso>)}
      <p className="text-[12.5px] text-muted">Premissas: valores constantes; todo o lucro do período é retirado e {pct}% dele vai para o patrimônio. É uma conta, não uma promessa: semanas fracas acontecem.</p>
    </div>
  );
}

function Retirada({ n }: { n: Envelope }) {
  const { d, sit } = useApp();
  const ac = useAcoes();
  const r = disponivelParaRetirada(d, sit, n.id);
  const retiradas = ordenar(d.movimentos).reverse().filter((m) => m.tipo === "envelope" && m.origem === "retirada" && m.itens.some((i) => i.envelopeId === n.id)).slice(0, 10);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-5">
        <div className="text-[14px] text-muted">Você pode tirar sem comprometer o negócio</div>
        <div className="font-display text-[40px] font-semibold leading-none num text-accent">{brl(r.valor)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[14px]">
          <span className="text-muted">Caixa do negócio</span><Money c={r.caixa} className="text-right" />
          <span className="text-muted">− Contas do negócio a pagar</span><Money c={-r.contas} className="text-right" />
          {r.reposicao > 0 && <><span className="text-muted">− Reposição do estoque mínimo</span><Money c={-r.reposicao} className="text-right" /></>}
          <span className="text-muted">− Capital de giro mínimo</span><Money c={-r.minimo} className="text-right" />
        </div>
        {r.provisorio.length > 0 && <Aviso tom="warn">{r.provisorio.join(" ")}</Aviso>}
        <Button onClick={() => ac.nova({ tipo: "retirada", negocioId: n.id })} disabled={r.caixa <= 0}>Fazer retirada</Button>
        <p className="text-[12.5px] text-muted">A retirada tira dinheiro do caixa do negócio e coloca em "a distribuir". Em seguida você distribui entre contas, PC, reserva e dinheiro livre.</p>
      </Card>
      {retiradas.length > 0 && (
        <Secao titulo="Últimas retiradas">
          <Card className="divide-y divide-line">{retiradas.map((m) => <button key={m.id} onClick={() => ac.nova({ editId: m.id })} className="flex w-full justify-between px-4 py-3 text-[14px]"><span>{br(m.data)}</span><Money c={m.tipo === "envelope" ? -m.itens.filter((i) => i.envelopeId === n.id).reduce((a, i) => a + i.valor, 0) : 0} className="font-semibold" /></button>)}</Card>
        </Secao>
      )}
    </div>
  );
}

function Ajustes({ n }: { n: Envelope }) {
  const { sit } = useApp();
  const { toast, confirmar } = useUi();
  const [nome, setNome] = useState(n.nome);
  const [minimo, setMinimo] = useState<Cents | null>(n.minimo ?? null);
  const salvar = async () => {
    if (!nome.trim()) { toast("Dê um nome ao negócio.", true); return; }
    await db().envelopes.update(n.id, { nome: nome.trim(), minimo: minimo ?? 0 });
    toast("Salvo");
  };
  const arquivar = async () => {
    const saldo = sit.saldoEnv(n);
    if (!(await confirmar({ titulo: n.arquivado ? "Reativar negócio?" : "Arquivar negócio?", texto: n.arquivado ? "Ele volta a aparecer na lista." : saldo ? `O caixa dele tem ${brl(saldo)}. Antes de arquivar, faça uma retirada para esse dinheiro não ficar parado. Os lançamentos continuam no histórico.` : "Ele some da lista, mas os lançamentos continuam no histórico.", botao: n.arquivado ? "Reativar" : "Arquivar" }))) return;
    await db().envelopes.update(n.id, { arquivado: !n.arquivado });
    toast(n.arquivado ? "Reativado" : "Arquivado");
    if (!n.arquivado) ir("negocios");
  };
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-4">
        <Campo rotulo="Nome do negócio"><Texto value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} /></Campo>
        <Campo rotulo="Capital de giro mínimo" dica="O valor que nunca deve sair do negócio. O app não deixa a retirada sugerida passar disso."><Dinheiro value={minimo} onChange={setMinimo} /></Campo>
        <Button onClick={salvar}>Salvar</Button>
      </Card>
      <Button variante="outline" onClick={arquivar}>{n.arquivado ? "Reativar negócio" : "Arquivar negócio"}</Button>
    </div>
  );
}
