#!/usr/bin/env node
// A small, readable data set for the customer user test: three suppliers that each show something different.
// It only calls the public API (the admin acts on behalf of the supplier for the reports), so the app shows it
// exactly like real data. Run it against a fresh dev database.
//
//   SEED_ADMIN_PASSWORD=... SEED_SUPPLIER_PASSWORD=... node scripts/seed-usertest-data.mjs [http://localhost:8080]
//
// SEED_SUPPLIER_PASSWORD becomes the password of the supplier test login (nordvik.kontakt@example.test).
// Safe to run twice: a supplier that already exists (same name) is left alone.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const supplierPassword = process.env.SEED_SUPPLIER_PASSWORD;
if (!adminPassword || !supplierPassword) { console.error("Set SEED_ADMIN_PASSWORD and SEED_SUPPLIER_PASSWORD."); process.exit(1); }

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
const year = new Date().getFullYear();

// What each supplier is there to show. Registration numbers are made up, so Statens vegvesen cannot confirm them:
// the vehicle checks then say 'could not verify'. Put real plates here (and in the plan) if you want real lookups.
const SUPPLIERS = [
  { // the main one: approved list, reported vehicles with one deviation, energy that is slightly behind its promise
    name: "Nordvik Transport AS", org: "912345671", saksnr: `${year}/0101`, start: -365, end: 700, maxVehicles: 6, energy: true,
    approved: ["NV10001", "NV10002", "NV10003"], planned: 1,
    reported: ["NV10001", "NV10002", "NV10099"], // NV10099 is not on the list: a deviation to handle
    certificate: "01-iso-14001-valid.pdf",
    commitment: { minSelfProducedKwh: 250000, minGooKwh: 300000 },
    quarters: [1, 2, 3], // each: 50 000 kWh self-produced, 60 000 kWh covered by guarantees of origin
  },
  { // an agreement that ends soon and a certificate that expires soon: low risk, nothing else
    name: "Fjord Buss og Taxi AS", org: "912345673", saksnr: `${year}/0102`, start: -400, end: 20, maxVehicles: 8, energy: false,
    approved: [], planned: 0, reported: [], // no vehicles on purpose: keeps this supplier simple
    certificate: "03-gront-punkt-expiring-60d.pdf",
  },
  { // energy promised but nothing reported yet, and an expired certificate: medium risk
    name: "Grønn Logistikk AS", org: "912345675", saksnr: `${year}/0103`, start: -200, end: 500, maxVehicles: 3, energy: true,
    approved: [], planned: 0, reported: [],
    certificate: "05-eco-driving-expired.pdf",
    commitment: { minSelfProducedKwh: 120000, minGooKwh: 150000 },
  },
];

async function uploadCsv(entity, supplierId, csv, name) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), name);
  const preview = await api(`/onboarding/upload/${entity}/preview?supplierId=${supplierId}`, { form });
  if (!preview.canCommit) throw new Error(`${entity} not importable: ${JSON.stringify(preview.errors.slice(0, 2))}`);
  await api(`/onboarding/upload/${entity}/confirm?supplierId=${supplierId}`, { json: { batchId: preview.batchId } });
}

await api("/auth/login", { json: { email: "advisor.hansen@kommune.no", password: adminPassword } });
const fleet = await api("/vehicle-fleet");
for (const s of SUPPLIERS) {
  if (fleet.suppliers.some((x) => x.name === s.name)) { console.log(`= ${s.name} (already there)`); continue; }
  const supplier = await api("/vehicle-fleet/suppliers", { json: { name: s.name, orgNumber: s.org } });
  const agreement = await api("/vehicle-fleet/agreements", { json: {
    supplierId: supplier.id, saksnr: s.saksnr, startDate: day(s.start), endDate: day(s.end), allowedVehicles: s.maxVehicles,
    note: "Brukertest", requiresVehicles: !s.energy || s.approved.length > 0 || s.planned > 0, requiresEnergy: s.energy, requiresProducts: false,
  } });
  for (const registrationNumber of s.approved) await api(`/vehicle-fleet/agreements/${agreement.id}/vehicles`, { json: { registrationNumber } });
  for (let i = 0; i < s.planned; i++) await api(`/vehicle-fleet/agreements/${agreement.id}/vehicles`, { json: { planned: true } });

  if (s.reported.length) {
    const header = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes";
    await uploadCsv("vehicles", supplier.id, [header, ...s.reported.map((p) => `${agreement.id},${p},FALSE,2,FALSE,TRUE,,,,Brukertest`)].join("\n"), "kjoretoy.csv");
  }
  if (s.energy && s.quarters) {
    const header = "agreement_id,facility_location_code,facility_address,storage_area_sqm,workshop_area_sqm,other_area_sqm,reporting_year,reporting_quarter,electricity_kwh,district_heating_kwh,biogas_kwh,fossil_fuel_kwh,self_produced_solar_kwh,self_produced_heatpump_kwh,goo_covered_kwh,notes";
    const rows = s.quarters.map((q) => `${agreement.id},NV-LAGER-1,Havnegata 1 Trondheim,2000,800,200,${year},${q},150000,40000,0,0,30000,20000,60000,Brukertest`);
    await uploadCsv("energy", supplier.id, [header, ...rows].join("\n"), "energi.csv");
  }
  if (s.commitment) await api(`/admin/energy/${agreement.id}/commitment`, { method: "PUT", json: s.commitment });

  const form = new FormData();
  form.append("supplierName", s.name);
  form.append("contractId", agreement.id);
  form.append("file", new Blob([await readFile(fileURLToPath(new URL(`../sample-certificates/${s.certificate}`, import.meta.url)))], { type: "application/pdf" }), s.certificate);
  await api("/certificates", { form }).catch((e) => console.warn(`  sertifikat ${s.certificate}: ${e.message}`));

  if (s.name.startsWith("Nordvik")) {
    // A supplier login to test from the supplier side.
    const invitation = await api(`/vehicle-fleet/suppliers/${supplier.id}/invitations`, { json: { email: "nordvik.kontakt@example.test" } });
    await fetch(`${base}/api/auth/accept-invitation`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: invitation.token, newPassword: supplierPassword, name: "Nordvik Kontakt" }),
    }).then((r) => { if (!r.ok) throw new Error(`accept-invitation -> ${r.status}`); });
  }
  console.log(`+ ${s.name}`);
}
await api("/admin/dashboard/summary").catch(() => {}); // builds the alerts from the data above
console.log("Ferdig. Leverandørlogin: nordvik.kontakt@example.test (passord = SEED_SUPPLIER_PASSWORD).");
