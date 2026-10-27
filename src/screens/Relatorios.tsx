import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { addDias, addMesKey, anoDe, br, inicioSemana, mesDe, nomeMes, nomeMesCurto } from "../core/dates";
import { brl } from "../core/money";
import { evolucaoCaixa, relatorioPeriodo } from "../core/relatorios";
import { indicadores } from "../core/negocio";
import { useApp } from "../app/store";
import { ir } from "../app/rotas";
import { movimentosCSV } from "../data/backup";
import { BarrasH, Linha } from "../ui/graficos";
import { Button, Card, cn, entregarArquivo, Money, Secao, Segmentos, Stat, useUi } from "../ui/ui";

type Per = "semana" | "mes" | "ano";

function intervalo(per: Per, ref: string) {
  if (per === "semana") { const ini = inicioSemana(ref); return { ini, fim: addDias(ini, 6), nome: `Semana de ${br(ini)}` }; }
  if (per === "mes") { const k = mesDe(ref); return { ini: `${k}-01`, fim: `${k}-31`, nome: nomeMes(k) }; }
  const a = anoDe(ref); return { ini: `${a}-01-01`, fim: `${a}-12-31`, nome: a };
}
function mover(per: Per, ref: string, n: number) {
  if (per === "semana") return addDias(ref, 7 * n);
  if (per === "mes") return `${addMesKey(mesDe(ref), n)}-01`;
  return `${Number(anoDe(ref)) + n}-01-01`;
}

