import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { br, nomeMesCurto } from "../core/dates";
import { brl } from "../core/money";
import { acoesAgora, type Acao } from "../core/acoes";
import { serieReceitasDespesas } from "../core/relatorios";
import { useApp } from "../app/store";
import { useAcoes } from "../app/acoes";
import { ir } from "../app/rotas";
import { Barras } from "../ui/graficos";
import { LinhaMov } from "../ui/LinhaMov";
import { Badge, Button, Card, cn, Money, Progresso, Secao, Stat, Vazio } from "../ui/ui";
import { ordenar } from "../core/ledger";

export function Visao({ abrirAssistente }: { abrirAssistente: () => void }) {
  const { d, sit, hoje, modo } = useApp();
  const ac = useAcoes();
  const acoes = useMemo(() => acoesAgora(sit, d, Date.now()), [sit, d]);
  const serie = useMemo(() => serieReceitasDespesas(d, sit, hoje, 6), [d, sit, hoje]);
  // Só o que já aconteceu: contas futuras geradas pelas recorrências aparecem em "Próximos compromissos"
  const recentes = useMemo(() => ordenar(d.movimentos.filter((m) => m.data <= hoje)).reverse().slice(0, 7), [d.movimentos, hoje]);
  const L = sit.livreReal;
  const det = sit.livreDetalhe;
  const passosSetup = Object.values(d.config.setup).filter(Boolean).length;
  const setupIncompleto = modo === "real" && !d.config.setupDispensado && passosSetup < 8;

  const executar = (a: Acao) => {
    if (a.tipo === "distribuir") return ac.distribuir();
    if ((a.tipo === "pagar" || a.tipo === "fatura") && a.alvo) { const c = sit.compromissos.find((x) => x.chave === a.alvo); if (c) return ac.pagarConta(c); }
    if (a.tipo === "reservar") return ac.nova({ tipo: "aporte", envelopeDestino: sit.env.obrigacoes?.id });
    if (a.tipo === "cobrar" && a.alvo) { const r = sit.aReceber.find((x) => x.movId === a.alvo); if (r) return ac.receber(r); }
    if (a.tipo === "repor") return ac.nova({ tipo: "estoque" });
    if (a.tipo === "cobrir") return a.alvo ? ac.nova({ tipo: "aporte", envelopeDestino: a.alvo }) : ac.nova({ tipo: "ajuste" });
    if (a.tipo === "conciliar") return ac.nova({ tipo: "ajuste" });
    if (a.tipo === "backup") return ir("config");
    if (a.tipo === "retirar") return ac.nova({ tipo: "retirada" });
  };

  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted">{br(hoje)}</div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight">Visão geral</h1>
        </div>
        <Button variante="soft" tamanho="sm" onClick={() => ir("consultor")}><Sparkles size={15} />Consultor</Button>
      </header>

      {setupIncompleto && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><div className="font-semibold">Configure o app com a sua realidade</div><div className="text-[13.5px] text-muted">{passosSetup} de 8 passos feitos. Dá para parar e continuar depois.</div></div>
          <Button tamanho="sm" onClick={abrirAssistente}>Continuar configuração</Button>
        </Card>
      )}

      {/* Livre de verdade */}
      <Card className="overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[14px] font-medium text-muted">Livre para gastar, de verdade</div>
            <div className={cn("mt-1 font-display text-[44px] font-semibold leading-none tracking-tight num sm:text-[52px]", L < 0 && "text-bad")}>{brl(L)}</div>
            <div className="mt-2 max-w-md text-[13.5px] leading-snug text-muted">
              {brl(det.envelopeLivre)} no envelope livre
              {det.contasDescobertas > 0 && <>, menos <b className="text-warn">{brl(det.contasDescobertas)}</b> de contas até {br(sit.horizonte)} sem dinheiro separado</>}
              {det.envelopesNegativos < 0 && <>, menos <b className="text-bad">{brl(-det.envelopesNegativos)}</b> gastos de envelopes que ficaram negativos</>}
              {det.faltaDistribuir < 0 && <>, menos <b className="text-bad">{brl(-det.faltaDistribuir)}</b> que os envelopes somam a mais que as contas</>}.
            </div>
          </div>
          {sit.saldos.aDistribuir > 0 && (
            <button onClick={() => ac.distribuir()} className="rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-left">
              <div className="text-[12.5px] font-semibold text-accent">A distribuir</div>
              <div className="num text-[20px] font-semibold">{brl(sit.saldos.aDistribuir)}</div>
              <div className="flex items-center gap-1 text-[12.5px] font-semibold text-accent">Distribuir agora <ArrowRight size={14} /></div>
            </button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat rotulo="Saldo nas contas" valor={<Money c={sit.saldos.caixa} />} dica={`${d.contas.filter((c) => !c.arquivada).length} conta(s)`} onClick={() => ir("contas", "bancos")} />
          <Stat rotulo="Reservado" valor={<Money c={sit.reservado} />} dica="contas, negócio e metas" onClick={() => ir("envelopes")} />
          <Stat rotulo="Contas a pagar" valor={<Money c={sit.totalAPagar} />} dica={sit.compromissos.some((c) => c.atrasado) ? "há contas vencidas" : `${sit.compromissos.length} em aberto`} tom={sit.compromissos.some((c) => c.atrasado) ? "bad" : undefined} onClick={() => ir("contas")} />
          <Stat rotulo="A receber" valor={<Money c={sit.totalAReceber} />} dica="fora do dinheiro disponível" onClick={() => ir("contas")} />
          <Stat rotulo="Fatura atual" valor={<Money c={sit.faturaAtual} />} dica={d.cartoes.length ? "ainda aberta" : "nenhum cartão"} onClick={() => ir("contas", "cartoes")} />
          <Stat rotulo="Capital do negócio" valor={<Money c={sit.capitalNegocio.total} />} dica={`${brl(sit.capitalNegocio.caixa)} caixa + ${brl(sit.capitalNegocio.estoque)} estoque`} onClick={() => ir("negocios")} />
          <Stat rotulo="Patrimônio financeiro" valor={<Money c={sit.patrimonio.total} />} dica="contas + investimentos − dívidas" onClick={() => ir("relatorios")} />
          <Stat rotulo="Investido" valor={<Money c={sit.investimentos.valorAtual} />} dica="valor atual informado" onClick={() => ir("metas")} />
        </div>
      </Card>

      {/* Ações */}
      <Secao titulo="O que preciso fazer agora?">
        {acoes.length ? (
          <Card className="divide-y divide-line">
            {acoes.slice(0, 7).map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", a.urgencia === 3 ? "bg-bad-soft text-bad" : a.urgencia === 2 ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted")}><AlertTriangle size={16} /></span>
                <div className="min-w-0 flex-1"><div className="text-[14.5px] font-semibold">{a.titulo}</div><div className="text-[13px] leading-snug text-muted">{a.detalhe}</div></div>
                <Button variante="outline" tamanho="sm" onClick={() => executar(a)}>{rotuloAcao(a)}</Button>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="flex items-center gap-3 p-4"><CheckCircle2 className="text-good" /><div><div className="font-semibold">Tudo em dia</div><div className="text-[13.5px] text-muted">Nenhuma conta vencida, nada a distribuir e nenhum envelope negativo.</div></div></Card>
        )}
      </Secao>

      {/* Metas */}
      <Secao titulo="Metas" acao={<button className="text-[13px] font-semibold text-accent" onClick={() => ir("metas")}>Ver todas</button>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sit.metas.slice(0, 4).map((m) => (
            <Card key={m.envelope.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: m.envelope.cor }} />{m.envelope.nome}</div>
              <div className="num text-[22px] font-semibold tracking-tight">{brl(m.saldo)}</div>
              <Progresso pct={m.pct} cor={m.envelope.cor} />
              <div className="text-[12.5px] text-muted">{m.meta ? (m.falta > 0 ? `Faltam ${brl(m.falta)} de ${brl(m.meta)} · ${Math.floor(m.pct)}%` : `Meta de ${brl(m.meta)} atingida`) : m.envelope.tipo === "reserva" ? "Cadastre contas essenciais para calcular a meta" : "Sem meta definida"}</div>
            </Card>
          ))}
          {sit.env.negocio && (
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: sit.env.negocio.cor }} />Capital de giro</div>
              <div className="num text-[22px] font-semibold tracking-tight">{brl(sit.capitalNegocio.caixa)}</div>
              <Progresso pct={sit.env.negocio.minimo ? (sit.capitalNegocio.caixa / sit.env.negocio.minimo) * 100 : 0} cor={sit.env.negocio.cor} />
              <div className="text-[12.5px] text-muted">{sit.env.negocio.minimo ? (sit.capitalNegocio.caixa >= sit.env.negocio.minimo ? `Acima do mínimo de ${brl(sit.env.negocio.minimo)}` : `Faltam ${brl(sit.env.negocio.minimo - sit.capitalNegocio.caixa)} para o mínimo`) : "Defina o mínimo em Meus negócios"}</div>
            </Card>
          )}
        </div>
      </Secao>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-5">
        <Secao titulo="Ganhos e gastos" className="lg:col-span-3" acao={<button className="text-[13px] font-semibold text-accent" onClick={() => ir("relatorios")}>Relatórios</button>}>
          <Card className="p-4">
            <Barras dados={serie.map((s) => ({ rotulo: nomeMesCurto(s.key), valores: [s.ganhos, s.gastos] }))} series={[{ nome: "Ganhos (rendas + lucro do negócio)", cor: "var(--good)" }, { nome: "Gastos", cor: "var(--warn)" }]} />
          </Card>
        </Secao>
        <Secao titulo="Próximos compromissos" className="lg:col-span-2" acao={<button className="text-[13px] font-semibold text-accent" onClick={() => ir("contas")}>Agenda</button>}>
          <Card className="divide-y divide-line">
            {sit.compromissos.slice(0, 5).map((c) => (
              <button key={c.chave} onClick={() => ac.pagarConta(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{c.descricao}</span><span className={cn("text-[12.5px]", c.atrasado ? "font-semibold text-bad" : "text-muted")}>{c.atrasado ? "Vencida em " : "Vence "}{br(c.vencimento)}{c.escopo === "negocio" ? " · negócio" : ""}</span></span>
                <Money c={c.valor} className="text-[14px] font-semibold" />
              </button>
            ))}
            {!sit.compromissos.length && <div className="px-4 py-6 text-center text-[14px] text-muted">Nenhuma conta em aberto.</div>}
          </Card>
        </Secao>
      </div>

      <Secao titulo="Últimas movimentações" acao={<button className="text-[13px] font-semibold text-accent" onClick={() => ir("movimentos")}>Ver todas</button>}>
        {recentes.length ? (
          <Card className="divide-y divide-line overflow-hidden">{recentes.map((m) => <LinhaMov key={m.id} m={m} d={d} onClick={() => ac.nova({ editId: m.id })} />)}</Card>
        ) : (
          <Vazio titulo="Nada registrado ainda" acao={<Button onClick={() => ac.nova({ tipo: "recebimento" })}>Registrar um recebimento</Button>}>Comece pelo dinheiro que entrou. O app sugere para onde vai cada parte.</Vazio>
        )}
      </Secao>
      {d.cartoes.length > 0 && sit.faturaAtual > sit.saldos.caixa && <Badge tom="bad" className="self-start">A fatura atual é maior que o saldo das suas contas</Badge>}
    </div>
  );
}

function rotuloAcao(a: Acao) {
  return { pagar: "Pagar", fatura: "Pagar", distribuir: "Distribuir", reservar: "Reservar", cobrar: "Recebi", repor: "Comprar", cobrir: "Ajustar", conciliar: "Conferir", backup: "Fazer backup", configurar: "Configurar", retirar: "Retirar" }[a.tipo];
}
