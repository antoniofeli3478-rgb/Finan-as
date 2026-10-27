// Navegação pelo "#/tela" no endereço: funciona offline e em qualquer pasta.
import { useEffect, useState } from "react";

export type Rota = "visao" | "movimentos" | "envelopes" | "contas" | "negocios" | "metas" | "relatorios" | "consultor" | "config";

export const ROTAS: Rota[] = ["visao", "movimentos", "envelopes", "contas", "negocios", "metas", "relatorios", "consultor", "config"];

function ler(): { rota: Rota; sub: string } {
  const [r, sub = ""] = location.hash.replace(/^#\/?/, "").split("/");
  return { rota: (ROTAS as string[]).includes(r) ? (r as Rota) : "visao", sub };
}

export function useRota() {
  const [st, set] = useState(ler);
  useEffect(() => {
    const f = () => { set(ler()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return st;
}

export const ir = (rota: Rota, sub = "") => { location.hash = `#/${rota}${sub ? "/" + sub : ""}`; };
