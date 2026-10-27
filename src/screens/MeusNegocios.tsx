// Meus negócios: cada negócio é um app separado, ligado ao Finanças.
// Por enquanto: Plaquinhas NFC. O Finanças lê as vendas e o estoque de lá (sem alterar nada)
// e cuida da parte do dinheiro: caixa do negócio, lucro, retirada pessoal e simulação.

import { useMemo, useState } from "react";
import { Boxes, ExternalLink, Link2, Nfc, Plus } from "lucide-react";
import { addDias, br, inicioSemana, mesDe, nomeMesCurto, anoDe } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { disponivelParaRetirada, indicadores, ritmoVendas, serieMensal, serieSemanal, simular } from "../core/negocio";
import { ordenar } from "../core/ledger";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { ir } from "../app/rotas";
import { db } from "../data/db";
import { PREFIXO, URL_APP_NFC } from "../integracoes/nfc";
import { Barras } from "../ui/graficos";
import { Aviso, Badge, Button, Campo, Card, Chips, Data, Dinheiro, Interruptor, Money, Numero, Secao, Segmentos, Selecao, Stat, Vazio, useUi } from "../ui/ui";

type Aba = "nfc" | "ligacao" | "simulacao" | "retirada";

export function MeusNegocios({ aba: abaRota }: { aba: string }) {
  if (!abaRota) return <Lista />;
  const aba = (["nfc", "ligacao", "simulacao", "retirada"].includes(abaRota) ? abaRota : "nfc") as Aba;
  return (
    <div className="flex flex-col gap-5">
      <button className="self-start text-[13px] font-semibold text-accent" onClick={() => ir("negocios")}>← Meus negócios</button>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><IconeNfc /><h1 className="font-display text-[26px] font-semibold tracking-tight">Plaquinhas NFC</h1></div>
        <a href={URL_APP_NFC} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[14px] font-semibold text-accent-ink"><ExternalLink size={16} />Abrir o app</a>
      </header>
      <Chips value={aba} onChange={(v) => ir("negocios", v)} opcoes={[{ valor: "nfc", rotulo: "Resumo" }, { valor: "ligacao", rotulo: "Ligação" }, { valor: "simulacao", rotulo: "Simulação" }, { valor: "retirada", rotulo: "Retirada pessoal" }]} />
      {aba === "nfc" && <Resumo />}
      {aba === "ligacao" && <Ligacao />}
      {aba === "simulacao" && <Simulacao />}
      {aba === "retirada" && <Retirada />}
    </div>
  );
}

function IconeNfc() {
  return <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#4a68ff,#1f35c9)" }}><Nfc size={22} /></span>;
}

function Lista() {
  const { d, sit, nfc, hoje, modo } = useApp();
  const lig = d.config.negocios?.nfc;
  const k = mesDe(hoje);
  const x = useMemo(() => indicadores(d, sit, `${k}-01`, `${k}-31`), [d, sit, k]);
  const emEstoque = nfc.estoque.reduce((a, e) => a + e.emEstoque, 0);
  const naLoja = nfc.estoque.reduce((a, e) => a + e.naLoja, 0);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Meus negócios</h1>
        <p className="text-[14px] text-muted">Cada negócio tem o próprio app. Aqui o Finanças junta o dinheiro deles com o seu: caixa do negócio, lucro e quanto dá para você tirar.</p>
      </header>
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <button onClick={() => ir("negocios", "nfc")} className="flex items-center gap-3 text-left">
          <IconeNfc />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className="font-display text-[19px] font-semibold">Plaquinhas NFC</span>
              {modo === "demo" ? <Badge>demonstração</Badge> : lig?.ativo ? <Badge tom="good"><Link2 size={12} />ligado</Badge> : nfc.encontrado ? <Badge tom="warn">dados encontrados</Badge> : <Badge>sem dados neste aparelho</Badge>}</span>
            <span className="block text-[13px] text-muted">{nfc.encontrado ? `${nfc.registros} registros lidos do app` : modo === "demo" ? "Dados fictícios" : "Abra o app das placas neste mesmo aparelho e navegador"}</span>
          </span>
        </button>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat rotulo="Faturado este mês" valor={<Money c={x.faturamento} />} dica={`${x.unidades} placa(s)`} />
          <Stat rotulo="Lucro líquido do mês" valor={<Money c={x.lucroLiquido} />} tom={x.lucroLiquido < 0 ? "bad" : undefined} />
          <Stat rotulo="Caixa do negócio" valor={<Money c={sit.capitalNegocio.caixa} />} dica={`a receber ${brl(sit.capitalNegocio.aReceber)}`} />
          <Stat rotulo="Placas" valor={String(nfc.encontrado ? emEstoque : Object.values(sit.estoque.porProduto).reduce((a, e) => a + Math.max(0, e.qtd), 0))} dica={naLoja ? `em estoque · mais ${naLoja} nas lojas` : "em estoque"} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={URL_APP_NFC} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-semibold text-accent-ink"><ExternalLink size={17} />Abrir Plaquinhas NFC</a>
          <Button variante="outline" onClick={() => ir("negocios", "nfc")}>Ver no Finanças</Button>
          {!lig?.ativo && modo === "real" && <Button variante="soft" onClick={() => ir("negocios", "ligacao")}><Link2 size={16} />Ligar ao meu caixa</Button>}
        </div>
      </Card>
      <Vazio titulo="Outros negócios" icone={<Plus />}>Quando você tiver outra fonte de renda com app próprio, ela entra aqui do mesmo jeito.</Vazio>
    </div>
  );
}

