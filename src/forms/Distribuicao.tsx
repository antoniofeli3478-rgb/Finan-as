// Tela de distribuição: o app sugere, você ajusta e só então confirma.

import { useEffect, useMemo, useState } from "react";
import { br } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { proporDistribuicao, validarDistribuicao } from "../core/distribuicao";
import type { ID } from "../core/types";
import { useApp } from "../app/store";
import { db } from "../data/db";
import { distribuir } from "../data/repo";
import { Aviso, Button, Campo, cn, Dinheiro, Folha, Money, Selecao, useUi } from "../ui/ui";

export interface PedidoDistribuicao { valor?: Cents; receitaId?: ID | null; fonteId?: ID | null; estrategiaId?: ID | null; titulo?: string }

export function Distribuicao({ pedido, onFechar }: { pedido: PedidoDistribuicao | null; onFechar: () => void }) {
  const { d, sit, hoje } = useApp();
  const { toast } = useUi();
  const disponivel = Math.max(0, sit.saldos.aDistribuir);
  const valor = Math.min(pedido?.valor ?? disponivel, disponivel);
  const estPadrao = pedido?.estrategiaId ?? d.config.fontes.find((f) => f.id === pedido?.fonteId)?.estrategiaId ?? d.config.estrategias[0]?.id ?? "";
  const [estId, setEstId] = useState(estPadrao);
  const [valores, setValores] = useState<Record<ID, Cents | null>>({});
  const [salvando, setSalvando] = useState(false);
  const est = d.config.estrategias.find((e) => e.id === estId) ?? d.config.estrategias[0];
  const proposta = useMemo(() => (pedido && est ? proporDistribuicao(valor, est, d, sit) : null), [pedido, est, valor]); // eslint-disable-line

  // Nova sugestão quando abre ou troca de estratégia
  useEffect(() => { if (pedido) setEstId(estPadrao); }, [pedido]); // eslint-disable-line
  useEffect(() => {
    if (!proposta) return;
    const v: Record<ID, Cents | null> = {};
    for (const i of proposta.itens) v[i.envelopeId] = i.valor;
    setValores(v);
  }, [proposta]);

  if (!pedido) return null;
  const envs = d.envelopes.filter((e) => !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  const itens = envs.map((e) => ({ envelopeId: e.id, valor: valores[e.id] ?? 0 })).filter((i) => i.valor !== 0);
  const total = itens.reduce((a, i) => a + i.valor, 0);
  const erro = validarDistribuicao(itens, disponivel);
  const sobra = valor - total;
  const jaDistribuido = pedido.receitaId ? d.movimentos.some((m) => m.tipo === "envelope" && m.receitaId === pedido.receitaId) : false;

  const confirmar = async () => {
    setSalvando(true);
    try {
      await distribuir(db(), itens, hoje, { receitaId: pedido.receitaId ?? null, descricao: pedido.titulo ?? "Distribuição" });
      toast(`${brl(total)} distribuídos`);
      onFechar();
    } catch (e) { toast((e as Error).message, true); } finally { setSalvando(false); }
  };

  return (
    <Folha aberta onFechar={onFechar} titulo={pedido.titulo ?? "Distribuir dinheiro"} largura="lg" rodape={
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-[14px]">
          <span className="text-muted">Distribuindo</span>
          <span className={cn("num font-semibold", sobra < 0 && "text-bad")}>{brl(total)} de {brl(valor)}</span>
        </div>
        {sobra > 0 && <div className="text-[12.5px] text-muted">{brl(sobra)} ficam a distribuir para depois.</div>}
        <div className="grid grid-cols-2 gap-2">
          <Button variante="outline" onClick={onFechar}>Agora não</Button>
          <Button onClick={confirmar} disabled={!!erro || total <= 0 || salvando}>Confirmar</Button>
        </div>
      </div>
    }>
      <div className="flex flex-col gap-4">
        {valor <= 0 ? (
          <Aviso tom="info">Não há dinheiro a distribuir agora. Todo o dinheiro das contas já tem um envelope.</Aviso>
        ) : (
          <>
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-[13px] text-muted">Para distribuir</div>
              <div className="font-display text-[32px] font-semibold num tracking-tight">{brl(valor)}</div>
              {pedido.valor != null && pedido.valor > disponivel && <div className="mt-1 text-[12.5px] text-warn">Só {brl(disponivel)} estão sem destino nas contas.</div>}
            </div>
            {jaDistribuido && <Aviso tom="warn">Este recebimento já foi distribuído antes. Confirmar de novo distribui o que ainda está sem destino.</Aviso>}
            <Campo rotulo="Estratégia" dica="As regras de cada estratégia ficam em Configurações.">
              <Selecao value={estId} onChange={setEstId} opcoes={d.config.estrategias.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
            </Campo>
            {proposta?.alertas.map((a) => <Aviso key={a} tom={proposta.deficit > 0 ? "bad" : "warn"}>{a}</Aviso>)}
            {sit.cobertura.pessoal.descoberto > 0 && proposta && proposta.deficit === 0 && (
              <Aviso tom="info">Primeiro vão {brl(sit.cobertura.pessoal.descoberto)} para as contas que vencem até {br(sit.horizonte)}.</Aviso>
            )}
            <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
              {envs.map((e) => {
                const item = proposta?.itens.find((i) => i.envelopeId === e.id);
                const saldo = sit.saldos.envelopes[e.id] ?? 0;
                return (
                  <div key={e.id} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.cor }} /><span className="truncate">{e.nome}</span></div>
                      <div className="truncate text-[12.5px] text-muted">Tem <Money c={saldo} />{item ? ` · ${item.motivo}` : ""}</div>
                    </div>
                    <Dinheiro value={valores[e.id] ?? null} onChange={(v) => setValores((x) => ({ ...x, [e.id]: v }))} aria-label={`Valor para ${e.nome}`} />
                  </div>
                );
              })}
            </div>
            {erro && <Aviso tom="bad">{erro}</Aviso>}
            <button className="self-start text-[13px] font-semibold text-accent" onClick={() => { const v: Record<ID, Cents | null> = {}; proposta?.itens.forEach((i) => (v[i.envelopeId] = i.valor)); setValores(v); }}>Voltar para a sugestão</button>
          </>
        )}
      </div>
    </Folha>
  );
}
