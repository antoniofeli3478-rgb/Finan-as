import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { br } from "../core/dates";
import { brl } from "../core/money";
import type { Config, Estrategia, Fonte, RegraDistribuicao } from "../core/types";
import { calcularSaldos } from "../core/ledger";
import { useApp } from "../app/store";
import { db, definirModo } from "../data/db";
import { apagarTudo, novoId } from "../data/repo";
import { backupComoTexto, ErroBackup, lerBackup, marcarBackupFeito, restaurar } from "../data/backup";
import { popularDemo } from "../data/demo";
import { Aviso, Button, Campo, Card, entregarArquivo, Folha, Numero, Secao, Segmentos, Selecao, Texto, useUi } from "../ui/ui";
import type { Dados } from "../core/types";

const salvarCfg = (p: Partial<Config>) => db().config.update("cfg", p);

export function Configuracoes({ abrirAssistente }: { abrirAssistente: () => void }) {
  const { d, hoje, modo } = useApp();
  const { toast, confirmar } = useUi();
  const [estEditar, setEstEditar] = useState<Estrategia | null>(null);

  return (
    <div className="flex flex-col gap-7">
      <h1 className="font-display text-[28px] font-semibold tracking-tight">Configurações</h1>

      <Secao titulo="Aparência e prazos">
        <Card className="flex flex-col gap-4 p-4">
          <Campo grupo rotulo="Tema"><Segmentos value={d.config.tema} onChange={(v) => salvarCfg({ tema: v })} opcoes={[{ valor: "escuro", rotulo: "Escuro" }, { valor: "claro", rotulo: "Claro" }, { valor: "sistema", rotulo: "Do aparelho" }]} /></Campo>
          <Campo rotulo="Contas próximas = vencendo nos próximos" dica="O app separa dinheiro para as contas dentro deste prazo antes de sugerir gastos."><Selecao value={String(d.config.horizonteDias)} onChange={(v) => salvarCfg({ horizonteDias: Number(v) })} opcoes={[7, 15, 30, 45, 60].map((n) => ({ valor: String(n), rotulo: `${n} dias` }))} /></Campo>
        </Card>
      </Secao>

      <Secao titulo="Distribuição do dinheiro recebido">
        <Card className="flex flex-col gap-1 p-2">
          {d.config.estrategias.map((e) => (
            <button key={e.id} onClick={() => setEstEditar(e)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2">
              <span className="min-w-0"><span className="block font-semibold">{e.nome}</span><span className="block truncate text-[12.5px] text-muted">{resumoEstrategia(e, d)}</span></span>
              <span className="text-[13px] font-semibold text-accent">Editar</span>
            </button>
          ))}
        </Card>
        <Fontes />
      </Secao>

      <Categorias />
      <Backup />

      <Secao titulo="Privacidade">
        <Card className="flex flex-col gap-2 p-4 text-[14px] leading-relaxed text-muted">
          <p>Seus dados ficam só neste navegador, neste aparelho (IndexedDB). Nada é enviado para servidor nenhum, e não há rastreadores, anúncios ou estatísticas.</p>
          <p>O banco dentro do navegador não é criptografado. Quem usa este aparelho e este navegador consegue abrir o app. O backup pode ser protegido com senha (criptografia AES-256).</p>
          <p>O app nunca pede senha de banco e não se conecta a contas bancárias. Tudo é registrado por você.</p>
          <p><b className="text-ink">Atenção:</b> se você limpar os dados do navegador, desinstalar o app ou trocar de aparelho, os dados somem. Faça backup de vez em quando.</p>
        </Card>
      </Secao>

      <Secao titulo="Outros">
        <Card className="flex flex-col divide-y divide-line">
          <button onClick={abrirAssistente} className="px-4 py-3.5 text-left font-semibold hover:bg-surface-2">Abrir o assistente de configuração</button>
          {modo === "real" ? (
            <button className="px-4 py-3.5 text-left hover:bg-surface-2" onClick={async () => {
              if (!(await confirmar({ titulo: "Abrir o modo demonstração?", texto: "O app troca para um banco separado, com dados fictícios. Os seus dados ficam intactos e voltam quando você sair do modo demonstração.", botao: "Abrir demonstração" }))) return;
              definirModo("demo");
              const { FinDB, NOME_DEMO } = await import("../data/db");
              const demo = new FinDB(NOME_DEMO);
              await popularDemo(demo, hoje);
              demo.close();
              location.reload();
            }}><b>Ver demonstração com dados de exemplo</b><span className="block text-[13px] text-muted">Separado dos seus dados reais</span></button>
          ) : (
            <button className="px-4 py-3.5 text-left font-semibold hover:bg-surface-2" onClick={() => { definirModo("real"); location.reload(); }}>Sair da demonstração e voltar aos meus dados</button>
          )}
          <button className="px-4 py-3.5 text-left font-semibold text-bad hover:bg-surface-2" onClick={async () => {
            if (!(await confirmar({ titulo: "Apagar todos os dados?", texto: "Movimentações, contas, cartões, produtos e metas serão apagados deste aparelho. Isso não tem volta. Se quiser, faça um backup antes.", botao: "Apagar tudo", perigo: true, digitar: "apagar" }))) return;
            await apagarTudo(db());
            toast("Dados apagados");
          }}>Apagar todos os dados {modo === "demo" ? "da demonstração" : ""}</button>
        </Card>
        <p className="text-center text-[12px] text-faint">Finanças 1.1 · {modo === "demo" ? "modo demonstração" : "dados reais"} · {d.movimentos.length} movimentações</p>
      </Secao>
      {estEditar && <EditarEstrategia est={estEditar} onFechar={() => setEstEditar(null)} />}
    </div>
  );
}

function resumoEstrategia(e: Estrategia, d: Dados) {
  const nome = (id: string) => d.envelopes.find((x) => x.id === id)?.nome ?? "?";
  return e.regras.map((r) => (r.modo === "necessidade" ? `${nome(r.envelopeId)} (o que faltar)` : `${r.valor}% ${nome(r.envelopeId)}`)).join(" · ") + ` · resto: ${nome(e.restoEnvelopeId)}`;
}

function EditarEstrategia({ est, onFechar }: { est: Estrategia; onFechar: () => void }) {
  const { d } = useApp();
  const { toast } = useUi();
  const [nome, setNome] = useState(est.nome);
  const [regras, setRegras] = useState<RegraDistribuicao[]>(est.regras);
  const [resto, setResto] = useState(est.restoEnvelopeId);
  const envs = d.envelopes.filter((e) => !e.arquivado);
  const somaPct = regras.filter((r) => r.modo === "percentual").reduce((a, r) => a + r.valor, 0);
  const salvar = async () => {
    if (somaPct > 100) { toast("As porcentagens somam mais de 100%.", true); return; }
    const estrategias = d.config.estrategias.map((e) => (e.id === est.id ? { ...e, nome: nome.trim() || e.nome, regras, restoEnvelopeId: resto } : e));
    await salvarCfg({ estrategias });
    toast("Estratégia salva");
    onFechar();
  };
  return (
    <Folha aberta onFechar={onFechar} titulo="Estratégia de distribuição" largura="lg" rodape={<Button className="w-full" onClick={salvar}>Salvar</Button>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome"><Texto value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Aviso tom="info">A ordem importa. "O que faltar" cobre só a necessidade (contas próximas, capital de giro), com um teto em % do valor recebido. As porcentagens valem sobre o que sobrar depois disso e param quando a meta do envelope é atingida.</Aviso>
        {regras.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_8.5rem_5.5rem_auto] items-end gap-2">
            <Campo rotulo={i === 0 ? "Envelope" : ""}><Selecao value={r.envelopeId} onChange={(v) => setRegras((x) => x.map((y, j) => (j === i ? { ...y, envelopeId: v } : y)))} opcoes={envs.map((e) => ({ valor: e.id, rotulo: e.nome }))} /></Campo>
            <Campo rotulo={i === 0 ? "Como" : ""}><Selecao value={r.modo} onChange={(v) => setRegras((x) => x.map((y, j) => (j === i ? { ...y, modo: v } : y)))} opcoes={[{ valor: "necessidade", rotulo: "O que faltar" }, { valor: "percentual", rotulo: "Porcentagem" }]} /></Campo>
            <Campo rotulo={i === 0 ? (r.modo === "necessidade" ? "Teto %" : "%") : ""}><Numero value={r.valor} onChange={(n) => setRegras((x) => x.map((y, j) => (j === i ? { ...y, valor: Math.max(0, Math.min(100, n)) } : y)))} /></Campo>
            <button aria-label="Remover regra" onClick={() => setRegras((x) => x.filter((_, j) => j !== i))} className="mb-1 grid h-9 w-9 place-items-center rounded-lg text-muted hover:text-bad"><Trash2 size={16} /></button>
          </div>
        ))}
        <Button variante="outline" tamanho="sm" className="self-start" onClick={() => setRegras((x) => [...x, { envelopeId: envs[0].id, modo: "percentual", valor: 10 }])}><Plus size={15} />Adicionar regra</Button>
        <Campo rotulo="O que sobrar vai para"><Selecao value={resto} onChange={setResto} opcoes={envs.map((e) => ({ valor: e.id, rotulo: e.nome }))} /></Campo>
        <div className={somaPct > 100 ? "text-bad" : "text-muted"}>Porcentagens somam {somaPct}%. {somaPct <= 100 && `${100 - somaPct}% do que sobrar vai para o envelope de sobra.`}</div>
      </div>
    </Folha>
  );
}

