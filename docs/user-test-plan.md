# User test plan: customer session (2 hours)

Goal: let the customer try the most important flows (approved vehicle list, supplier reporting, energy, certificates, risk) on a small, clear data set, and use the rest of the time to discuss the project. Nothing in this plan needs new functionality; it only uses the app as it is plus the seed script.

## 0. Before the meeting (you, about 15 minutes)

1. Fresh database and start the app: `docker compose down -v && docker compose up -d --build --wait` (uses your `.env`).
2. Load the test data: `SEED_ADMIN_PASSWORD=<admin pw> SEED_SUPPLIER_PASSWORD=<supplier pw> node scripts/seed-usertest-data.mjs` (run from the repo root; it prints `+ <supplier>` three times and "Ferdig").
3. Open two browsers/profiles: **Admin** at http://localhost:3000 and **Supplier** at http://127.0.0.1:3001 if you started the supplier frontend, otherwise a private window on the same address (log in/out between roles).
4. Logins: admin `advisor.hansen@kommune.no` with `SEED_ADMIN_PASSWORD`; supplier `nordvik.kontakt@example.test` with `SEED_SUPPLIER_PASSWORD`.
5. Walk through section 4 yourself once. Reset with step 1 + 2 again when you are done (data takes about 20 seconds to load).
6. Have the files ready: `sample-certificates/02-miljofyrtarn-critical.pdf` and `06-unrecognized-missing-expiry.pdf` (for the certificate upload task).

Note: the registration numbers are made up, so Statens vegvesen cannot confirm them. Vehicle checks therefore show "Kunne ikke kontrolleres" (that is why Nordvik has three such alerts). Tell the customer this up front. If you want real lookups, put real plates in the lists at the top of the seed script.

## 1. The data the customer will see

| Supplier | Agreement | What it shows |
|---|---|---|
| **Nordvik Transport AS** (the main one) | 2026/0101, vehicles + energy, max 6 vehicles | Approved list NV10001, NV10002, NV10003 + one planned vehicle. The supplier has reported NV10001, NV10002 and **NV10099 (not on the list = deviation)**. Energy for 1.–3. kvartal 2026, promise 250 000 kWh self-produced / 300 000 kWh GoO, so status **Fare for avvik**. Valid ISO 14001 certificate. Has a supplier login. Risk: **High**. |
| **Fjord Buss og Taxi AS** | 2026/0102, ends in 20 days | No vehicles on purpose. Grønt Punkt certificate that expires in about 45 days. Risk: **Low**. |
| **Grønn Logistikk AS** | 2026/0103, energy only | Energy promised (120 000 / 150 000 kWh) but nothing reported = **Mangler data**. Expired "Kurs i økonomisk kjøring" certificate. Risk: **Medium**. |

## 2. Time plan

| Time | What |
|---|---|
| 0:00–0:10 | Welcome. Explain the problem areas 1–5 from their deck in one sentence each and what the app covers. Say what is out of scope (CO2, Problem 6). |
| 0:10–0:35 | **Part A, admin:** overview, suppliers, risk (tasks A1–A4). You drive, they watch and comment. |
| 0:35–1:05 | **Part B, approved vehicle list and exceptions (admin):** the customer drives (tasks B1–B5). |
| 1:05–1:30 | **Part C, supplier side:** the customer logs in as the supplier and reports (tasks C1–C6). |
| 1:30–1:40 | **Part D, certificates and energy (admin):** tasks D1–D3. |
| 1:40–1:50 | **Free exploring:** the customer tries anything (section 5). |
| 1:50–2:00 | Wrap-up and next steps. |

Discussion questions (section 6) can be asked at the end of each part; do not save them all for the end.

## 3. Tasks for the customer

Each task says what to do and what they should see. Menu names are the Norwegian ones in the app.

### Part A: admin overview (you drive)
- **A1. Dashbord.** Show the portfolio numbers, the risk bar and "Leverandører som krever oppfølging". *See:* 3 suppliers: Nordvik High, Grønn Medium, Fjord Low.
- **A2. Leverandører.** Click the **Høy risiko** card, then click it again. Sort by the **Risiko** header. Open Nordvik with **Vis detaljer**. *See:* the table filters, Nordvik shows "poengsum 16"; the drawer lists the findings.
- **A3. Risiko og prediksjon.** Open it and open Nordvik. *See:* the same level as on the supplier list, with the reasons (energy forecast, vehicle checks).
- **A4. Varslinger.** Open the list and one alert. *See:* 6 alerts: energy at risk, certificate expired/expiring, 3 "Kunne ikke kontrolleres" for the vehicles.

### Part B: approved vehicle list (the customer drives)
- **B1. Add a vehicle to the approved list.** Kjøretøy → Nordvik's agreement → **Legg til kjøretøy** → `NV10004`. *See:* the vehicle appears on the list (3 → 4 of max 6).
- **B2. Add several at once.** **Legg til flere** → `NV10005` and `NV10006`. *See:* both added; the limit of 6 now blocks more.
- **B3. Planned vehicle.** On the planned vehicle press **Registrer kjøretøy** and enter `NV10007`... *only if there is room:* first remove NV10006 with **Fjern**. *See:* the planned row becomes a real registration number.
- **B4. Deviation from the supplier.** Find the reported vehicle **NV10099** (not on the list). Either press **Godkjenn unntak** (add a note) or add `NV10099` to the list. *See:* the deviation disappears from the vehicle's check and the supplier sees "Godkjent som unntak" or "På listen".
- **B5. Undo.** Open **Endringshistorikk** and undo the last change. *See:* the change is reversed and the history shows both steps.

