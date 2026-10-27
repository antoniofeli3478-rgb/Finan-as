// Registro rápido: um formulário que muda de campos conforme o tipo de movimentação.
// Serve para criar e para editar. Toda gravação passa pelo repo (validação + recálculo).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, Hourglass, PiggyBank, Scale, TrendingUp, Wallet } from "lucide-react";
import { br } from "../core/dates";
import { brl, type Cents } from "../core/money";
import { datasDaFatura, faturaDaCompra } from "../core/cartao";
import { possivelDuplicata } from "../core/validacao";
import { disponivelParaRetirada } from "../core/negocio";
import { calcularSaldos, totaisVenda } from "../core/ledger";
import type { Ajuste, CompraCartao, CompraEstoque, Despesa, Escopo, ID, Movimento, MovEnvelope, MovInvestimento, PagamentoFatura, Receita, Recebimento, Transferencia, Venda } from "../core/types";
import { useApp } from "../app/store";
import { ehDoNfc, URL_APP_NFC } from "../integracoes/nfc";
import { db } from "../data/db";
import { apagarMovimento, conciliar, ErroValidacao, movimentarInvestimento, novoId, salvarMovimento } from "../data/repo";
import { Aviso, Button, Campo, cn, Data, Dinheiro, Folha, Interruptor, Money, Numero, Segmentos, Selecao, Texto, useUi } from "../ui/ui";
import type { PedidoDistribuicao } from "./Distribuicao";

export type TipoForm = "recebimento" | "despesa" | "transferencia" | "cartao" | "pendente" | "estoque" | "venda" | "aporte" | "investimento" | "ajuste" | "retirada" | "fatura";

export const TIPOS: { id: TipoForm; nome: string; desc: string; icone: ReactNode }[] = [
  { id: "recebimento", nome: "Recebimento", desc: "Dinheiro que entrou", icone: <ArrowDownLeft size={20} /> },
  { id: "despesa", nome: "Despesa", desc: "Gasto ou conta a pagar", icone: <ArrowUpRight size={20} /> },
  { id: "cartao", nome: "Compra no cartão", desc: "Crédito, à vista ou parcelado", icone: <CreditCard size={20} /> },
  { id: "pendente", nome: "A receber", desc: "Trabalho que vão te pagar", icone: <Hourglass size={20} /> },
  { id: "aporte", nome: "Aporte em objetivo", desc: "Mover entre envelopes", icone: <PiggyBank size={20} /> },
  { id: "transferencia", nome: "Transferência", desc: "Entre suas contas", icone: <ArrowLeftRight size={20} /> },
  { id: "investimento", nome: "Investimento", desc: "Aplicar ou resgatar", icone: <TrendingUp size={20} /> },
  { id: "retirada", nome: "Retirada do negócio", desc: "Pagar você mesmo", icone: <Wallet size={20} /> },
  { id: "ajuste", nome: "Ajuste de saldo", desc: "Bater com o banco", icone: <Scale size={20} /> },
];

const tipoDoMov = (m: Movimento): TipoForm => ({
  receita: (m as Receita).status === "pendente" ? "pendente" : "recebimento", despesa: "despesa", transferencia: "transferencia",
  cartao_compra: "cartao", cartao_pagamento: "fatura", estoque_compra: "estoque", venda: "venda", envelope: (m as MovEnvelope).origem === "retirada" ? "retirada" : "aporte",
  investimento: "investimento", ajuste: "ajuste",
} as Record<Movimento["tipo"], TipoForm>)[m.tipo];

export interface PedidoNova { tipo?: TipoForm; editId?: ID; produtoId?: ID; envelopeDestino?: ID; valor?: Cents }

export function NovaMovimentacao({ pedido, onFechar, onDistribuir }: { pedido: PedidoNova | null; onFechar: () => void; onDistribuir: (p: PedidoDistribuicao) => void }) {
  const { d } = useApp();
  if (pedido?.editId && ehDoNfc(pedido.editId)) return <DoNfc onFechar={onFechar} />;
  if (pedido && (pedido.tipo === "venda" || pedido.tipo === "estoque") && !pedido.editId) return <DoNfc onFechar={onFechar} novo />;
  return <Seletor d={d} pedido={pedido} onFechar={onFechar} onDistribuir={onDistribuir} />;
}

/** Vendas e estoque das placas são do app Plaquinhas NFC: aqui só aparecem. */
function DoNfc({ onFechar, novo }: { onFechar: () => void; novo?: boolean }) {
  return (
    <Folha aberta onFechar={onFechar} titulo={novo ? "Registre no app das placas" : "Registro do Plaquinhas NFC"} rodape={<a href={URL_APP_NFC} className="flex h-11 w-full items-center justify-center rounded-xl bg-accent font-semibold text-accent-ink">Abrir Plaquinhas NFC</a>}>
      <p className="pb-2 text-[15px] leading-relaxed text-muted">{novo ? "Vendas e entradas de estoque das placas são registradas no app Plaquinhas NFC. Elas aparecem aqui no Finanças sozinhas, com o lucro e o caixa do negócio calculados." : "Este registro vem do app Plaquinhas NFC. Para mudar ou apagar, faça lá: o Finanças atualiza sozinho quando você voltar."}</p>
    </Folha>
  );
}