function Ligacao() {
  const { d, sit, nfc, hoje, modo } = useApp();
  const { toast } = useUi();
  const atual = d.config.negocios?.nfc;
  const [ativo, setAtivo] = useState(atual?.ativo ?? true);
  const [contaId, setContaId] = useState(atual?.contaId ?? d.contas.find((c) => !c.arquivada)?.id ?? "");
  const [desde, setDesde] = useState(atual?.desde ?? hoje);
  const salvar = async () => {
    await db().config.update("cfg", { negocios: { ...d.config.negocios, nfc: { ativo, contaId, desde } } });
    toast(ativo ? "Plaquinhas NFC ligado ao seu caixa" : "Ligação desativada");
  };
  const ultimas = useMemo(() => ordenar(d.movimentos.filter((m) => m.id.startsWith(PREFIXO))).reverse().slice(0, 5), [d.movimentos]);
  if (modo === "demo") return <Aviso tom="info">No modo demonstração, o Finanças não lê o app das placas. Volte aos seus dados para fazer a ligação.</Aviso>;
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4">
        <div className="font-semibold">O que o Finanças encontrou neste aparelho</div>
        {nfc.encontrado ? (
          <>
            <div className="text-[14px] text-muted">{nfc.registros} registros do Plaquinhas NFC ({nfc.vendas} vendas). Eles continuam no app das placas: o Finanças só lê.</div>
            <div className="flex flex-col divide-y divide-line rounded-xl border border-line text-[14px]">
              {nfc.estoque.map((e) => <div key={e.tipoId} className="flex justify-between px-3 py-2"><span>{e.nome}</span><span className="text-muted">{e.emEstoque} em estoque{e.naLoja ? ` · ${e.naLoja} nas lojas` : ""} · {e.vendidas} vendidas</span></div>)}
            </div>
          </>
        ) : (
          <Aviso tom={nfc.erro ? "bad" : "warn"}>{nfc.erro ?? "Nenhum dado do Plaquinhas NFC neste navegador. Os dois apps precisam estar no mesmo aparelho e no mesmo navegador (Chrome). Abra o app das placas uma vez e volte aqui."}</Aviso>
        )}
        <a href={URL_APP_NFC} className="self-start text-[14px] font-semibold text-accent">Abrir Plaquinhas NFC →</a>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <label className="flex items-center justify-between gap-3"><span><b>Dinheiro das placas entra no meu caixa</b><br /><span className="text-[13px] text-muted">Vendas recebidas viram dinheiro no envelope do negócio; compras de estoque com custo saem dele.</span></span><Interruptor ligado={ativo} onChange={setAtivo} rotulo="Ligar ao caixa" /></label>
        {ativo && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Conta onde cai o dinheiro das placas"><Selecao value={contaId} onChange={setContaId} opcoes={d.contas.filter((c) => !c.arquivada).map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>
            <Campo rotulo="Contar a partir de" dica="O que entrou antes desta data já está no saldo das suas contas: conta no faturamento e no lucro, mas não entra de novo no caixa."><Data value={desde} onChange={setDesde} /></Campo>
          </div>
        )}
        <Button onClick={salvar}>Salvar ligação</Button>
        <Aviso tom="info">Registre vendas, entradas de estoque e recebimentos só no app das placas. Aqui no Finanças eles aparecem sozinhos (somente leitura). Gastos do negócio que o app das placas não tem, como transporte, você registra aqui como despesa do negócio.</Aviso>
      </Card>

      {ultimas.length > 0 && (
        <Secao titulo="Últimos registros lidos">
          <Card className="divide-y divide-line">
            {ultimas.map((m) => <div key={m.id} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]"><span className="min-w-0 truncate">{br(m.data)} · {m.descricao}</span><Money c={m.tipo === "venda" ? m.qtd * m.precoUnit - m.desconto : m.tipo === "estoque_compra" ? -m.valor : 0} className="font-semibold" /></div>)}
          </Card>
        </Secao>
      )}
      <p className="text-[12.5px] text-muted">Envelope do negócio hoje: {brl(sit.saldoEnv(sit.env.negocio))}.</p>
    </div>
  );
}