export function Relatorios() {
  const { d, sit, hoje } = useApp();
  const { toast } = useUi();
  const [per, setPer] = useState<Per>("mes");
  const [ref, setRef] = useState(hoje);
  const atual = intervalo(per, ref);
  const anterior = intervalo(per, mover(per, ref, -1));
  const r = useMemo(() => relatorioPeriodo(d, sit, atual.ini, atual.fim), [d, sit, atual.ini, atual.fim]);
  const ra = useMemo(() => relatorioPeriodo(d, sit, anterior.ini, anterior.fim), [d, sit, anterior.ini, anterior.fim]);
  const caixa = useMemo(() => evolucaoCaixa(d, hoje, 12), [d, hoje]);
  const futuros = useMemo(() => {
    const k = mesDe(hoje);
    return [0, 1, 2].map((i) => { const key = addMesKey(k, i); return { key, valor: sit.compromissos.filter((c) => c.vencimento.startsWith(key)).reduce((a, c) => a + c.valor, 0) }; });
  }, [sit, hoje]);
  const fonte = (id: string) => d.config.fontes.find((f) => f.id === id)?.nome ?? id;
  const env = (id: string) => d.envelopes.find((e) => e.id === id);
  const variacao = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 100));
  const comp = (rotulo: string, a: number, b: number, inverso = false) => {
    const v = variacao(a, b);
    return (
      <div className="flex items-center justify-between gap-3 py-2 text-[14px]">
        <span className="text-muted">{rotulo}</span>
        <span className="flex items-center gap-3"><Money c={b} className="text-muted" /><span>→</span><Money c={a} className="font-semibold" />{v != null && <span className={cn("w-12 text-right text-[12.5px] font-semibold", (inverso ? v < 0 : v > 0) ? "text-good" : v === 0 ? "text-muted" : "text-bad")}>{v > 0 ? "+" : ""}{v}%</span>}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Relatórios</h1>
        <div className="flex gap-2">
          <Button variante="outline" tamanho="sm" onClick={async () => { await entregarArquivo(`movimentacoes-${hoje}.csv`, movimentosCSV(d), "text/csv"); toast("Planilha gerada"); }}><Download size={15} />CSV</Button>
          <Button variante="outline" tamanho="sm" onClick={() => ir("config")}>Backup JSON</Button>
          <Button variante="outline" tamanho="sm" onClick={() => window.print()}><Printer size={15} />Imprimir</Button>
        </div>
      </header>
      <h1 className="hidden font-display text-2xl font-semibold print:block">Relatório financeiro · {atual.nome}</h1>

      <div className="no-print flex flex-col gap-3">
        <Segmentos value={per} onChange={(v) => { setPer(v); setRef(hoje); }} opcoes={[{ valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }, { valor: "ano", rotulo: "Ano" }]} />
        <div className="flex items-center gap-2">
          <button aria-label="Anterior" className="grid h-10 w-10 place-items-center rounded-xl border border-line" onClick={() => setRef(mover(per, ref, -1))}><ChevronLeft size={18} /></button>
          <div className="flex-1 text-center font-semibold capitalize">{atual.nome}</div>
          <button aria-label="Próximo" className="grid h-10 w-10 place-items-center rounded-xl border border-line" onClick={() => setRef(mover(per, ref, 1))}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat rotulo="Rendas" valor={<Money c={r.receitasPessoais} />} dica={`${brl(r.recebidas)} já recebidos`} />
        <Stat rotulo="Lucro do negócio" valor={<Money c={r.nfc.lucroLiquido} />} dica={`faturou ${brl(r.nfc.faturamento)}`} />
        <Stat rotulo="Gastos pessoais" valor={<Money c={r.gastosPessoais} />} />
        <Stat rotulo="Gastos do negócio" valor={<Money c={r.gastosNegocio} />} dica="já descontados do lucro" />
        <Stat rotulo="Resultado" valor={<Money c={r.resultado} />} tom={r.resultado < 0 ? "bad" : "good"} dica="ganhos − gastos pessoais" />
        <Stat rotulo="Taxa de poupança" valor={r.taxaPoupanca == null ? "—" : `${Math.round(r.taxaPoupanca * 100)}%`} tom={r.taxaPoupanca != null && r.taxaPoupanca < 0 ? "bad" : undefined} dica="do que ganhou, quanto sobrou" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Receitas por fonte">
          <Card className="p-4">
            {Object.keys(r.porFonte).length || r.nfc.faturamento ? (
              <BarrasH itens={[...Object.entries(r.porFonte).map(([id, v]) => ({ rotulo: fonte(id), valor: v, cor: "var(--good)" })), ...(r.nfc.faturamento ? [{ rotulo: "Negócios (lucro líquido)", valor: r.nfc.lucroLiquido, cor: "#5aa9e6", extra: `faturamento ${brl(r.nfc.faturamento)}` }] : [])].sort((a, b) => b.valor - a.valor)} />
            ) : <div className="py-4 text-center text-[14px] text-muted">Nenhuma receita no período.</div>}
          </Card>
        </Secao>
        <Secao titulo="Gastos por categoria">
          <Card className="p-4">
            {Object.keys(r.porCategoria).length ? (
              <BarrasH itens={Object.entries(r.porCategoria).map(([k, v]) => ({ rotulo: k.split(":")[1], valor: v.valor, cor: v.escopo === "negocio" ? "#5aa9e6" : "var(--warn)", extra: v.escopo === "negocio" ? "negócio" : undefined })).sort((a, b) => b.valor - a.valor)} />
            ) : <div className="py-4 text-center text-[14px] text-muted">Nenhum gasto no período.</div>}
            <p className="mt-3 text-[12px] text-muted">Compras no cartão contam na data da compra. Pagamento de fatura, transferências, compras de estoque e investimentos não são gastos.</p>
          </Card>
        </Secao>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Negócios no período">
          <Card className="flex flex-col divide-y divide-line px-4 py-1 text-[14px]">
            {[["Faturamento", r.nfc.faturamento], ["Recebido", r.nfc.recebido], ["Gastos do negócio", -r.nfc.despesasOperacionais], ["Lucro líquido", r.nfc.lucroLiquido]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-2"><span className={k === "Lucro líquido" ? "font-semibold" : "text-muted"}>{k}</span><Money c={v as number} className="font-semibold" /></div>
            ))}
            <div className="flex justify-between py-2"><span className="text-muted">Margem</span><b>{r.nfc.margem == null ? "—" : `${Math.round(r.nfc.margem * 100)}%`}</b></div>
          </Card>
        </Secao>
        <Secao titulo={`Comparado com ${anterior.nome}`}>
          <Card className="flex flex-col divide-y divide-line px-4 py-1">
            {comp("Rendas", r.receitasPessoais, ra.receitasPessoais)}
            {comp("Lucro do negócio", r.nfc.lucroLiquido, ra.nfc.lucroLiquido)}
            {comp("Gastos pessoais", r.gastosPessoais, ra.gastosPessoais, true)}
            {comp("Resultado", r.resultado, ra.resultado)}
          </Card>
        </Secao>
      </div>

      <Secao titulo="Evolução do saldo nas contas (12 meses)">
        <Card className="p-4"><Linha dados={caixa.map((c) => ({ rotulo: nomeMesCurto(c.key), valor: c.saldo }))} /></Card>
      </Secao>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao titulo="Para onde foi o dinheiro guardado">
          <Card className="p-4">
            {Object.keys(r.aportesMetas).length ? <BarrasH itens={Object.entries(r.aportesMetas).map(([id, v]) => ({ rotulo: env(id)?.nome ?? "?", valor: v, cor: env(id)?.cor }))} /> : <div className="text-[14px] text-muted">Nenhuma distribuição no período.</div>}
          </Card>
        </Secao>
        <Secao titulo="Compromissos futuros">
          <Card className="flex flex-col divide-y divide-line px-4 py-1 text-[14px]">
            {futuros.map((f) => <div key={f.key} className="flex justify-between py-2"><span className="capitalize text-muted">{nomeMes(f.key)}</span><Money c={f.valor} className="font-semibold" /></div>)}
            <div className="flex justify-between py-2"><span className="text-muted">Total em aberto (inclui parcelas)</span><Money c={sit.totalAPagar} className="font-semibold" /></div>
          </Card>
        </Secao>
        <Secao titulo="Patrimônio financeiro">
          <Card className="flex flex-col divide-y divide-line px-4 py-1 text-[14px]">
            <div className="flex justify-between py-2"><span className="text-muted">Dinheiro nas contas</span><Money c={sit.patrimonio.caixa} /></div>
            <div className="flex justify-between py-2"><span className="text-muted">Investimentos</span><Money c={sit.patrimonio.investimentos} /></div>
            <div className="flex justify-between py-2"><span className="text-muted">Dívidas e contas a pagar</span><Money c={-sit.patrimonio.dividas} /></div>
            <div className="flex justify-between py-2 font-semibold"><span>Total</span><Money c={sit.patrimonio.total} /></div>
            <div className="py-2 text-[12px] text-muted">Fora da conta: {sit.capitalNegocio.estoque ? `${brl(sit.capitalNegocio.estoque)} em estoque e ` : ""}{brl(sit.totalAReceber)} a receber. Limite do cartão nunca entra.</div>
          </Card>
        </Secao>
      </div>
      <ProjecaoNegocio />
    </div>
  );
}

