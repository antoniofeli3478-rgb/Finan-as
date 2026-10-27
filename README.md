# Finanças

App financeiro pessoal feito para renda variável e para quem está começando a empreender. Os seus negócios (por exemplo, as Plaquinhas NFC) ficam dentro dele, com caixa separado, e são lançados à mão. Funciona no computador e no celular, **offline**, e guarda tudo **só no seu aparelho**.

- **No celular (pronto para usar):** https://antoniofeli3478-rgb.github.io/Finan-as/ → no Chrome, ⋮ → **Instalar app**.
- **No computador:** veja "Rodar no computador" abaixo, ou abra o mesmo endereço e instale pelo Chrome/Edge.

## O que ele faz

| Área | O que resolve |
|---|---|
| **Visão geral** | Dinheiro livre *de verdade* (já descontadas as contas próximas sem cobertura), saldo, reservado, a pagar, a receber, fatura, capital do negócio, patrimônio e "O que preciso fazer agora?" |
| **Envelopes** | Obrigações, Negócio e estoque, Meta do PC, Reserva de emergência, Para investir, Dinheiro livre e objetivos que você criar. A soma dos envelopes + "a distribuir" é sempre igual ao dinheiro nas contas |
| **Distribuição** | A cada recebimento, o app sugere como dividir (primeiro as contas próximas, depois capital de giro, metas e o resto livre). Você edita e confirma. Nada é movido sem você confirmar |
| **Meus negócios** | Um ou mais negócios, cada um com caixa próprio. Você lança à mão as vendas (recebidas ou a receber) e os gastos; o app mostra vendido × recebido × lucro, a evolução, a simulação e quanto dá para retirar para você sem travar o negócio |
| **Contas e faturas** | Agenda, contas fixas (recorrências sem duplicar), cartão de crédito manual com faturas, parcelas e pagamento, contas bancárias com conferência de saldo |
| **Metas** | PC com cenários conservador / intermediário / otimista, reserva (manual ou por meses de contas essenciais), capital de giro, investimentos |
| **Relatórios** | Semana, mês e ano: receitas por fonte, gastos por categoria, lucro do negócio, poupança, comparação, evolução do saldo, projeções. Exporta CSV, JSON e imprime |
| **Consultor** | "Posso comprar R$ 100?", "Quanto preciso vender para o PC?", "Qual meu maior risco?"... Respostas por regras, sem IA e sem internet |