function Resumo() {
  const { d, sit, hoje, nfc } = useApp();
  const [per, setPer] = useState<"semana" | "mes" | "ano">("mes");
  const ini = per === "semana" ? inicioSemana(hoje) : per === "mes" ? `${mesDe(hoje)}-01` : `${anoDe(hoje)}-01-01`;
  const x = useMemo(() => indicadores(d, sit, ini, per === "semana" ? addDias(ini, 6) : hoje), [d, sit, ini, per, hoje]);
  const semanal = useMemo(() => serieSemanal(d, sit, hoje, 8), [d, sit, hoje]);
  const mensal = useMemo(() => serieMensal(d, sit, hoje, 6), [d, sit, hoje]);
  const [serie, setSerie] = useState<"semanas" | "meses">("semanas");
  const ret = disponivelParaRetirada(d, sit);
  if (!d.produtos.length) return <Vazio titulo="Nenhuma venda ou estoque encontrado" icone={<Boxes />} acao={<Button onClick={() => ir("negocios", "ligacao")}>Ver a ligação</Button>}>Quando o Plaquinhas NFC tiver registros neste aparelho, o faturamento, o custo e o lucro aparecem aqui sozinhos.</Vazio>;
  return (
    <div className="flex flex-col gap-5">
      <Segmentos value={per} onChange={setPer} opcoes={[{ valor: "semana", rotulo: "Esta semana" }, { valor: "mes", rotulo: "Este mês" }, { valor: "ano", rotulo: "Este ano" }]} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat rotulo="Faturamento" valor={<Money c={x.faturamento} />} dica={`${x.vendas} venda(s) · ${x.unidades} placa(s)`} />
        <Stat rotulo="Recebido de fato" valor={<Money c={x.recebido} />} dica="entrou no caixa no período" />
        <Stat rotulo="Custo das placas (CMV)" valor={<Money c={x.cmv} />} dica={x.cmvEstimado ? "parte estimada pelo custo de referência" : "pelo custo médio do estoque"} />
        <Stat rotulo="Lucro bruto" valor={<Money c={x.lucroBruto} />} dica="faturamento − custo" />
        <Stat rotulo="Despesas do negócio" valor={<Money c={x.despesasOperacionais} />} dica="transporte, embalagem, taxas" />
        <Stat rotulo="Lucro líquido" valor={<Money c={x.lucroLiquido} />} tom={x.lucroLiquido < 0 ? "bad" : x.lucroLiquido > 0 ? "good" : undefined} dica={x.margem != null ? `margem de ${Math.round(x.margem * 100)}%` : "sem vendas"} />
        <Stat rotulo="A receber (total)" valor={<Money c={sit.capitalNegocio.aReceber} />} dica="vendas ainda não pagas" />
        <Stat rotulo="Compras de estoque" valor={<Money c={x.comprasEstoque} />} dica="não é despesa: vira estoque" />
      </div>
      <Aviso tom="info">Faturamento é o que você vendeu. Recebido é o que entrou. Lucro é o que sobra depois do custo das placas e das despesas. Só o recebido está no caixa.</Aviso>

      <Secao titulo="Evolução" acao={<Segmentos className="w-48" value={serie} onChange={setSerie} opcoes={[{ valor: "semanas", rotulo: "Semanas" }, { valor: "meses", rotulo: "Meses" }]} />}>
        <Card className="p-4">
          <Barras dados={serie === "semanas" ? semanal.map((s) => ({ rotulo: br(s.ini).slice(0, 5), valores: [s.faturamento, s.lucro] })) : mensal.map((s) => ({ rotulo: nomeMesCurto(s.key), valores: [s.faturamento, s.lucro] }))} series={[{ nome: "Faturamento", cor: "#5aa9e6" }, { nome: "Lucro líquido", cor: "var(--good)" }]} />
        </Card>
      </Secao>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Secao titulo="Capital do negócio">
          <Card className="flex flex-col gap-2 p-4 text-[14px]">
            <div className="flex justify-between"><span className="text-muted">Caixa (envelope do negócio)</span><Money c={sit.capitalNegocio.caixa} className="font-semibold" /></div>
            <div className="flex justify-between"><span className="text-muted">Estoque a preço de custo</span><Money c={sit.capitalNegocio.estoque} className="font-semibold" /></div>
            <div className="flex justify-between border-t border-line pt-2"><span className="font-semibold">Total investido no negócio</span><Money c={sit.capitalNegocio.total} className="font-semibold" /></div>
            <div className="flex justify-between"><span className="text-muted">Para repor o estoque mínimo</span><Money c={sit.reposicao.total} className="font-semibold" /></div>
            <div className="flex justify-between"><span className="text-muted">Pode retirar para você</span><Money c={ret.valor} className="font-semibold text-accent" /></div>
            {ret.provisorio.length > 0 && <div className="text-[12.5px] text-warn">Estimativa provisória: {ret.provisorio.join(" ")}</div>}
          </Card>
        </Secao>
        <Secao titulo="Por tipo de placa no período">
          <Card className="divide-y divide-line">
            {d.produtos.map((p) => { const pp = x.porProduto[p.id]; return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]">
                <span className="min-w-0"><span className="block truncate font-semibold">{p.nome}</span><span className="text-[12.5px] text-muted">{pp?.unidades ?? 0} vendida(s) · {nfc.estoque.find((e) => PREFIXO + e.tipoId === p.id)?.emEstoque ?? sit.estoque.porProduto[p.id]?.qtd ?? 0} em estoque</span></span>
                <span className="text-right"><Money c={pp?.faturamento ?? 0} className="block font-semibold" /><span className="text-[12.5px] text-muted">lucro bruto <Money c={pp?.lucroBruto ?? 0} /></span></span>
              </div>
            ); })}
          </Card>
        </Secao>
      </div>
    </div>
  );
}

