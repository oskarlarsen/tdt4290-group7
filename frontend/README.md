# Miljøoppfølging — Frontend

React + TypeScript + Vite skeleton for the Trondheim kommune environmental
monitoring dashboard (TDT4290).

## Getting started
    npm install
    cp .env.example .env
    npm run dev

## Structure
See `/src` — pages are split by role (`pages/admin`, `pages/supplier`),
shared UI in `components/ui`, domain components in `components/vehicles`,
`components/certificates`, `components/risk`, `components/alerts`.
Mock API data lives in `src/mocks` until real backend/external API access
is confirmed.
