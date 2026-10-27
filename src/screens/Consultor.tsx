import { useState, type ReactNode } from "react";
import { AlertOctagon, CheckCircle2, CircleHelp, Info, TriangleAlert } from "lucide-react";
import type { Cents } from "../core/money";
import { comprometido, gastandoMais, gastoSemana, lucroMes, maiorRisco, podeComprar, podeComprarLote, quantoVenderParaPC, reservarFatura, type Resposta } from "../core/consultor";
import { useApp } from "../app/store";
import { Button, Campo, Card, cn, Dinheiro, Numero, Segmentos, Selecao } from "../ui/ui";

export function Consultor() {
  const { d, sit } = useApp();
  const [valor, setValor] = useState<Cents | null>(10000);
  const [forma, setForma] = useState<"avista" | "cartao">("avista");
  const [parcelas, setParcelas] = useState(1);
  const [produtoId, setProdutoId] = useState(d.produtos[0]?.id ?? "");
  const [qtd, setQtd] = useState(20);
  const [custo, setCusto] = useState<Cents | null>(d.produtos[0]?.custoReferencia ?? null);
  const [aberta, setAberta] = useState<string | null>("comprar");

  const perguntas: { id: string; titulo: string; campos?: ReactNode; resposta: () => Resposta }[] = [
    { id: "comprar", titulo: "Posso comprar isso hoje?", resposta: () => podeComprar(sit, d, valor ?? 0, forma, parcelas), campos: (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Valor"><Dinheiro value={valor} onChange={setValor} /></Campo>
        <Campo grupo rotulo="Como"><Segmentos value={forma} onChange={setForma} opcoes={[{ valor: "avista", rotulo: "Pix/débito" }, { valor: "cartao", rotulo: "Cartão" }]} /></Campo>
        {forma === "cartao" && <Campo rotulo="Parcelas"><Numero value={parcelas} onChange={(n) => setParcelas(Math.max(1, Math.min(24, n)))} min={1} /></Campo>}
      </div>
    ) },
    { id: "semana", titulo: "Quanto posso gastar nesta semana?", resposta: () => gastoSemana(sit) },
    { id: "pc", titulo: "Quanto preciso vender para comprar meu PC?", resposta: () => quantoVenderParaPC(sit, d) },
    { id: "gastando", titulo: "Estou gastando mais do que recebo?", resposta: () => gastandoMais(d, sit) },
    { id: "comprometido", titulo: "Quanto do meu dinheiro está comprometido?", resposta: () => comprometido(sit) },
    { id: "lote", titulo: "Posso comprar um novo lote de placas?", resposta: () => podeComprarLote(sit, d, produtoId, qtd, custo ?? undefined), campos: d.produtos.length ? (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Produto"><Selecao value={produtoId} onChange={(v) => { setProdutoId(v); setCusto(d.produtos.find((p) => p.id === v)?.custoReferencia ?? null); }} opcoes={d.produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} /></Campo>
        <Campo rotulo="Quantidade"><Numero value={qtd} onChange={setQtd} min={1} /></Campo>
        <Campo rotulo="Custo por unidade"><Dinheiro value={custo} onChange={setCusto} /></Campo>
      </div>
    ) : undefined },
    { id: "fatura", titulo: "Quanto preciso reservar para a próxima fatura?", resposta: () => reservarFatura(sit, d) },
    { id: "lucro", titulo: "Quanto lucro eu realmente tive neste mês?", resposta: () => lucroMes(d, sit) },
    { id: "risco", titulo: "Qual é o meu maior risco financeiro agora?", resposta: () => maiorRisco(sit, d) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Consultor financeiro</h1>
        <p className="text-[14px] text-muted">Respostas calculadas com os seus dados, por regras fixas. Nada sai do seu aparelho. Quando falta informação, ele diz o que falta. A decisão é sempre sua.</p>
      </header>
      <div className="flex flex-col gap-2.5">
        {perguntas.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <button onClick={() => setAberta(aberta === p.id ? null : p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
              <span className="font-semibold">{p.titulo}</span>
              <span className="text-muted">{aberta === p.id ? "−" : "+"}</span>
            </button>
            {aberta === p.id && (
              <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3">
                {p.campos}
                <RespostaView r={p.resposta()} />
              </div>
            )}
          </Card>
        ))}
      </div>
      <Button variante="outline" className="self-start" onClick={() => setAberta("risco")}>Ver meu maior risco</Button>
    </div>
  );
}

function RespostaView({ r }: { r: Resposta }) {
  const estilo = {
    sim: ["bg-good-soft text-good", <CheckCircle2 key="i" size={20} />],
    cuidado: ["bg-warn-soft text-warn", <TriangleAlert key="i" size={20} />],
    nao: ["bg-bad-soft text-bad", <AlertOctagon key="i" size={20} />],
    "sem-dados": ["bg-surface-2 text-muted", <CircleHelp key="i" size={20} />],
    info: ["bg-accent-soft text-accent", <Info key="i" size={20} />],
  }[r.veredito] as [string, ReactNode];
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3 font-semibold", estilo[0])}>{estilo[1]}<span className="leading-snug">{r.titulo}</span></div>
      {r.linhas.length > 0 && <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] leading-relaxed text-muted">{r.linhas.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}