function Fontes() {
  const { d } = useApp();
  const [nova, setNova] = useState("");
  const atualizar = (fontes: Fonte[]) => salvarCfg({ fontes });
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="font-semibold">De onde vem seu dinheiro</div>
      <div className="text-[13px] text-muted">Cada fonte usa uma estratégia de distribuição.</div>
      {d.config.fontes.map((f) => (
        <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <Texto value={f.nome} onChange={(e) => atualizar(d.config.fontes.map((x) => (x.id === f.id ? { ...x, nome: e.target.value } : x)))} aria-label="Nome da fonte" />
          <Selecao value={f.estrategiaId} onChange={(v) => atualizar(d.config.fontes.map((x) => (x.id === f.id ? { ...x, estrategiaId: v } : x)))} opcoes={d.config.estrategias.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
        </div>
      ))}
      <div className="flex gap-2"><Texto value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova fonte de renda" /><Button variante="outline" onClick={() => { if (nova.trim()) { atualizar([...d.config.fontes, { id: novoId(), nome: nova.trim(), estrategiaId: d.config.estrategias[2]?.id ?? d.config.estrategias[0].id }]); setNova(""); } }}>Adicionar</Button></div>
    </Card>
  );
}

function Categorias() {
  const { d } = useApp();
  const [p, setP] = useState(d.config.categorias.pessoal.join(", "));
  const [n, setN] = useState(d.config.categorias.negocio.join(", "));
  const { toast } = useUi();
  const lista = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];
  return (
    <Secao titulo="Categorias">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-muted">Poucas categorias bastam. Separe por vírgula.</p>
        <Campo rotulo="Pessoais"><Texto value={p} onChange={(e) => setP(e.target.value)} /></Campo>
        <Campo rotulo="Do negócio"><Texto value={n} onChange={(e) => setN(e.target.value)} /></Campo>
        <Button variante="outline" className="self-start" onClick={async () => { const pp = lista(p), nn = lista(n); if (!pp.length || !nn.length) { toast("Deixe pelo menos uma categoria em cada grupo.", true); return; } await salvarCfg({ categorias: { pessoal: pp, negocio: nn } }); toast("Categorias salvas"); }}>Salvar categorias</Button>
      </Card>
    </Secao>
  );
}

