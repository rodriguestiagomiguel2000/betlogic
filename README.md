<div align="center">
  <h1>BetLogic Pro</h1>
  <p><strong>Tracker e Analytics para Apostas Desportivas</strong></p>
</div>

---

## Visão Geral

O BetLogic Pro é uma aplicação full-stack para apostadores que querem rastrear, analisar e gerir o seu portfólio de apostas com mais rigor do que uma folha de Excel permite. Combina leitura automática de betslips via OCR (IA) com analytics de risco, gestão multi-bankroll e ferramentas de auditoria.

Comecei este projeto para resolver um problema pessoal — controlar apostas espalhadas por várias casas e bankrolls — e aproveitei para praticar full-stack (React + Node + PostgreSQL) com apoio de ferramentas de AI (Google AI Studio / Gemini) para acelerar o desenvolvimento.

---

## Funcionalidades Principais

### Scanner de Betslip com OCR (IA)
- Motor: Google Gemini 3.1 Flash Lite (processamento server-side)
- Suporta múltiplas pernas (parlays/accumulators), bet builders e same game parlays
- Deteta automaticamente desporto, mercado, seleção, odds, stake, bookmaker e status live
- Imagens processadas no backend, não são guardadas permanentemente

### Entrada Manual de Apostas
- Formulário completo (desporto, liga, evento, mercado, odds, stake, bookmaker, bankroll)
- Toggles para Free Bet e Live
- Tags personalizadas e associação a tipsters

### Analytics & Risk Management
- ROI por mercado, desporto e liga
- Tracking de margem por bookmaker ("juice" real)
- Heatmaps de performance e win/loss streaks
- Vista de calendário de P/L mensal

### Gestão Multi-Bankroll
- Bankrolls independentes com moedas próprias
- Transferências entre bankrolls com tracking de rollover de bónus
- Saldos por bookmaker (cash + free bets separados)
- Ledger de transações para auditoria

### Import/Export CSV
- Mapeamento de colunas CSV para campos internos
- Validação com log de erros linha-a-linha
- Export completo em JSON/CSV

### Perfil & Segurança
- Autenticação JWT (access + refresh tokens, cookies HttpOnly)
- 2FA (TOTP)
- Exportação total de dados

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS v4 |
| Charts | Recharts |
| Backend | Express 5 + TypeScript, Node.js ≥20 |
| Base de Dados | PostgreSQL |
| Auth | JWT + bcrypt |
| OCR/IA | Google Gemini 3.1 Flash Lite |

---

## Instalação

**Pré-requisitos:** Node.js ≥ 20, PostgreSQL ≥ 16, chave de API do Google AI Studio

```bash
git clone <repo-url>
cd betlogic
npm install
cp .env.example .env   # preencher DATABASE_URL, JWT_SECRET, GEMINI_API_KEY
psql "$DATABASE_URL" -f tables.sql
npm run dev             # http://localhost:3000
```

Build e produção:
```bash
npm run build
npm start                # PORT=3001 por defeito
```

Deploy testado no **Render** (Web Service + PostgreSQL gerido), mas funciona em qualquer plataforma Node com PostgreSQL.

---

## Estrutura do Projeto

```
betlogic/
├── server/          # API Express (auth, bets, analytics, bankrolls, bookmakers...)
├── src/
│   ├── components/  # UI React, um componente por ecrã/feature
│   ├── utils/        # API client, cálculos financeiros, datas
│   └── types.ts      # Tipos partilhados
├── tables.sql        # Schema PostgreSQL
└── server.ts          # Entry point (dev + prod)
```

---

## API — principais grupos de endpoints

- `/auth` — registo, login, refresh, 2FA
- `/bets` — CRUD de apostas e legs, atualização de status
- `/analytics` — ROI, margens, streaks, heatmap, calendário
- `/bankrolls` — CRUD, transações, reordenação
- `/bookmakers` — CRUD, saldos, margens
- `/bankroll-transfers` — transferências entre bankrolls
- `/scan-betslip` — upload de imagem → JSON estruturado via Gemini

---

## Base de Dados

Tabelas principais: `users`, `bankrolls`, `bookmakers`, `bankroll_bookmaker_balances`, `bets`, `bet_legs`, `bankroll_transfers`, `bankroll_transactions`, `tag_definitions`, `tipsters`.

Valores monetários em `DECIMAL(15,2)`, odds em `DECIMAL(10,4)`, UUIDs como chave primária.

---

## Licença

Projeto pessoal — código disponível para consulta, uso comercial não autorizado.