function Seletor({ d, pedido, onFechar, onDistribuir }: { d: ReturnType<typeof useApp>["d"]; pedido: PedidoNova | null; onFechar: () => void; onDistribuir: (p: PedidoDistribuicao) => void }) {
  const [tipo, setTipo] = useState<TipoForm | null>(null);
  const editando = pedido?.editId ? d.movimentos.find((m) => m.id === pedido.editId) ?? null : null;
  useEffect(() => { setTipo(editando ? tipoDoMov(editando) : pedido?.tipo ?? null); }, [pedido]); // eslint-disable-line
  if (!pedido) return null;
  const info = TIPOS.find((t) => t.id === tipo);
  return (
    <Folha aberta onFechar={onFechar} titulo={editando ? "Editar movimentação" : info ? info.nome : "Adicionar movimentação"} largura="lg">
      {!tipo ? (
        <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)} className="flex min-h-[88px] flex-col items-start gap-1.5 rounded-2xl border border-line bg-surface-2 p-3 text-left transition hover:border-accent">
              <span className="text-accent">{t.icone}</span>
              <span className="text-[14.5px] font-semibold leading-tight">{t.nome}</span>
              <span className="text-[12px] leading-tight text-muted">{t.desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <Formulario key={tipo + (editando?.id ?? "")} tipo={tipo} mov={editando} pedido={pedido} onVoltar={editando ? undefined : () => setTipo(null)} onFechar={onFechar} onDistribuir={onDistribuir} />
      )}
    </Folha>
  );
}