function Backup() {
  const { d, hoje } = useApp();
  const { toast, confirmar } = useUi();
  const [senha, setSenha] = useState("");
  const [senhaRest, setSenhaRest] = useState("");
  const [precisaSenha, setPrecisaSenha] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const exportar = async () => {
    const t = await backupComoTexto(db(), senha || undefined);
    const ok = await entregarArquivo(`gerente-financeiro-backup-${hoje}${senha ? "-protegido" : ""}.json`, t, "application/json");
    if (ok) { await marcarBackupFeito(db()); toast("Backup criado"); }
  };
  const tentarRestaurar = async (t: string, s?: string) => {
    setErro(null);
    try {
      const b = await lerBackup(t, s);
      const saldos = calcularSaldos(b.dados);
      const ok = await confirmar({ titulo: "Restaurar este backup?", botao: "Restaurar", perigo: true, texto: (
        <span>Backup de {b.exportadoEm ? br(b.exportadoEm.slice(0, 10)) : "data desconhecida"}, com {b.dados.movimentos.length} movimentações e {brl(saldos.caixa)} nas contas. <b className="text-ink">Os dados atuais deste aparelho serão substituídos.</b> Se quiser, cancele e faça um backup do que está aqui antes.</span>
      ) });
      if (!ok) return;
      await restaurar(db(), b.dados);
      setTexto(null); setPrecisaSenha(false); setSenhaRest("");
      toast("Backup restaurado");
    } catch (e) {
      if (e instanceof ErroBackup && e.precisaSenha) { setPrecisaSenha(true); setTexto(t); }
      setErro((e as Error).message);
    }
  };
  const dias = d.config.ultimoBackup ? Math.floor((Date.now() - d.config.ultimoBackup) / 86400000) : null;
  return (
    <Secao titulo="Backup e restauração">
      <Card className="flex flex-col gap-4 p-4">
        <div className="text-[14px]">{d.config.ultimoBackup ? <>Último backup: <b>{new Date(d.config.ultimoBackup).toLocaleDateString("pt-BR")}</b>{dias != null && dias > 14 && <span className="text-warn"> (há {dias} dias)</span>}</> : <span className="text-warn">Você ainda não fez nenhum backup.</span>}</div>
        <Campo rotulo="Senha para proteger o backup (opcional)" dica="Sem a senha, ninguém abre o arquivo, nem você. Guarde-a bem."><Texto type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></Campo>
        <Button onClick={exportar}>Fazer backup agora</Button>
        <div className="border-t border-line pt-4">
          <input ref={arquivo} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await tentarRestaurar(await f.text()); }} />
          <Button variante="outline" onClick={() => arquivo.current?.click()}>Restaurar de um arquivo</Button>
          {precisaSenha && texto && (
            <div className="mt-3 flex gap-2"><Texto type="password" placeholder="Senha do backup" value={senhaRest} onChange={(e) => setSenhaRest(e.target.value)} /><Button onClick={() => tentarRestaurar(texto, senhaRest)}>Abrir</Button></div>
          )}
          {erro && <div className="mt-3"><Aviso tom="bad">{erro}</Aviso></div>}
          <p className="mt-2 text-[12.5px] text-muted">O arquivo é conferido antes. Se estiver com problema, nada é alterado.</p>
        </div>
      </Card>
    </Secao>
  );
}
