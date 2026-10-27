// Componentes de interface reaproveitados em todas as telas.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { brl, centsToInput, parseCents, type Cents } from "../core/money";

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export function Money({ c, className, sinal, cor }: { c: Cents; className?: string; sinal?: boolean; cor?: boolean }) {
  const txt = sinal && c > 0 ? "+" + brl(c) : brl(c);
  return <span className={cn("num whitespace-nowrap", cor && (c < 0 ? "text-bad" : c > 0 ? "text-good" : ""), className)}>{txt}</span>;
}

type Variante = "primary" | "soft" | "ghost" | "danger" | "outline";
export function Button({ variante = "primary", tamanho = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: "sm" | "md" | "lg" }) {
  const v: Record<Variante, string> = {
    primary: "bg-accent text-accent-ink hover:brightness-105 active:brightness-95",
    soft: "bg-accent-soft text-accent hover:brightness-110",
    ghost: "text-ink hover:bg-surface-2",
    outline: "border border-line text-ink hover:bg-surface-2",
    danger: "bg-bad text-white hover:brightness-105",
  };
  const t = { sm: "h-8 px-3 text-[13px] rounded-lg", md: "h-11 px-4 text-[15px] rounded-xl", lg: "h-12 px-5 text-base rounded-xl" }[tamanho];
  return <button type="button" {...p} className={cn("inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-40 disabled:pointer-events-none select-none", v[variante], t, className)} />;
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("rounded-2xl bg-surface shadow-card border border-line/60", className)}>{children}</div>;
}

export function Secao({ titulo, acao, children, className, id }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)} id={id}>
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Stat({ rotulo, valor, dica, tom, onClick }: { rotulo: string; valor: ReactNode; dica?: ReactNode; tom?: "good" | "warn" | "bad" | "accent"; onClick?: () => void }) {
  const cor = tom === "good" ? "text-good" : tom === "warn" ? "text-warn" : tom === "bad" ? "text-bad" : tom === "accent" ? "text-accent" : "";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("min-w-0 rounded-xl bg-surface-2 px-3.5 py-3 text-left", onClick && "hover:bg-surface-3 transition")}>
      <div className="text-[12.5px] text-muted">{rotulo}</div>
      <div className={cn("mt-0.5 truncate text-[19px] font-semibold num tracking-tight", cor)}>{valor}</div>
      {dica && <div className="mt-0.5 text-[12px] leading-snug text-muted">{dica}</div>}
    </Comp>
  );
}

export function Badge({ tom = "neutro", children, className }: { tom?: "neutro" | "good" | "warn" | "bad" | "accent"; children: ReactNode; className?: string }) {
  const t = { neutro: "bg-surface-3 text-muted", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", accent: "bg-accent-soft text-accent" }[tom];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold", t, className)}>{children}</span>;
}

export function Progresso({ pct, cor, alto }: { pct: number; cor?: string; alto?: boolean }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3", alto ? "h-2.5" : "h-1.5")} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: cor ?? "var(--accent)" }} />
    </div>
  );
}

