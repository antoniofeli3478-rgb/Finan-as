// Datas são guardadas como texto "AAAA-MM-DD" (sem fuso), e mostradas como DD/MM/AAAA.

export type ISODate = string;

export function hojeISO(d = new Date()): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function partes(iso: ISODate) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function fromParts(y: number, m: number, d: number): ISODate {
  // m pode passar de 12 ou ficar abaixo de 1: normaliza o ano
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  const dd = Math.min(d, diasNoMes(yy, mm));
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function diasNoMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDias(iso: ISODate, n: number): ISODate {
  const { y, m, d } = partes(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Soma meses mantendo o dia desejado quando possível (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMeses(iso: ISODate, n: number, diaDesejado?: number): ISODate {
  const { y, m, d } = partes(iso);
  return fromParts(y, m + n, diaDesejado ?? d);
}

export function diffDias(a: ISODate, b: ISODate): number {
  const pa = partes(a), pb = partes(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

export const mesDe = (iso: ISODate) => iso.slice(0, 7); // "AAAA-MM"
export const anoDe = (iso: ISODate) => iso.slice(0, 4);

export function addMesKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  return fromParts(y, m + n, 1).slice(0, 7);
}

/** Segunda-feira da semana da data. */
export function inicioSemana(iso: ISODate): ISODate {
  const { y, m, d } = partes(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDias(iso, -((dow + 6) % 7));
}

export function br(iso: ISODate | null | undefined): string {
  if (!iso) return "";
  const { y, m, d } = partes(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_C = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const nomeMes = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MESES[m - 1]} de ${y}`; };
export const nomeMesCurto = (key: string) => MESES_C[Number(key.split("-")[1]) - 1];
export const diaMesCurto = (iso: ISODate) => { const { m, d } = partes(iso); return `${d} ${MESES_C[m - 1]}`; };

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = partes(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(y, m);
}