### Part C: supplier (the customer logs in as the supplier)
- **C1. Påkrevde tiltak.** *See:* a plain-language to-do list (for example submit the registration, report vehicles).
- **C2. Mine kjøretøy.** *See:* "Godkjente kjøretøy" (the agreed list) and "Kjøretøy du har rapportert" with NV10099's status.
- **C3. Report a vehicle.** Press **Legg til eller oppdater kjøretøy** → fill in the form with `NV10008`, choose a fuel type → **Gjennomgå** → **Bekreft import**. *See:* it shows under "rapportert" and as "Ikke på listen: avvik" until the administrator handles it. (Statens vegvesen cannot find made-up plates; the supplier is told to fill in the fuel themselves.)
- **C4. Energy.** Energi → see the promise (250 000 kWh) against what was delivered and the status. Press **Rapporter eller oppdater et kvartal**, fill in 4. kvartal (or re-enter an existing quarter to see the "erstatter eksisterende rapport" notice) and confirm. *See:* the new quarter in the list and a changed forecast.
- **C5. Certificate.** Sertifikater → **Last opp** → `06-unrecognized-missing-expiry.pdf`. *See:* a card "Dokumentasjon mangler" and a new item under Påkrevde tiltak.
- **C6. Send in.** Complete the missing steps and **Send inn registreringen**. *See:* status "Innsendt". Notice that energy can still be reported afterwards.

### Part D: admin again
- **D1. Sertifikater.** Press the **Kritisk / utløpt** card, then **Last opp** `02-miljofyrtarn-critical.pdf` to Fjord. *See:* the filter works; the new certificate shows as critical (orange) and sorts first. Archive one and press **Angre**.
- **D2. Energi.** Open Nordvik. Change the promise from 250 000 to 150 000 kWh and save. *See:* the status turns **Ingen avvik** and the supplier risk drops. Open Grønn Logistikk (Mangler data) and press its **Send melding** button only if you want to show the message dialog (do not send during the test).
- **D3. Back to Leverandører.** *See:* Nordvik's risk and score changed after D1/D2/B4. Use this to talk about how the score is built (10 / 4 / 1 points).

## 4. Your own pre-check (10 minutes)
Do B1, B4, C3, C4 and D2 once. After each, reload the page and make sure the number you changed is the same on the Dashbord, Leverandører and Risiko pages.

## 5. Things the customer may try (and what happens)
- **Open an admin page as the supplier** (type `/admin/dashboard` in the address bar): "Ingen tilgang". And an unknown address: "Siden ble ikke funnet".
- **Log out and back in; wrong password:** a clear error message. **Glemt passord:** a code is prepared but no e-mail is sent (not set up yet, say so).
- **Search in the top bar** (supplier or alert names): opens the supplier list on that organisation.
- **Bell:** shows new alerts and messages.
- **Browser back/refresh, direct links** (for example `/admin/suppliers?risk=high`): work.
- **Export / CSV buttons:** download a file; the "Send melding" buttons only open a draft dialog (no message is sent).
- **Narrow window / phone:** works but is not tuned.
- **Settings menu:** appearance only; the app is Norwegian only.
- **Try to add more than 6 vehicles, enter a bad registration number, or an energy value below zero:** each gives a clear message next to the field.

## 6. Questions to discuss with the customer
1. **Risk:** the score adds points per finding (vehicle/energy deviation 10, expired certificate 4, expiring certificate 1; high risk from 10, medium from 4). Does this match how they prioritise? Should an expired certificate count more?
2. **Energy:** the forecast is a straight line from the reported quarters (it ignores solar seasonality). Good enough, or do they have a better rule? Should GoO above total energy be blocked or only warned about?
3. **Approved list:** is it right that only the administrator puts a vehicle on the list and the supplier only reports? Is the "exception" step (with a note) how they work today?
4. **Certificates:** are the 30/90/180 day steps right? They want reminders at 6, 3 and 1 months: not sent yet. Who should receive them (supplier, contract manager, both)?
5. **Messages to suppliers:** is "Send melding" the right word and channel (e-mail, in-app)?
6. **Data in:** where does the data come from in real life (Mercell exports, Excel sheets, Vegvesen API)? Which import formats must we support first?
7. **Roles:** only administrator and supplier today. Do they need a read-only role, or contract managers per agreement?
8. **Prediction (deck Problem 1):** what would "probability of a breach" need to be useful, and what history do they have?
9. **Scope:** CO2 ranking (Problem 6) next, or polish and import first?
10. **Rollout:** who will use it first, who owns the data, and what do they need for a pilot (hosting, login, support)?

## 7. Known limits (say them before they hit them)
- Made-up plates cannot be verified by Statens vegvesen. Without an API key the vehicle checks always say "could not verify".
- No e-mail is sent (reset codes, reminders, messages).
- Prediction is a straight-line forecast, not a model.
- Only the energy part keeps accepting reports after submission; vehicles and products lock until the administrator reviews.
- The app is in Norwegian only; a few registry values (for example the raw Vegvesen status text) stay as they come from the source.

## 8. Notes during the session
Keep a simple table: **Page / what they did / what they said / change request (must, should, nice)**. Take screenshots of anything confusing.