## Rodar no computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
cd Finan-as
npm install          # 1. instala as dependências (uma vez)
npm run dev          # 2. abre em http://localhost:5173 (modo de desenvolvimento)
npm test             # roda os 58 testes dos cálculos, do banco e do backup
npm run build        # 3. gera a versão de produção em docs/ (é o que o GitHub Pages publica)
npm run preview      #    e serve essa versão em http://localhost:4173
```

A versão de produção é só arquivos estáticos: funciona em qualquer servidor ou abrindo pelo `npm run preview`. Não precisa de hospedagem pública. O GitHub Pages só é usado para ter um endereço **HTTPS**, que o celular exige para instalar o app e funcionar offline.

## Negócios

- Cada negócio é um envelope do tipo "negócio": o dinheiro dele fica separado do seu.
- **Venda do negócio** (botão + ou Meus negócios → Venda): entra na conta e no caixa daquele negócio. Venda "a receber" aparece em A receber e só entra no caixa quando você marca como recebida. Não pede distribuição, porque não é dinheiro seu ainda.
- **Gasto do negócio** (Despesa → Negócio): sai do caixa do negócio. Compra de mercadoria é um gasto como outro qualquer.
- **Lucro** = vendas − gastos do negócio no período. Nos relatórios, entra só o lucro (não o valor das vendas).
- **Retirada**: tira do caixa do negócio, respeitando o capital de giro mínimo, e manda para "a distribuir".
- O Finanças **não** se liga a outros apps. O app Plaquinhas NFC continua separado e independente.

## Backup e restauração

- **Fazer backup:** Configurações → Backup e restauração → **Fazer backup agora**. Gera um arquivo `.json` (no celular abre o "Compartilhar": mande para você mesmo no WhatsApp, Drive ou e-mail). O app mostra a data do último backup e avisa depois de 14 dias.
- **Com senha (opcional):** o arquivo é cifrado com AES-256-GCM, chave derivada da senha por PBKDF2 (310 mil rodadas). Sem a senha ninguém abre o arquivo, nem você.
- **Restaurar:** Configurações → **Restaurar de um arquivo**. O arquivo é validado antes; o app mostra quantas movimentações e quanto dinheiro tem nele e pede confirmação. A troca é feita numa transação: se algo falhar, nada muda.
- **Planilha:** Relatórios → CSV (abre no Excel e no Google Planilhas).

⚠️ Os dados ficam no navegador (IndexedDB). Se você limpar os dados do navegador, desinstalar o app ou trocar de aparelho **sem backup**, eles se perdem. Celular e computador têm dados separados: para levar de um para o outro, use backup e restauração.

## Privacidade

- Nenhum dado sai do aparelho. Sem servidor, sem login, sem analytics, sem anúncios, sem rastreadores.
- O app nunca pede senha de banco e não se conecta a bancos: tudo é registrado por você.
- O banco dentro do navegador **não é criptografado**. Só o arquivo de backup pode ter senha.
- Lembretes aparecem quando você abre o app. Com o app fechado não há notificação.

## Como funciona por dentro (decisões técnicas)

- **Stack:** React 19 + TypeScript + Vite 6 + Tailwind 4, IndexedDB com Dexie 4, PWA com vite-plugin-pwa, validação de backup com Zod. Gráficos em SVG próprio (leves, com as cores do tema). Fontes Onest e Bricolage Grotesque embutidas, para funcionar offline.
- **Dinheiro em centavos inteiros** (`src/core/money.ts`). Nenhuma conta usa número com vírgula.
- **Saldos nunca são guardados.** Cada movimentação vira lançamentos em contas e envelopes num único lugar (`lancamentos()` em `src/core/ledger.ts`), e os saldos são somados a partir deles. Editar ou apagar qualquer coisa recalcula tudo. O saldo de um envelope sempre bate com o histórico dele.
- **Uma fonte de verdade para as telas:** `calcularSituacao()` (`src/core/situacao.ts`) calcula a foto financeira uma vez; todas as telas, o consultor e os relatórios leem dela.
- **Regras de integridade** (seção 14 do pedido) testadas em `tests/nucleo.test.ts`: transferência não é receita nem despesa; despesa e venda pendentes não mexem no saldo; pagamento de fatura não duplica gasto; compra de estoque não é lucro; CMV pelo custo médio; aportes e investimentos não são receita nem consumo; envelopes + a distribuir = caixa; parcelas na fatura certa; duplicidade de recebimento detectada; editar/apagar recalcula.
- **Cartão:** a fatura é identificada pelo mês de fechamento. Compra antes do dia de fechamento cai na fatura daquele mês; no dia do fechamento ou depois, na seguinte. A compra conta como gasto na data dela; o pagamento só quita a fatura.
- **Dinheiro livre real** = envelope livre − contas pessoais até o horizonte (30 dias, configurável) que o envelope de obrigações não cobre − envelopes negativos − excesso de envelopes sobre o caixa.
- **Patrimônio financeiro** = dinheiro nas contas + investimentos (valor que você informa) − dívidas assumidas (faturas, contas a pagar). Limite do cartão, valores a receber e estoque ficam de fora (mostrados à parte).
- **Recorrências** guardam até onde já geraram (`geradoAte`), então reabrir o app não duplica contas; uma ocorrência apagada não volta.
- **Banco versionado:** `this.version(1)` em `src/data/db.ts`. Mudanças futuras ganham `version(2).upgrade(...)`. O backup tem `schemaVersion` e uma função de migração.
- **Modo demonstração** usa outro banco (`gerente-financeiro-demo`): os exemplos nunca se misturam com seus dados.

## Estrutura

```
financeiro/
├── src/core/      cálculos puros (sem tela): dinheiro, datas, livro-caixa, cartão, estoque,
│                  recorrências, situação, distribuição, negócio, relatórios, consultor, ações
├── src/data/      banco local (Dexie), gravações, backup/restauração, demonstração
├── src/app/       casca do app, rotas, dados compartilhados, ações globais
├── src/forms/     registro rápido e distribuição
├── src/screens/   as telas
├── src/ui/        componentes e gráficos
└── tests/         testes (Vitest + fake-indexeddb)
```