function Simulacao() {
  const { d, sit, hoje } = useApp();
  const ritmo = ritmoVendas(d, hoje);
  const p = d.produtos.find((x) => x.ativo) ?? d.produtos[0];
  const pc = sit.metas.find((m) => m.envelope.tipo === "pc");
  const estNfc = d.config.estrategias.find((e) => e.id === d.config.fontes.find((f) => f.id === "nfc")?.estrategiaId);
  const pctPC = estNfc?.regras.find((r) => r.envelopeId === pc?.envelope.id)?.valor ?? 40;
  const [u, setU] = useState(Math.max(1, Math.round(ritmo?.unidadesSemana ?? 5)));
  const [preco, setPreco] = useState<Cents | null>(ritmo?.precoMedio || p?.precoVenda || 8000);
  const [custo, setCusto] = useState<Cents | null>(p ? (sit.estoque.porProduto[p.id]?.custoMedio || p.custoReferencia) : 1400);
  const [adic, setAdic] = useState<Cents | null>(p?.custoAdicional ?? 0);
  const [desp, setDesp] = useState<Cents | null>(3000);
  const [semanas, setSemanas] = useState(4);
  const [prazo, setPrazo] = useState(0);
  const [pct, setPct] = useState(pctPC);
  const estoqueAtual = Object.values(sit.estoque.porProduto).reduce((a, e) => a + Math.max(0, e.qtd), 0);
  const r = simular({ unidadesSemana: u, preco: preco ?? 0, custoUnit: custo ?? 0, custoAdicional: adic ?? 0, despesasSemana: desp ?? 0, semanas, prazoRecebimentoDias: prazo, pctPatrimonio: pct, estoqueAtual, faltaMeta: pc?.falta ?? null });
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px] text-muted">"Se eu vender X placas por semana, quanto gero de lucro e quanto vai para o meu patrimônio?" Os campos já vêm com seus números reais{ritmo ? ` (você vendeu em média ${ritmo.unidadesSemana.toFixed(1).replace(".", ",")} por semana)` : ""}. Mude à vontade.</p>
      <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Campo rotulo="Placas por semana"><Numero value={u} onChange={setU} /></Campo>
        <Campo rotulo="Preço real de venda"><Dinheiro value={preco} onChange={setPreco} /></Campo>
        <Campo rotulo="Custo por placa"><Dinheiro value={custo} onChange={setCusto} /></Campo>
        <Campo rotulo="Custo adicional"><Dinheiro value={adic} onChange={setAdic} /></Campo>
        <Campo rotulo="Despesas por semana" dica="Transporte, etc."><Dinheiro value={desp} onChange={setDesp} /></Campo>
        <Campo rotulo="Prazo para receber (dias)"><Numero value={prazo} onChange={setPrazo} /></Campo>
        <Campo rotulo="Semanas simuladas"><Numero value={semanas} onChange={(n) => setSemanas(Math.max(1, Math.min(52, n)))} /></Campo>
        <Campo rotulo="% do lucro para o patrimônio"><Numero value={pct} onChange={(n) => setPct(Math.max(0, Math.min(100, n)))} /></Campo>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat rotulo="Lucro por placa" valor={<Money c={r.margemUnit} />} tom={r.margemUnit < 0 ? "bad" : undefined} />
        <Stat rotulo="Lucro por semana" valor={<Money c={r.lucroSemana} />} dica="depois das despesas" tom={r.lucroSemana < 0 ? "bad" : "good"} />
        <Stat rotulo={`Lucro em ${semanas} semana(s)`} valor={<Money c={r.total.lucro} />} dica={`faturando ${brl(r.total.faturamento)}`} />
        <Stat rotulo="Para o patrimônio" valor={<Money c={r.total.paraPatrimonio} />} dica={`${brl(r.paraPatrimonioSemana)} por semana`} tom="accent" />
        <Stat rotulo="Gasto para repor estoque" valor={<Money c={r.total.reposicao} />} dica="no período" />
        <Stat rotulo="Capital de giro necessário" valor={<Money c={r.capitalDeGiro} />} dica="para não parar de vender" />
        <Stat rotulo="Estoque atual dura" valor={r.estoqueDuraSemanas == null ? "—" : `${r.estoqueDuraSemanas} sem.`} dica={`${estoqueAtual} placa(s) em estoque`} />
        <Stat rotulo="PC nesse ritmo" valor={r.semanasMeta == null ? "—" : `${r.semanasMeta} sem.`} dica={pc?.meta ? `faltam ${brl(pc.falta)}` : "defina a meta do PC"} />
      </div>
      {r.avisos.map((a) => <Aviso key={a} tom="warn">{a}</Aviso>)}
      <p className="text-[12.5px] text-muted">Premissas: preço, custo e despesas constantes; todo o lucro do período é retirado e {pct}% dele vai para o patrimônio. É uma conta, não uma promessa: semanas fracas acontecem.</p>
    </div>
  );
}