function Formulario({ tipo, mov, pedido, onVoltar, onFechar, onDistribuir }: { tipo: TipoForm; mov: Movimento | null; pedido: PedidoNova; onVoltar?: () => void; onFechar: () => void; onDistribuir: (p: PedidoDistribuicao) => void }) {
  const { d, sit, hoje } = useApp();
  const { toast, confirmar } = useUi();
  const m = mov as (Movimento & Record<string, unknown>) | null;
  const contas = d.contas.filter((c) => !c.arquivada || c.id === (m?.contaId as string));
  const envs = d.envelopes.filter((e) => !e.arquivado);
  const contaPadrao = contas[0]?.id ?? "";
  const E = sit.env;

  // Campos comuns
  const [valor, setValor] = useState<Cents | null>((m?.valor as number) ?? pedido.valor ?? null);
  const [data, setData] = useState<string>((m?.data as string) ?? hoje);
  const [descricao, setDescricao] = useState<string>((m?.descricao as string) ?? "");
  const [contaId, setContaId] = useState<string>((m?.contaId as string) ?? contaPadrao);
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Recebimento / a receber
  const [fonteId, setFonteId] = useState<string>((m?.fonteId as string) ?? d.config.fontes[0]?.id ?? "");
  const [previstaPara, setPrevista] = useState<string>((m?.previstaPara as string) ?? hoje);
  const [distribuirAgora, setDistribuirAgora] = useState(true);
  // Despesa
  const [escopo, setEscopo] = useState<Escopo>((m?.escopo as Escopo) ?? "pessoal");
  const [pagaAgora, setPagaAgora] = useState<boolean>(m ? m.status === "paga" : true);
  const [categoria, setCategoria] = useState<string>((m?.categoria as string) ?? "");
  const [vencimento, setVencimento] = useState<string>((m?.vencimento as string) ?? hoje);
  const [prioridade, setPrioridade] = useState<"1" | "2" | "3">(String((m?.prioridade as number) ?? 2) as "1" | "2" | "3");
  const envPadrao = (esc: Escopo, paga: boolean) => (esc === "negocio" ? E.negocio?.id : paga ? E.livre?.id : E.obrigacoes?.id) ?? envs[0]?.id ?? "";
  const [envelopeId, setEnvelopeId] = useState<string>((m?.envelopeId as string) ?? envPadrao("pessoal", true));
  const [envTocado, setEnvTocado] = useState(!!m);
  useEffect(() => { if (!envTocado && (tipo === "despesa" || tipo === "cartao")) setEnvelopeId(envPadrao(escopo, pagaAgora)); }, [escopo, pagaAgora]); // eslint-disable-line
  useEffect(() => { const cats = d.config.categorias[escopo]; if (!cats.includes(categoria)) setCategoria(cats[0] ?? "Outros"); }, [escopo]); // eslint-disable-line
  // Transferência
  const [paraContaId, setParaContaId] = useState<string>((m?.paraContaId as string) ?? contas[1]?.id ?? contaPadrao);
  const [deContaId, setDeContaId] = useState<string>((m?.deContaId as string) ?? contaPadrao);
  // Cartão
  const [cartaoId, setCartaoId] = useState<string>((m?.cartaoId as string) ?? d.cartoes.find((c) => !c.arquivado)?.id ?? "");
  const [parcelas, setParcelas] = useState<number>((m?.parcelas as number) ?? 1);
  // Estoque / venda
  const produtos = d.produtos.filter((p) => p.ativo || p.id === m?.produtoId);
  const [produtoId, setProdutoId] = useState<string>((m?.produtoId as string) ?? pedido.produtoId ?? produtos[0]?.id ?? "");
  const produto = d.produtos.find((p) => p.id === produtoId);
  const [qtd, setQtd] = useState<number>((m?.qtd as number) ?? 1);
  const [statusEstoque, setStatusEstoque] = useState<CompraEstoque["status"]>((m?.status as CompraEstoque["status"]) ?? "paga");
  const [porUnidade, setPorUnidade] = useState(false);
  const [fornecedor, setFornecedor] = useState<string>((m?.fornecedor as string) ?? produto?.fornecedor ?? "");
  const [precoUnit, setPrecoUnit] = useState<Cents | null>((m?.precoUnit as number) ?? produto?.precoVenda ?? null);
  const [desconto, setDesconto] = useState<Cents | null>((m?.desconto as number) ?? 0);
  const [forma, setForma] = useState<string>((m?.forma as string) ?? "Pix");
  const [cliente, setCliente] = useState<string>((m?.cliente as string) ?? "");
  const vendaM = m?.tipo === "venda" ? (m as unknown as Venda) : null;
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>(vendaM?.recebimentos ?? []);
  const [situacaoVenda, setSituacaoVenda] = useState<"recebida" | "pendente" | "parcial">(vendaM ? "pendente" : "recebida");
  const [valorRecebidoAgora, setValorRecebidoAgora] = useState<Cents | null>(null);
  const [despesasDiretas, setDespesasDiretas] = useState<Cents | null>(vendaM?.despesasDiretas ?? 0);
  const [cancelada, setCancelada] = useState<boolean>(vendaM?.cancelada ?? false);
  useEffect(() => { if (!m && produto) { setPrecoUnit(produto.precoVenda); setFornecedor(produto.fornecedor ?? ""); } }, [produtoId]); // eslint-disable-line
  // Aporte / envelope
  const movEnv = m?.tipo === "envelope" ? (m as unknown as MovEnvelope) : null;
  const [deEnv, setDeEnv] = useState<string>(() => movEnv && movEnv.itens.length === 2 ? movEnv.itens.find((i) => i.valor < 0)?.envelopeId ?? "livre-dist" : movEnv?.itens.length === 1 ? "livre-dist" : E.livre?.id ?? "livre-dist");
  const [paraEnv, setParaEnv] = useState<string>(() => movEnv?.itens.find((i) => i.valor > 0)?.envelopeId ?? pedido.envelopeDestino ?? E.pc?.id ?? envs[0]?.id ?? "");
  const [itensEnv, setItensEnv] = useState(movEnv?.itens ?? []);
  const envAvancado = !!movEnv && !(movEnv.itens.length <= 2 && movEnv.origem !== "retirada");
  useEffect(() => { if (movEnv && !envAvancado) setValor(Math.max(...movEnv.itens.map((i) => Math.abs(i.valor)))); }, []); // eslint-disable-line
  // Investimento
  const [investimentoId, setInvestimentoId] = useState<string>((m?.investimentoId as string) ?? d.investimentos.find((i) => !i.arquivado)?.id ?? "novo");
  const [novoInvNome, setNovoInvNome] = useState("");
  const [novoInvInst, setNovoInvInst] = useState("");
  const [direcao, setDirecao] = useState<"aporte" | "resgate">((m?.direcao as "aporte" | "resgate") ?? "aporte");
  const [invEnv, setInvEnv] = useState<string>(((m?.envelopeId as string | null) ?? (m ? "nenhum" : E.investimentos?.id)) ?? "nenhum");
  // Ajuste
  const [saldoBanco, setSaldoBanco] = useState<Cents | null>(null);

  const saldos = useMemo(() => calcularSaldos(d), [d]);
  const saldoEnv = (id?: string) => (id ? saldos.envelopes[id] ?? 0 : 0);
  const nomeEnv = (id?: string) => d.envelopes.find((e) => e.id === id)?.nome ?? "";
  const opContas = contas.map((c) => ({ valor: c.id, rotulo: `${c.nome} · ${brl(saldos.contas[c.id] ?? 0)}` }));
  const opEnvs = envs.map((e) => ({ valor: e.id, rotulo: `${e.nome} · ${brl(saldoEnv(e.id))}` }));
  const cartao = d.cartoes.find((c) => c.id === cartaoId);
  const base = { id: m?.id ?? novoId(), data, descricao: descricao.trim(), criadoEm: (m?.criadoEm as number) ?? Date.now(), atualizadoEm: Date.now(), nota: (m?.nota as string) ?? undefined };

  // Venda: totais e lucro estimado
  const brutoVenda = qtd * (precoUnit ?? 0) - (desconto ?? 0);
  const custoEst = produto ? (sit.estoque.porProduto[produto.id]?.custoMedio || produto.custoReferencia) * qtd + produto.custoAdicional * qtd : 0;
  const estoqueProd = produto ? sit.estoque.porProduto[produto.id]?.qtd ?? 0 : 0;

  const montar = (): Movimento | null => {
    const v = valor ?? 0;
    switch (tipo) {
      case "recebimento": case "pendente":
        return { ...base, tipo: "receita", valor: v, fonteId, contaId, status: tipo === "pendente" ? "pendente" : "recebida", previstaPara: tipo === "pendente" ? previstaPara : null, descricao: base.descricao || (d.config.fontes.find((f) => f.id === fonteId)?.nome ?? "Recebimento") } as Receita;
      case "despesa":
        return { ...(m ?? {}), ...base, tipo: "despesa", valor: v, categoria, escopo, envelopeId, status: pagaAgora ? "paga" : "pendente", contaId: pagaAgora ? contaId : contaId || null, vencimento: pagaAgora ? null : vencimento, pagaEm: pagaAgora ? data : null, prioridade: Number(prioridade) as 1 | 2 | 3, descricao: base.descricao || categoria } as Despesa;
      case "transferencia":
        return { ...base, tipo: "transferencia", valor: v, deContaId, paraContaId, descricao: base.descricao || "Transferência" } as Transferencia;
      case "cartao":
        return { ...base, tipo: "cartao_compra", valor: v, cartaoId, parcelas, categoria, escopo, descricao: base.descricao || categoria } as CompraCartao;
      case "fatura":
        return { ...(m as unknown as PagamentoFatura), ...base, valor: v, contaId, envelopeId } as PagamentoFatura;
      case "estoque": {
        const total = porUnidade ? v * qtd : v;
        return { ...base, tipo: "estoque_compra", produtoId, qtd, valor: total, status: statusEstoque, contaId: statusEstoque === "paga" ? contaId : statusEstoque === "pendente" ? contaId : null, envelopeId: E.negocio?.id ?? envelopeId, vencimento: statusEstoque === "pendente" ? vencimento : null, pagaEm: statusEstoque === "paga" ? data : null, fornecedor, descricao: base.descricao || `${qtd} × ${produto?.nome ?? "produto"}` } as CompraEstoque;
      }
      case "venda": {
        let rec = recebimentos;
        if (!m) {
          if (situacaoVenda === "recebida") rec = [{ id: novoId(), valor: brutoVenda, data, contaId }];
          else if (situacaoVenda === "parcial" && (valorRecebidoAgora ?? 0) > 0) rec = [{ id: novoId(), valor: valorRecebidoAgora ?? 0, data, contaId }];
          else rec = [];
        }
        return { ...base, tipo: "venda", produtoId, qtd, precoUnit: precoUnit ?? 0, desconto: desconto ?? 0, forma, cliente: cliente.trim(), cancelada, recebimentos: rec, previstaPara: previstaPara || null, despesasDiretas: despesasDiretas ?? 0, contaDespesasId: (despesasDiretas ?? 0) > 0 ? contaId : null, custoAdicionalUnit: vendaM?.custoAdicionalUnit ?? produto?.custoAdicional ?? 0, envelopeId: E.negocio?.id ?? "", descricao: base.descricao || `Venda ${produto?.nome ?? ""}`.trim() } as Venda;
      }
      case "aporte": {
        if (envAvancado) return { ...(movEnv as MovEnvelope), ...base, itens: itensEnv } as MovEnvelope;
        const itens = deEnv === "livre-dist" ? [{ envelopeId: paraEnv, valor: v }] : [{ envelopeId: deEnv, valor: -v }, { envelopeId: paraEnv, valor: v }];
        return { ...base, tipo: "envelope", origem: deEnv === "livre-dist" ? "distribuicao" : "aporte", itens, receitaId: movEnv?.receitaId ?? null, descricao: base.descricao || `Para ${nomeEnv(paraEnv)}` } as MovEnvelope;
      }
      case "retirada":
        return { ...base, tipo: "envelope", origem: "retirada", itens: [{ envelopeId: E.negocio?.id ?? "", valor: -v }], receitaId: null, descricao: base.descricao || "Retirada do negócio" } as MovEnvelope;
      case "investimento":
        return { ...base, tipo: "investimento", investimentoId, direcao, valor: v, contaId, envelopeId: invEnv === "nenhum" ? null : invEnv, descricao: base.descricao || (direcao === "aporte" ? "Aporte" : "Resgate") } as MovInvestimento;
      case "ajuste":
        return { ...base, tipo: "ajuste", contaId, valor: v, descricao: base.descricao || "Ajuste de saldo" } as Ajuste;
    }
    return null;
  };

  const salvar = async () => {
    setErros([]);
    setSalvando(true);
    try {
      if (tipo === "ajuste" && !m) {
        if (saldoBanco == null) { setErros(["Coloque o saldo que aparece no banco."]); return; }
        const dif = await conciliar(db(), contaId, saldoBanco, data);
        toast(dif === 0 ? "Saldo conferido: está tudo certo" : `Ajuste de ${brl(dif)} registrado`);
        onFechar(); return;
      }
      if (tipo === "investimento" && investimentoId === "novo") {
        if (!novoInvNome.trim()) { setErros(["Dê um nome ao investimento."]); return; }
      }
      const novo = montar();
      if (!novo) return;
      if (novo.tipo === "receita" && !m) {
        const dup = possivelDuplicata(novo, d);
        if (dup && !(await confirmar({ titulo: "Recebimento parecido já registrado", texto: <>Já existe <b>{dup.descricao}</b> de {brl(dup.valor)} em {br(dup.data)}, da mesma fonte. Registrar outro mesmo assim?</>, botao: "Registrar mesmo assim" }))) return;
      }
      if (novo.tipo === "investimento") {
        if (investimentoId === "novo") {
          const id = novoId();
          await db().investimentos.put({ id, nome: novoInvNome.trim(), instituicao: novoInvInst.trim(), valorAtual: 0, atualizadoEm: null, arquivado: false });
          (novo as MovInvestimento).investimentoId = id;
        }
        await movimentarInvestimento(db(), novo as MovInvestimento);
      } else {
        await salvarMovimento(db(), novo);
      }
      toast(m ? "Alterações salvas" : "Registrado");
      onFechar();
      if (!m && novo.tipo === "receita" && novo.status === "recebida" && distribuirAgora) onDistribuir({ valor: novo.valor, receitaId: novo.id, fonteId: novo.fonteId, titulo: `Distribuir ${brl(novo.valor)}` });
      if (!m && tipo === "retirada" && distribuirAgora) onDistribuir({ valor: novo.tipo === "envelope" ? -novo.itens[0].valor : 0, fonteId: "nfc", titulo: "Distribuir a retirada" });
    } catch (e) {
      if (e instanceof ErroValidacao) setErros(e.problemas); else setErros([(e as Error).message]);
    } finally { setSalvando(false); }
  };

  const apagar = async () => {
    if (!m) return;
    const extra = m.tipo === "receita" ? " A distribuição feita com este dinheiro também será desfeita." : m.tipo === "venda" ? " O estoque e o caixa do negócio serão recalculados." : "";
    if (!(await confirmar({ titulo: "Apagar movimentação?", texto: `"${m.descricao}" será apagada e todos os saldos recalculados.${extra}`, botao: "Apagar", perigo: true }))) return;
    if (m.tipo === "investimento") {
      const inv = d.investimentos.find((i) => i.id === m.investimentoId);
      if (inv) await db().investimentos.update(inv.id, { valorAtual: inv.valorAtual - (m.direcao === "aporte" ? m.valor : -m.valor) });
    }
    await apagarMovimento(db(), m.id);
    toast("Apagada");
    onFechar();
  };

  // ── Campos por tipo ──
  const campoValor = (rotulo = "Valor", dica?: ReactNode) => <Campo rotulo={rotulo} dica={dica}><Dinheiro value={valor} onChange={setValor} grande /></Campo>;
  const campoData = (rotulo = "Data") => <Campo rotulo={rotulo}><Data value={data} onChange={setData} /></Campo>;
  const campoDesc = (ph: string) => <Campo rotulo="Descrição"><Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={ph} maxLength={120} /></Campo>;
  const campoConta = (rotulo = "Conta") => <Campo rotulo={rotulo}><Selecao value={contaId} onChange={setContaId} opcoes={opContas} /></Campo>;
  const campoCategoria = () => <Campo rotulo="Categoria"><Selecao value={categoria} onChange={setCategoria} opcoes={d.config.categorias[escopo].map((c) => ({ valor: c, rotulo: c }))} /></Campo>;
  const campoEscopo = () => <Segmentos value={escopo} onChange={setEscopo} opcoes={[{ valor: "pessoal", rotulo: "Pessoal" }, { valor: "negocio", rotulo: "Negócio" }]} />;
  const linha = (...c: ReactNode[]) => <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{c}</div>;

  let corpo: ReactNode = null;
  const avisos: ReactNode[] = [];
  switch (tipo) {
    case "recebimento": case "pendente":
      corpo = <>
        {campoValor()}
        <Campo rotulo="De onde veio"><Selecao value={fonteId} onChange={setFonteId} opcoes={d.config.fontes.map((f) => ({ valor: f.id, rotulo: f.nome }))} /></Campo>
        {campoDesc(tipo === "pendente" ? "Ex.: Edição de vídeo para cliente" : "Ex.: Recreação na festa do sábado")}
        {linha(campoConta(tipo === "pendente" ? "Vai entrar em" : "Entrou em"), tipo === "pendente" ? <Campo rotulo="Previsto para" key="p"><Data value={previstaPara} onChange={setPrevista} /></Campo> : <div key="d">{campoData()}</div>)}
        {tipo === "pendente" && campoData("Data do trabalho")}
        {tipo === "recebimento" && !m && <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3"><span className="text-[14px]"><b>Distribuir agora</b><br /><span className="text-muted">Ver a sugestão de para onde vai cada parte</span></span><Interruptor ligado={distribuirAgora} onChange={setDistribuirAgora} rotulo="Distribuir agora" /></label>}
        {tipo === "pendente" && <Aviso tom="info">Dinheiro a receber não entra no seu saldo nem no dinheiro livre até você marcar como recebido.</Aviso>}
      </>;
      break;
    case "despesa": {
      corpo = <>
        {campoEscopo()}
        {campoValor()}
        {campoDesc(escopo === "negocio" ? "Ex.: Uber para visitar clientes" : "Ex.: Lanche, cinema, roupa")}
        {linha(<div key="c">{campoCategoria()}</div>, <Campo grupo key="s" rotulo="Situação"><Segmentos value={pagaAgora ? "paga" : "pendente"} onChange={(v) => setPagaAgora(v === "paga")} opcoes={[{ valor: "paga", rotulo: "Já paguei" }, { valor: "pendente", rotulo: "A pagar" }]} /></Campo>)}
        {pagaAgora ? linha(<div key="c">{campoConta("Saiu de")}</div>, <div key="d">{campoData()}</div>) : linha(<Campo key="v" rotulo="Vencimento"><Data value={vencimento} onChange={setVencimento} /></Campo>, <Campo key="p" rotulo="Prioridade"><Selecao value={prioridade} onChange={setPrioridade} opcoes={[{ valor: "1", rotulo: "Essencial" }, { valor: "2", rotulo: "Importante" }, { valor: "3", rotulo: "Pode esperar" }]} /></Campo>)}
        <Campo rotulo="Sai do envelope" dica={pagaAgora ? undefined : "Quando você pagar, o dinheiro sai daqui."}><Selecao value={envelopeId} onChange={(v) => { setEnvelopeId(v); setEnvTocado(true); }} opcoes={opEnvs} /></Campo>
      </>;
      const s = saldoEnv(envelopeId);
      if (pagaAgora && valor && valor > s) avisos.push(<Aviso key="e" tom="warn">{nomeEnv(envelopeId)} tem {brl(s)}. Este gasto deixa o envelope negativo em {brl(valor - s)}: você estaria usando dinheiro de outra finalidade.</Aviso>);
      if (pagaAgora && escopo === "pessoal" && envelopeId === E.negocio?.id) avisos.push(<Aviso key="n" tom="bad">Gasto pessoal saindo do envelope do negócio. Se for isso, prefira fazer uma retirada antes, para não misturar.</Aviso>);
      break;
    }
    case "transferencia":
      corpo = <>
        {campoValor()}
        {linha(<Campo key="de" rotulo="De"><Selecao value={deContaId} onChange={setDeContaId} opcoes={opContas} /></Campo>, <Campo key="pa" rotulo="Para"><Selecao value={paraContaId} onChange={setParaContaId} opcoes={opContas} /></Campo>)}
        {campoData()}
        {campoDesc("Ex.: Saque para ter dinheiro em mãos")}
        <Aviso tom="info">Transferência entre suas contas não é receita nem despesa: só muda onde o dinheiro está.</Aviso>
      </>;
      break;
    case "cartao": {
      if (!d.cartoes.length) { corpo = <Aviso tom="info">Cadastre seu cartão em Contas e faturas → Cartões para registrar compras no crédito.</Aviso>; break; }
      const key = cartao ? faturaDaCompra(data, cartao) : "";
      const venc = cartao ? datasDaFatura(key, cartao).vencimento : "";
      const parcela = valor ? Math.ceil(valor / Math.max(1, parcelas)) : 0;
      corpo = <>
        {campoEscopo()}
        {campoValor("Valor total da compra")}
        {campoDesc("Ex.: Tênis, curso, peça do PC")}
        {linha(<Campo key="c" rotulo="Cartão"><Selecao value={cartaoId} onChange={setCartaoId} opcoes={d.cartoes.filter((c) => !c.arquivado || c.id === cartaoId).map((c) => ({ valor: c.id, rotulo: c.nome }))} /></Campo>, <Campo key="p" rotulo="Parcelas"><Numero value={parcelas} onChange={(n) => setParcelas(Math.min(48, Math.max(1, n)))} min={1} max={48} /></Campo>)}
        {linha(<div key="cat">{campoCategoria()}</div>, <div key="d">{campoData("Data da compra")}</div>)}
        {cartao && valor ? <Aviso tom="info">{parcelas > 1 ? `${parcelas}x de ${brl(parcela)}` : brl(valor)}, {parcelas > 1 ? "a primeira" : ""} na fatura que vence em {br(venc)}. Não sai do banco agora: vira compromisso e entra nos gastos de {br(data)}.</Aviso> : null}
      </>;
      if (parcela > sit.livreReal && escopo === "pessoal") avisos.push(<Aviso key="l" tom="warn">A parcela ({brl(parcela)}) é maior que seu dinheiro livre agora ({brl(sit.livreReal)}). Ela vai pesar na próxima fatura.</Aviso>);
      break;
    }
    case "fatura":
      corpo = <>
        {campoValor("Valor pago")}
        {linha(<div key="c">{campoConta("Pago com")}</div>, <div key="d">{campoData()}</div>)}
        <Campo rotulo="Sai do envelope"><Selecao value={envelopeId} onChange={setEnvelopeId} opcoes={opEnvs} /></Campo>
        <Aviso tom="info">Pagamento de fatura não conta como gasto: as compras já contaram quando foram feitas.</Aviso>
      </>;
      break;
    case "estoque": {
      if (!produtos.length) { corpo = <Aviso tom="info">Cadastre um produto em Negócio NFC → Produtos antes de registrar compras de estoque.</Aviso>; break; }
      const total = (valor ?? 0) * (porUnidade ? qtd : 1);
      corpo = <>
        <Campo rotulo="Produto"><Selecao value={produtoId} onChange={setProdutoId} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} /></Campo>
        {linha(<Campo key="q" rotulo="Quantidade"><Numero value={qtd} onChange={setQtd} min={1} /></Campo>, <Campo grupo key="t" rotulo="O valor é"><Segmentos value={porUnidade ? "un" : "total"} onChange={(v) => setPorUnidade(v === "un")} opcoes={[{ valor: "total", rotulo: "Do lote" }, { valor: "un", rotulo: "Por unidade" }]} /></Campo>)}
        {campoValor(porUnidade ? "Custo por unidade" : "Custo total do lote", valor && qtd ? (porUnidade ? `Total: ${brl(total)}` : `Sai a ${brl(Math.round(total / qtd))} por unidade`) : undefined)}
        <Campo grupo rotulo="Situação"><Segmentos value={statusEstoque} onChange={setStatusEstoque} opcoes={[{ valor: "paga", rotulo: "Paguei" }, { valor: "pendente", rotulo: "Vou pagar" }, { valor: "inicial", rotulo: "Já tinha" }]} /></Campo>
        {statusEstoque === "paga" && linha(<div key="c">{campoConta("Pago com")}</div>, <div key="d">{campoData()}</div>)}
        {statusEstoque === "pendente" && linha(<Campo key="v" rotulo="Vencimento"><Data value={vencimento} onChange={setVencimento} /></Campo>, <div key="d">{campoData("Data da compra")}</div>)}
        {statusEstoque === "inicial" && <Aviso tom="info">Estoque que você já tinha antes de usar o app: entra no estoque com esse custo, mas não mexe no dinheiro.</Aviso>}
        <Campo rotulo="Fornecedor"><Texto value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Opcional" /></Campo>
      </>;
      if (statusEstoque === "paga" && total > saldoEnv(E.negocio?.id)) avisos.push(<Aviso key="n" tom="warn">O envelope do negócio tem {brl(saldoEnv(E.negocio?.id))}. Esta compra deixa ele negativo: antes, mova dinheiro pessoal para o negócio (Aporte em objetivo), para não misturar.</Aviso>);
      break;
    }
    case "venda": {
      if (!produtos.length) { corpo = <Aviso tom="info">Cadastre um produto em Negócio NFC → Produtos antes de registrar vendas.</Aviso>; break; }
      const t = vendaM ? totaisVenda({ ...vendaM, qtd, precoUnit: precoUnit ?? 0, desconto: desconto ?? 0, recebimentos, cancelada }) : null;
      corpo = <>
        <Campo rotulo="Produto"><Selecao value={produtoId} onChange={setProdutoId} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: `${p.nome} · ${sit.estoque.porProduto[p.id]?.qtd ?? 0} em estoque` }))} /></Campo>
        {linha(<Campo key="q" rotulo="Quantidade"><Numero value={qtd} onChange={setQtd} min={1} /></Campo>, <Campo key="p" rotulo="Preço de cada"><Dinheiro value={precoUnit} onChange={setPrecoUnit} /></Campo>)}
        {linha(<Campo key="d" rotulo="Desconto total"><Dinheiro value={desconto} onChange={setDesconto} /></Campo>, <Campo key="f" rotulo="Forma de pagamento"><Selecao value={forma} onChange={setForma} opcoes={["Pix", "Dinheiro", "Cartão", "Transferência", "Boleto"].map((x) => ({ valor: x, rotulo: x }))} /></Campo>)}
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
          <div><div className="text-[12px] text-muted">Total</div><div className="num font-semibold">{brl(brutoVenda)}</div></div>
          <div><div className="text-[12px] text-muted">Custo estimado</div><div className="num font-semibold">{brl(custoEst)}</div></div>
          <div><div className="text-[12px] text-muted">Lucro bruto</div><div className={cn("num font-semibold", brutoVenda - custoEst < 0 ? "text-bad" : "text-good")}>{brl(brutoVenda - custoEst)}</div></div>
        </div>
        {!m ? (
          <Campo grupo rotulo="Recebimento"><Segmentos value={situacaoVenda} onChange={setSituacaoVenda} opcoes={[{ valor: "recebida", rotulo: "Recebi tudo" }, { valor: "parcial", rotulo: "Parte" }, { valor: "pendente", rotulo: "Vou receber" }]} /></Campo>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
            <div className="flex items-center justify-between text-[14px]"><b>Recebimentos</b><span className="num text-muted">{t && `${brl(t.recebido)} de ${brl(t.bruto)}`}</span></div>
            {recebimentos.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[14px]"><span>{br(r.data)} · {d.contas.find((c) => c.id === r.contaId)?.nome}</span><span className="flex items-center gap-2"><Money c={r.valor} className="font-semibold" /><button className="text-[12px] font-semibold text-bad" onClick={() => setRecebimentos((x) => x.filter((y) => y.id !== r.id))}>Remover</button></span></div>
            ))}
            {!recebimentos.length && <div className="text-[13px] text-muted">Nada recebido ainda. Use "Receber" na lista de vendas.</div>}
            <label className="mt-1 flex items-center justify-between gap-3"><span className="text-[14px]">Venda cancelada</span><Interruptor ligado={cancelada} onChange={setCancelada} rotulo="Venda cancelada" /></label>
          </div>
        )}
        {situacaoVenda === "parcial" && !m && <Campo rotulo="Quanto recebeu agora"><Dinheiro value={valorRecebidoAgora} onChange={setValorRecebidoAgora} /></Campo>}
        {(situacaoVenda !== "recebida" || m) && <Campo rotulo="Previsão de receber o resto"><Data value={previstaPara} onChange={setPrevista} /></Campo>}
        {linha(<div key="c">{campoConta(situacaoVenda === "pendente" && !m ? "Conta (gastos e recebimento)" : "Entrou em")}</div>, <div key="d">{campoData()}</div>)}
        <Campo rotulo="Cliente"><Texto value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: Padaria do bairro" /></Campo>
        <Campo rotulo="Gastos desta venda" dica="Transporte, embalagem... Saem do caixa do negócio e reduzem o lucro."><Dinheiro value={despesasDiretas} onChange={setDespesasDiretas} /></Campo>
      </>;
      if (qtd > estoqueProd && !cancelada) avisos.push(<Aviso key="e" tom="warn">Você tem {estoqueProd} em estoque. Dá para salvar, mas talvez falte registrar uma compra de estoque. O custo vai ser estimado.</Aviso>);
      if (!m && situacaoVenda !== "recebida") avisos.push(<Aviso key="p" tom="info">O que não foi recebido fica em "a receber" e não entra no seu caixa.</Aviso>);
      break;
    }
    case "aporte": {
      if (envAvancado) {
        corpo = <>
          <Aviso tom="info">Esta movimentação mexe em vários envelopes. Ajuste os valores de cada um (negativo tira, positivo põe).</Aviso>
          {itensEnv.map((i, k) => (
            <div key={i.envelopeId + k} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-3">
              <span className="truncate font-semibold">{nomeEnv(i.envelopeId)}</span>
              <Dinheiro value={i.valor} onChange={(v) => setItensEnv((x) => x.map((y, j) => (j === k ? { ...y, valor: v ?? 0 } : y)))} />
            </div>
          ))}
          {campoData()}
        </>;
        break;
      }
      const deOps = [{ valor: "livre-dist", rotulo: `A distribuir · ${brl(Math.max(0, saldos.aDistribuir))}` }, ...opEnvs];
      corpo = <>
        {campoValor()}
        {linha(<Campo key="de" rotulo="Tirar de"><Selecao value={deEnv} onChange={setDeEnv} opcoes={deOps} /></Campo>, <Campo key="pa" rotulo="Colocar em"><Selecao value={paraEnv} onChange={setParaEnv} opcoes={opEnvs} /></Campo>)}
        {campoData()}
        {campoDesc("Ex.: Guardar para o PC")}
        <Aviso tom="info">Isto só muda a finalidade do dinheiro. Ele continua na mesma conta e não conta como receita.</Aviso>
      </>;
      const origem = deEnv === "livre-dist" ? saldos.aDistribuir : saldoEnv(deEnv);
      if (valor && valor > origem) avisos.push(<Aviso key="o" tom="bad">{deEnv === "livre-dist" ? "A distribuir" : nomeEnv(deEnv)} tem só {brl(origem)}.</Aviso>);
      if (deEnv === paraEnv) avisos.push(<Aviso key="i" tom="bad">Escolha envelopes diferentes.</Aviso>);
      break;
    }
    case "retirada": {
      const r = disponivelParaRetirada(d, sit);
      corpo = <>
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="text-[13px] text-muted">Pode tirar sem travar o negócio</div>
          <div className="font-display text-[28px] font-semibold num">{brl(r.valor)}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
            <span className="text-muted">Caixa do negócio</span><Money c={r.caixa} className="text-right" />
            <span className="text-muted">Contas do negócio</span><Money c={-r.contas} className="text-right" />
            <span className="text-muted">Repor estoque mínimo</span><Money c={-r.reposicao} className="text-right" />
            <span className="text-muted">Capital de giro mínimo</span><Money c={-r.minimo} className="text-right" />
          </div>
        </div>
        {r.provisorio.length > 0 && <Aviso tom="warn">Estimativa provisória: {r.provisorio.join(" ")}</Aviso>}
        {campoValor("Quanto vai tirar")}
        {campoData()}
        {!m && <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3"><span className="text-[14px]"><b>Distribuir em seguida</b><br /><span className="text-muted">Usa a estratégia do lucro do negócio</span></span><Interruptor ligado={distribuirAgora} onChange={setDistribuirAgora} rotulo="Distribuir em seguida" /></label>}
      </>;
      if (valor && valor > r.valor) avisos.push(<Aviso key="r" tom="bad">Tirar {brl(valor)} passa {brl(valor - r.valor)} do que o negócio pode liberar agora.</Aviso>);
      break;
    }
    case "investimento":
      corpo = <>
        <Segmentos value={direcao} onChange={(v) => { setDirecao(v); if (!m) setInvEnv(v === "aporte" ? E.investimentos?.id ?? "nenhum" : "nenhum"); }} opcoes={[{ valor: "aporte", rotulo: "Aplicar" }, { valor: "resgate", rotulo: "Resgatar" }]} />
        <Campo rotulo="Investimento"><Selecao value={investimentoId} onChange={setInvestimentoId} opcoes={[...d.investimentos.filter((i) => !i.arquivado).map((i) => ({ valor: i.id, rotulo: `${i.nome}${i.instituicao ? ` · ${i.instituicao}` : ""}` })), { valor: "novo", rotulo: "+ Novo investimento" }]} /></Campo>
        {investimentoId === "novo" && linha(<Campo key="n" rotulo="Nome"><Texto value={novoInvNome} onChange={(e) => setNovoInvNome(e.target.value)} placeholder="Ex.: CDB liquidez diária" /></Campo>, <Campo key="i" rotulo="Instituição"><Texto value={novoInvInst} onChange={(e) => setNovoInvInst(e.target.value)} placeholder="Ex.: Inter" /></Campo>)}
        {campoValor()}
        {linha(<div key="c">{campoConta(direcao === "aporte" ? "Sai de" : "Entra em")}</div>, <div key="d">{campoData()}</div>)}
        <Campo rotulo={direcao === "aporte" ? "Sai do envelope" : "Volta para"}><Selecao value={invEnv} onChange={setInvEnv} opcoes={[{ valor: "nenhum", rotulo: "A distribuir" }, ...opEnvs]} /></Campo>
        <Aviso tom="info">Investir não é gasto: o dinheiro sai da conta e passa a contar no seu patrimônio como investimento. Rendimentos você atualiza em Metas → Investimentos.</Aviso>
      </>;
      break;
    case "ajuste":
      corpo = m ? <>{campoConta()}<Campo rotulo="Diferença (negativo tira do saldo)"><Dinheiro value={valor} onChange={setValor} /></Campo>{campoData()}</> : <>
        {campoConta("Conta")}
        <div className="rounded-2xl bg-surface-2 p-4 text-[14px]">Saldo pelo app: <Money c={saldos.contas[contaId] ?? 0} className="font-semibold" /></div>
        <Campo rotulo="Saldo que aparece no banco"><Dinheiro value={saldoBanco} onChange={setSaldoBanco} grande /></Campo>
        {saldoBanco != null && <Aviso tom={saldoBanco === (saldos.contas[contaId] ?? 0) ? "good" : "warn"}>{saldoBanco === (saldos.contas[contaId] ?? 0) ? "Bate certinho." : `Diferença de ${brl(saldoBanco - (saldos.contas[contaId] ?? 0))}. Antes de ajustar, veja se esqueceu de registrar algum gasto ou recebimento.`}</Aviso>}
        {campoData()}
      </>;
      break;
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {onVoltar && <button onClick={onVoltar} className="self-start text-[13px] font-semibold text-accent">← Outro tipo</button>}
      {corpo}
      {avisos}
      {erros.length > 0 && <Aviso tom="bad">{erros.join(" ")}</Aviso>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex gap-2 border-t border-line bg-surface px-5 pt-3">
        {m && <Button variante="outline" className="text-bad" onClick={apagar}>Apagar</Button>}
        <Button className="flex-1" onClick={salvar} disabled={salvando}>{m ? "Salvar alterações" : tipo === "ajuste" ? "Conferir saldo" : "Salvar"}</Button>
      </div>
    </div>
  );
}

