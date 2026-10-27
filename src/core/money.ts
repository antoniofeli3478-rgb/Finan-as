// Todo dinheiro do app é guardado em CENTAVOS inteiros (number sem casas decimais).
// Assim 0,10 + 0,20 dá 0,30 de verdade, e nenhuma conta acumula erro de arredondamento.

export type Cents = number;

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 12345 -> "R$ 123,45" */
export function brl(c: Cents): string {
  return fmt.format(c / 100).replace(/ /g, " ");
}

/** 12345 -> "123,45" (para preencher campos) */
export function centsToInput(c: Cents): string {
  const neg = c < 0;
  const abs = Math.abs(Math.round(c));
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return neg ? "-" + s : s;
}

/**
 * Lê o que a pessoa digitou e devolve centavos, ou null se não for um valor.
 * Aceita "80", "80,5", "89,90", "1.234,56", "1234.56", "R$ 1.234,56".
 */
export function parseCents(input: string | number | null | undefined): Cents | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let inteiro: string, decimal = "";
  if (lastComma >= 0) {
    // vírgula é o decimal brasileiro; pontos antes dela são milhar
    inteiro = s.slice(0, lastComma).replace(/\./g, "");
    decimal = s.slice(lastComma + 1);
  } else if (lastDot >= 0 && s.length - lastDot - 1 <= 2 && (s.match(/\./g) || []).length === 1) {
    // "1234.5" ou "1234.56": ponto como decimal
    inteiro = s.slice(0, lastDot);
    decimal = s.slice(lastDot + 1);
  } else {
    // "1.234" ou "1.234.567": pontos de milhar
    inteiro = s.replace(/\./g, "");
  }
  if (decimal.includes(".") || decimal.includes(",") || decimal.length > 2) return null;
  if (!/^\d*$/.test(inteiro) || (!inteiro && !decimal)) return null;
  const c = parseInt(inteiro || "0", 10) * 100 + parseInt((decimal + "00").slice(0, 2), 10);
  return neg ? -c : c;
}

/** Divide um valor em n partes inteiras; os centavos que sobram vão para as primeiras partes. */
export function dividir(total: Cents, n: number): Cents[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  let resto = total - base * n;
  return Array.from({ length: n }, () => {
    if (resto > 0) { resto--; return base + 1; }
    if (resto < 0) { resto++; return base - 1; }
    return base;
  });
}

/** Porcentagem de um valor, arredondada para baixo em centavos (nunca inventa centavo). */
export function pct(valor: Cents, percentual: number): Cents {
  return Math.floor((valor * percentual) / 100);
}

export const soma = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0);
