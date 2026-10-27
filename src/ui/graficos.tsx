// Gráficos simples em SVG, desenhados na mesma escala e com as cores do tema.

import { brl, type Cents } from "../core/money";

const curto = (c: Cents) => {
  const v = c / 100;
  const a = Math.abs(v);
  const s = a >= 1000 ? (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : Math.round(a).toLocaleString("pt-BR");
  return (v < 0 ? "−" : "") + s;
};

/** Barras agrupadas: até 2 séries por rótulo. */
export function Barras({ dados, series }: { dados: { rotulo: string; valores: Cents[] }[]; series: { nome: string; cor: string }[] }) {
  const W = 600, H = 210, topo = 22, base = 176, esq = 6;
  const max = Math.max(1, ...dados.flatMap((d) => d.valores.map((v) => Math.max(0, v))));
  const grupo = (W - esq) / Math.max(1, dados.length);
  const bw = Math.min(26, (grupo - 14) / series.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={series.map((s) => s.nome).join(" e ")}>
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={W} y1={base - (base - topo) * f} y2={base - (base - topo) * f} stroke="var(--line)" strokeDasharray="3 5" />)}
        <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--line)" />
        {dados.map((d, i) => {
          const x0 = esq + i * grupo + (grupo - bw * series.length - 4 * (series.length - 1)) / 2;
          return (
            <g key={d.rotulo}>
              {d.valores.map((v, j) => {
                const h = v > 0 ? Math.max(2, (v / max) * (base - topo)) : 0;
                const x = x0 + j * (bw + 4);
                return (
                  <g key={j}>
                    <rect x={x} y={base - h} width={bw} height={h} rx={5} fill={series[j].cor} opacity={i === dados.length - 1 ? 1 : 0.75}><title>{`${series[j].nome}: ${brl(v)}`}</title></rect>
                    {v !== 0 && dados.length <= 8 && <text x={x + bw / 2} y={base - h - 6} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--muted)">{curto(v)}</text>}
                  </g>
                );
              })}
              <text x={esq + i * grupo + grupo / 2} y={base + 20} textAnchor="middle" fontSize="12" fill="var(--muted)">{d.rotulo}</text>
            </g>
          );
        })}
      </svg>
      <Legenda series={series} />
    </div>
  );
}

export function Linha({ dados, cor = "var(--accent)" }: { dados: { rotulo: string; valor: Cents }[]; cor?: string }) {
  const W = 600, H = 190, topo = 20, base = 156, esq = 10, dir = 10;
  if (!dados.length) return null;
  const vs = dados.map((d) => d.valor);
  const min = Math.min(0, ...vs), max = Math.max(1, ...vs);
  const y = (v: number) => base - ((v - min) / (max - min || 1)) * (base - topo);
  const x = (i: number) => esq + (i * (W - esq - dir)) / Math.max(1, dados.length - 1);
  const pts = dados.map((d, i) => `${x(i)},${y(d.valor)}`).join(" ");
  const area = `${x(0)},${y(Math.max(min, 0))} ${pts} ${x(dados.length - 1)},${y(Math.max(min, 0))}`;
  const ult = dados[dados.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Evolução">
      <line x1={0} x2={W} y1={y(0) + 0.5} y2={y(0) + 0.5} stroke="var(--line)" />
      <polygon points={area} fill={cor} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(dados.length - 1)} cy={y(ult.valor)} r={5} fill={cor} stroke="var(--surface)" strokeWidth={2} />
      <text x={x(dados.length - 1) - 8} y={y(ult.valor) - 12} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--ink)">{curto(ult.valor)}</text>
      {dados.map((d, i) => (i % Math.ceil(dados.length / 6) === 0 || i === dados.length - 1) && (
        <text key={i} x={x(i)} y={base + 22} textAnchor={i === 0 ? "start" : i === dados.length - 1 ? "end" : "middle"} fontSize="12" fill="var(--muted)">{d.rotulo}</text>
      ))}
    </svg>
  );
}

export function Legenda({ series }: { series: { nome: string; cor: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}
    </div>
  );
}

/** Lista com barras horizontais (categorias, fontes). */
export function BarrasH({ itens }: { itens: { rotulo: string; valor: Cents; cor?: string; extra?: string }[] }) {
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((i) => (
        <div key={i.rotulo} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-[14px]">{i.rotulo}{i.extra && <span className="ml-1.5 text-[12px] text-muted">{i.extra}</span>}</span>
          <span className="num text-[14px] font-semibold">{brl(i.valor)}</span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${(Math.abs(i.valor) / max) * 100}%`, background: i.cor ?? "var(--accent)" }} /></div>
        </div>
      ))}
    </div>
  );
}