function ProjecaoNegocio() {
  const { d, sit, hoje } = useApp();
  // Base: lucro líquido das últimas 8 semanas, somando todos os negócios
  const x = indicadores(d, sit, addDias(inicioSemana(hoje), -49), hoje);
  const lucroSemana = Math.round(x.lucroLiquido / 8);
  const [mult, setMult] = useState({ conservador: 70, intermediario: 100, otimista: 130 });
  if (!x.vendas) return (
    <Secao titulo="Projeção dos negócios"><Card className="p-4 text-[14px] text-muted">Registre vendas por algumas semanas para o app projetar o crescimento. Até lá, use a Simulação em Meus negócios.</Card></Secao>
  );
  return (
    <Secao titulo="Projeção dos negócios (próximos 3 meses)">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13.5px] text-muted">Base real das últimas 8 semanas: {x.vendas} venda(s), {brl(x.faturamento)} faturados e {brl(lucroSemana)} de lucro líquido por semana, em média. Ajuste o ritmo de cada cenário:</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(mult) as (keyof typeof mult)[]).map((k) => {
            const lucroMes = Math.round((lucroSemana * mult[k] * 4.33) / 100);
            return (
              <div key={k} className={cn("flex flex-col gap-2 rounded-xl p-3", k === "intermediario" ? "bg-accent-soft" : "bg-surface-2")}>
                <div className="text-[13px] font-semibold capitalize">{k === "intermediario" ? "Intermediário" : k}</div>
                <label className="flex items-center gap-2 text-[13px] text-muted">Ritmo <input type="number" value={mult[k]} onChange={(e) => setMult((m) => ({ ...m, [k]: Math.max(0, Number(e.target.value) || 0) }))} className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-ink" />%</label>
                <div><Money c={lucroMes} className="text-[18px] font-semibold" /><span className="text-[12.5px] text-muted"> lucro por mês</span></div>
                <div className="text-[12.5px] text-muted">3 meses: {brl(lucroMes * 3)}</div>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted">Premissas explícitas: vendas e gastos no mesmo ritmo das últimas 8 semanas; um mês = 4,33 semanas. Não é renda garantida.</p>
      </Card>
    </Secao>
  );
}