function Retirada() {
  const { d, sit } = useApp();
  const ac = useAcoes();
  const r = disponivelParaRetirada(d, sit);
  const retiradas = ordenar(d.movimentos).reverse().filter((m) => m.tipo === "envelope" && m.origem === "retirada").slice(0, 10);
  const [minimo, setMinimo] = useState<Cents | null>(sit.env.negocio?.minimo ?? null);
  const { toast } = useUi();
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-5">
        <div className="text-[14px] text-muted">Você pode tirar sem comprometer o negócio</div>
        <div className="font-display text-[40px] font-semibold leading-none num text-accent">{brl(r.valor)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[14px]">
          <span className="text-muted">Caixa do negócio</span><Money c={r.caixa} className="text-right" />
          <span className="text-muted">− Contas do negócio a pagar</span><Money c={-r.contas} className="text-right" />
          <span className="text-muted">− Reposição do estoque mínimo</span><Money c={-r.reposicao} className="text-right" />
          <span className="text-muted">− Capital de giro mínimo</span><Money c={-r.minimo} className="text-right" />
        </div>
        {r.provisorio.length > 0 && <Aviso tom="warn">Estimativa provisória: {r.provisorio.join(" ")}</Aviso>}
        <Button onClick={() => ac.nova({ tipo: "retirada" })} disabled={r.caixa <= 0}>Fazer retirada</Button>
        <p className="text-[12.5px] text-muted">A retirada tira dinheiro do envelope do negócio e coloca em "a distribuir". Em seguida você distribui entre contas, PC, reserva e dinheiro livre.</p>
      </Card>
      <Secao titulo="Capital de giro mínimo">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Campo rotulo="Valor que nunca deve sair do negócio" className="min-w-[200px] flex-1"><Dinheiro value={minimo} onChange={setMinimo} /></Campo>
          <Button variante="outline" onClick={async () => { if (sit.env.negocio) { await db().envelopes.update(sit.env.negocio.id, { minimo: minimo ?? 0 }); toast("Capital de giro mínimo salvo"); } }}>Salvar</Button>
        </Card>
      </Secao>
      {retiradas.length > 0 && (
        <Secao titulo="Últimas retiradas">
          <Card className="divide-y divide-line">{retiradas.map((m) => <button key={m.id} onClick={() => ac.nova({ editId: m.id })} className="flex w-full justify-between px-4 py-3 text-[14px]"><span>{br(m.data)}</span><Money c={m.tipo === "envelope" ? -m.itens[0].valor : 0} className="font-semibold" /></button>)}</Card>
        </Secao>
      )}
    </div>
  );
}