export function Vazio({ titulo, children, acao, icone }: { titulo: string; children?: ReactNode; acao?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
      {icone && <div className="text-accent">{icone}</div>}
      <div className="font-semibold">{titulo}</div>
      {children && <div className="max-w-sm text-[14px] text-muted">{children}</div>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

// ── Folha (bottom sheet no celular, janela no computador) ──
export function Folha({ aberta, onFechar, titulo, children, rodape, largura = "md" }: { aberta: boolean; onFechar: () => void; titulo: ReactNode; children: ReactNode; rodape?: ReactNode; largura?: "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberta) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-fechar])")?.focus({ preventScroll: true });
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-[fade_.18s_ease-out]" onClick={onFechar} />
      <div ref={ref} className={cn("relative flex max-h-[94dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl animate-[sobe_.24s_cubic-bezier(.2,.8,.2,1)]", largura === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">{titulo}</h2>
          <button data-fechar onClick={onFechar} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {rodape && <div className="border-t border-line px-5 pt-3" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>{rodape}</div>}
      </div>
      <style>{`@keyframes fade{from{opacity:0}}@keyframes sobe{from{transform:translateY(24px);opacity:.4}}`}</style>
    </div>
  );
}

// ── Campos ──
/** Campo com rótulo. Use grupo quando o conteúdo for um conjunto de botões: um <label> em volta
 * de botões faz o toque no rótulo apertar o primeiro botão. */
export function Campo({ rotulo, dica, erro, children, className, grupo }: { rotulo: ReactNode; dica?: ReactNode; erro?: string | null; children: ReactNode; className?: string; grupo?: boolean }) {
  const Tag = grupo ? "div" : "label";
  return (
    <Tag className={cn("flex min-w-0 flex-col gap-1.5", className)} role={grupo ? "group" : undefined}>
      <span className="text-[13px] font-semibold text-muted">{rotulo}</span>
      {children}
      {erro ? <span className="text-[12.5px] font-medium text-bad">{erro}</span> : dica ? <span className="text-[12.5px] text-muted">{dica}</span> : null}
    </Tag>
  );
}

const inputCls = "h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-[15px] outline-none transition focus:border-accent";

export function Texto(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(inputCls, p.className)} />;
}

export function Data({ value, onChange, ...p }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} {...p} className={cn(inputCls, "num")} />;
}

export function Numero({ value, onChange, min = 0, ...p }: { value: number; onChange: (v: number) => void; min?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min">) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { if (Number(txt) !== value) setTxt(String(value)); }, [value]); // eslint-disable-line
  return <input type="number" inputMode="numeric" min={min} value={txt} onChange={(e) => { setTxt(e.target.value); const n = parseInt(e.target.value, 10); onChange(Number.isFinite(n) ? n : 0); }} {...p} className={cn(inputCls, "num")} />;
}

/** Campo de dinheiro: mostra "1.234,56" e devolve centavos (ou null se vazio/inválido). */
export function Dinheiro({ value, onChange, placeholder = "0,00", grande, ...p }: { value: Cents | null; onChange: (v: Cents | null) => void; grande?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [txt, setTxt] = useState(value == null ? "" : centsToInput(value));
  const ultimo = useRef(value);
  useEffect(() => {
    if (value !== ultimo.current) { ultimo.current = value; setTxt(value == null ? "" : centsToInput(value)); }
  }, [value]);
  return (
    <div className="relative">
      <span className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted", grande ? "text-base" : "text-[14px]")}>R$</span>
      <input
        inputMode="decimal" autoComplete="off" placeholder={placeholder} value={txt}
        onChange={(e) => { setTxt(e.target.value); const c = parseCents(e.target.value); ultimo.current = c; onChange(c); }}
        onBlur={() => { const c = parseCents(txt); if (c != null) setTxt(centsToInput(c)); }}
        {...p}
        className={cn(inputCls, "num pl-10", grande && "h-14 text-[24px] font-semibold", p.className)}
      />
    </div>
  );
}

export function Selecao<T extends string>({ value, onChange, opcoes, ...p }: { value: T; onChange: (v: T) => void; opcoes: { valor: T; rotulo: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} {...p} className={cn(inputCls, "pr-8")}>
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  );
}

export function Segmentos<T extends string>({ value, onChange, opcoes, className }: { value: T; onChange: (v: T) => void; opcoes: { valor: T; rotulo: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("grid gap-1 rounded-xl bg-surface-2 p-1", className)} style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }} role="tablist">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="tab" aria-selected={value === o.valor} onClick={() => onChange(o.valor)}
          className={cn("h-9 truncate rounded-lg px-2 text-[13.5px] font-semibold transition", value === o.valor ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, opcoes }: { value: T; onChange: (v: T) => void; opcoes: { valor: T; rotulo: ReactNode }[] }) {
  return (
    <div className="scroll-x -mx-0.5 flex gap-1.5 px-0.5">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" onClick={() => onChange(o.valor)} aria-pressed={value === o.valor}
          className={cn("h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition", value === o.valor ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted hover:text-ink")}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => onChange(!ligado)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition", ligado ? "bg-good" : "bg-surface-3")}>
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition", ligado ? "left-6" : "left-1")} />
    </button>
  );
}

export function Aviso({ tom = "warn", children }: { tom?: "warn" | "bad" | "good" | "info"; children: ReactNode }) {
  const t = { warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", good: "bg-good-soft text-good", info: "bg-surface-2 text-muted" }[tom];
  return <div className={cn("rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium leading-snug", t)}>{children}</div>;
}

// ── Avisos rápidos (toast) e confirmações ──
interface ToastMsg { id: number; texto: string; erro?: boolean }
interface Confirmacao { titulo: string; texto?: ReactNode; botao?: string; perigo?: boolean; digitar?: string; resolve: (ok: boolean) => void }
const UiCtx = createContext<{ toast: (t: string, erro?: boolean) => void; confirmar: (c: Omit<Confirmacao, "resolve">) => Promise<boolean> } | null>(null);

export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error("useUi fora do provider");
  return c;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [conf, setConf] = useState<Confirmacao | null>(null);
  const [digitado, setDigitado] = useState("");
  const toast = useCallback((texto: string, erro?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texto, erro }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), erro ? 5000 : 2800);
  }, []);
  const confirmar = useCallback((c: Omit<Confirmacao, "resolve">) => new Promise<boolean>((resolve) => { setDigitado(""); setConf({ ...c, resolve }); }), []);
  const fechar = (ok: boolean) => { conf?.resolve(ok); setConf(null); };
  const idTexto = useId();
  return (
    <UiCtx.Provider value={{ toast, confirmar }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn("max-w-md rounded-xl px-4 py-2.5 text-center text-[14px] font-semibold shadow-xl", t.erro ? "bg-bad text-white" : "bg-ink text-bg")}>{t.texto}</div>
        ))}
      </div>
      <Folha aberta={!!conf} onFechar={() => fechar(false)} titulo={conf?.titulo ?? ""} rodape={
        <div className="grid grid-cols-2 gap-2">
          <Button variante="outline" onClick={() => fechar(false)}>Cancelar</Button>
          <Button variante={conf?.perigo ? "danger" : "primary"} disabled={!!conf?.digitar && digitado.trim().toLowerCase() !== conf.digitar.toLowerCase()} onClick={() => fechar(true)}>{conf?.botao ?? "Confirmar"}</Button>
        </div>
      }>
        <div className="flex flex-col gap-3 pb-1 text-[15px] leading-relaxed text-muted" id={idTexto}>
          {conf?.texto}
          {conf?.digitar && <Campo rotulo={`Para confirmar, digite "${conf.digitar}"`}><Texto value={digitado} onChange={(e) => setDigitado(e.target.value)} /></Campo>}
        </div>
      </Folha>
    </UiCtx.Provider>
  );
}

/** Entrega um arquivo: no celular abre o "compartilhar"; no computador, baixa. */
export async function entregarArquivo(nome: string, conteudo: string, tipo: string): Promise<boolean> {
  const blob = new Blob([conteudo], { type: tipo });
  try {
    const file = new File([blob], nome, { type: tipo });
    if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) { await navigator.share({ files: [file], title: nome }); return true; }
  } catch (e) { if ((e as Error)?.name === "AbortError") return false; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

export const fmtBrl = brl;
