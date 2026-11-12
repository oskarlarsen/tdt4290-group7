#!/usr/bin/env node
// Fills a running backend with a lot of demo data (suppliers, agreements, planned vehicles, certificates,
// alerts, notes) through the public API, so every page shows it the same way real data would appear.
// Run it only against a dev database. Without it, the app shows only what was really entered.
//
//   SEED_ADMIN_PASSWORD=... node scripts/seed-demo-data.mjs [http://localhost:8080]
//
// Safe to run twice: suppliers that already exist (same name) are left as they are.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const password = process.env.SEED_ADMIN_PASSWORD;
if (!password) { console.error("Set SEED_ADMIN_PASSWORD to the seeded admin password."); process.exit(1); }

let cookie = "";
async function api(path, { json, form, method } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method: method ?? (json || form ? "POST" : "GET"),
    headers: { ...(json ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text.slice(0, 200)}`);
  if (path === "/auth/login") cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return text ? JSON.parse(text) : null;
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// start/end are days from today; the mix covers active, expiring soon and expired agreements.
const SUPPLIERS = [
  { name: "Nordic Transport AS", org: "912345671", start: -300, end: 700, vehicles: 6, planned: 2, flags: [true, false, false] },
  { name: "Trondheim Renovasjon AS", org: "912345672", start: -200, end: 60, vehicles: 4, planned: 0, flags: [true, true, false] },
  { name: "Fjord Buss og Taxi AS", org: "912345673", start: -400, end: 20, vehicles: 8, planned: 0, flags: [true, false, false] },
  { name: "Midtnorsk Bygg AS", org: "912345674", start: -90, end: 900, vehicles: 5, planned: 3, flags: [true, true, true] },
  { name: "Grønn Logistikk AS", org: "912345675", start: -500, end: -10, vehicles: 3, planned: 0, flags: [true, false, false] },
  { name: "Bymiljø Drift AS", org: "912345676", start: -30, end: 1000, vehicles: 10, planned: 4, flags: [true, false, true] },
  { name: "Sør-Trøndelag Maskin AS", org: "912345677", start: -250, end: 400, vehicles: 4, planned: 1, flags: [false, true, false] },
  { name: "Ren Energi Transport AS", org: "912345678", start: -120, end: 500, vehicles: 7, planned: 2, flags: [true, true, false] },
];
// [supplier index, sample PDF]; the sample files cover valid, expiring, critical, expired and unrecognized.
const CERTIFICATES = [
  [0, "01-iso-14001-valid.pdf"], [1, "03-gront-punkt-expiring-60d.pdf"], [2, "02-miljofyrtarn-critical.pdf"],
  [3, "04-retura-expiring-150d.pdf"], [4, "05-eco-driving-expired.pdf"], [5, "06-unrecognized-missing-expiry.pdf"],
  [5, "01-iso-14001-valid.pdf"], [7, "03-gront-punkt-expiring-60d.pdf"],
];
const ALERTS = [
  [0, "Registry mismatch on two vehicles", "VEHICLE_COMPLIANCE", "high", "CONFIRMED_DEVIATION", "Two registered vehicles do not match the agreed fuel type."],
  [1, "Fuel report missing for Q3", "ENERGY_FUEL", "medium", "MISSING_DOCUMENTATION", "No fuel consumption report has been received for the latest quarter."],
  [2, "Environmental certificate expiring", "CERTIFICATES", "high", "UPCOMING_EXPIRY", "The certificate expires within the next weeks."],
  [3, "Planned vehicles not yet registered", "VEHICLE_COMPLIANCE", "low", "MISSING_DOCUMENTATION", "Three planned vehicles still lack a registration number."],
  [4, "Agreement has ended", "ENVIRONMENTAL_COMPLIANCE", "medium", "CONFIRMED_DEVIATION", "The agreement ended without a renewal."],
  [5, "Renewable share below requirement", "ENERGY_FUEL", "medium", "CONFIRMED_DEVIATION", "Reported energy use is below the agreed renewable share."],
];

// The admin's approved list: being on it is what approves a vehicle. Registry details are fetched when a key is
// configured; without one the plates are still added. Reg.nrs are made up.
const APPROVED = [[0, ["AB12345", "AB12346", "AB12347"]], [1, ["CD23451", "CD23452", "CD23453", "CD23454"]]];
// Vehicles the supplier reports as used. Plates on the list are approved; the others are deviations.
// The second supplier reports 5 vehicles against a maximum of 4.
const REPORTED = [[0, ["AB12345", "AB12346", "AB12399"]], [1, ["CD23451", "CD23452", "CD23453", "CD23454", "CD23455"]]];
// Reported vehicles not on the list that the admin has approved as one-off exceptions, with a note for the supplier.
const EXCEPTIONS = [["CD23455", "Approved for the winter period while the new vehicles are delivered."]];

await api("/auth/login", { json: { email: "advisor.hansen@kommune.no", password } });
const fleet = await api("/vehicle-fleet");
const ids = [];
for (const [index, s] of SUPPLIERS.entries()) {
  const existing = fleet.suppliers.find((x) => x.name === s.name);
  if (existing) { ids[index] = { supplier: existing.id, agreement: fleet.agreements.find((a) => a.supplierId === existing.id)?.id, existed: true }; continue; }
  const supplier = await api("/vehicle-fleet/suppliers", { json: { name: s.name, orgNumber: s.org } });
  const agreement = await api("/vehicle-fleet/agreements", { json: {
    supplierId: supplier.id, saksnr: `2026/${String(100 + index).padStart(4, "0")}`, startDate: day(s.start), endDate: day(s.end),
    allowedVehicles: s.vehicles, note: "Demo agreement", requiresVehicles: s.flags[0], requiresEnergy: s.flags[1], requiresProducts: s.flags[2],
  } });
  for (let i = 0; i < s.planned; i++) await api(`/vehicle-fleet/agreements/${agreement.id}/vehicles`, { json: { planned: true } });
  ids[index] = { supplier: supplier.id, agreement: agreement.id };
  console.log(`+ ${s.name}`);
}

for (const [index, plates] of APPROVED) {
  if (ids[index].existed) continue;
  for (const registrationNumber of plates) await api(`/vehicle-fleet/agreements/${ids[index].agreement}/vehicles`, { json: { registrationNumber } });
}
for (const [index, plates] of REPORTED) {
  const target = ids[index];
  if (target.existed || !target.agreement) continue;
  const csv = ["agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes",
    ...plates.map((plate) => `${target.agreement},${plate},FALSE,2,FALSE,TRUE,,,,Demo`)].join("\n");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "vehicles.csv");
  const preview = await api(`/onboarding/upload/vehicles/preview?supplierId=${target.supplier}`, { form }).catch((e) => console.warn(`  reported vehicles: ${e.message}`));
  if (preview?.canCommit) await api(`/onboarding/upload/vehicles/confirm?supplierId=${target.supplier}`, { json: { batchId: preview.batchId } });
  else if (preview) console.warn(`  reported vehicles not imported: ${JSON.stringify(preview.errors.slice(0, 2))}`);
}
for (const [plate, note] of EXCEPTIONS) await api(`/vehicle-fleet/vehicles/${plate}/exception`, { json: { note } }).catch((e) => console.warn(`  exception ${plate}: ${e.message}`));
for (const [index, file] of CERTIFICATES) {
  const target = ids[index];
  if (target.existed || !target.agreement) continue;
  const form = new FormData();
  form.append("supplierName", SUPPLIERS[index].name);
  form.append("contractId", target.agreement);
  form.append("file", new Blob([await readFile(fileURLToPath(new URL(`../sample-certificates/${file}`, import.meta.url)))], { type: "application/pdf" }), file);
  await api("/certificates", { form }).catch((e) => console.warn(`  certificate ${file}: ${e.message}`));
}
for (const [index, title, category, severity, findingType, description] of ALERTS) {
  if (ids[index].existed) continue;
  await api("/admin/alerts", { json: { title, supplierId: ids[index].supplier, category, severity, findingType, description, dueDate: day(14) } });
  await api(`/admin/suppliers/${ids[index].supplier}/notes`, { json: { text: `Follow-up agreed on: ${title}.`, visibility: "INTERNAL" } }).catch(() => {});
}
console.log(`Done. ${ids.filter((x) => !x.existed).length} suppliers added, ${ids.filter((x) => x.existed).length} already present.`);
