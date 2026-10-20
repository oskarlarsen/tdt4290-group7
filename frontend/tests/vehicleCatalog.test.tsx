import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../src/utils/vehicleCatalog";
import { StatisticsForm } from "../src/components/vehicles/VehicleForms";
import { CatalogSelect, RegistrationNumberInput } from "../src/components/vehicles/VehicleInputs";

describe("official vehicle catalogues and required form inputs", () => {
  it("keeps backend and frontend official codes and English labels in sync", () => {
    const kotlin = readFileSync(new URL("../../backend/src/main/kotlin/com/tdt4290group7/backend/vehicles/VehicleCatalog.kt", import.meta.url), "utf8");
    const fuels = Object.fromEntries([...kotlin.matchAll(/@SerialName\("([^"]+)"\) \w+\("[^"]+", "([^"]+)"\)/g)].map(match => [match[1], match[2]]));
    fuels.NOT_APPLICABLE = "Not applicable - unpowered trailer";
    expect(FUEL_TECHNOLOGIES).toEqual(fuels);
    const categories = kotlin.slice(kotlin.indexOf("enum class VehicleCategory"), kotlin.indexOf("enum class BodyType"));
    const bodies = kotlin.slice(kotlin.indexOf("enum class BodyType"), kotlin.indexOf("internal fun fuelCode"));
    for (const [source, catalog] of [[categories, VEHICLE_CATEGORIES], [bodies, BODY_TYPES]] as const)
      expect(catalog).toEqual(Object.fromEntries([...source.matchAll(/\b([A-Z][A-Z0-9_]*)\("([^"]+)"\)/g)].map(match => [match[1], match[2]])));
    expect(Object.keys(fuels).filter(code => /^\d+$/.test(code))).toHaveLength(15);
    expect(fuels["21"]).toBe("LNG"); expect(fuels["22"]).toBeUndefined();
    expect(Object.keys(VEHICLE_CATEGORIES).some(code => code.endsWith("G"))).toBe(false);
  });

  it("shows code plus English label and an explicitly local trailer sentinel", () => {
    expect(catalogLabel(FUEL_TECHNOLOGIES, "7")).toBe("7 - Gasoline hybrid");
    expect(catalogLabel(FUEL_TECHNOLOGIES, "8")).toBe("8 - Diesel hybrid");
    expect(catalogLabel(BODY_TYPES, "AC")).toBe("AC - Station wagon");
    expect(catalogLabel(FUEL_TECHNOLOGIES, "NOT_APPLICABLE")).toBe("Not applicable - unpowered trailer");
    const html = renderToStaticMarkup(<CatalogSelect catalog={FUEL_TECHNOLOGIES} value="" onChange={() => {}} />);
    expect(html).toContain("7 - Gasoline hybrid"); expect(html).toContain("8 - Diesel hybrid");
    expect(html).not.toContain("unpowered trailer");
  });

  it("applies the same full-plate pattern without silently truncating", () => {
    const html = renderToStaticMarkup(<RegistrationNumberInput value="AB1234" onChange={() => {}} />);
    expect(html).toContain('pattern="[A-Z]{2}[1-9][0-9]{3,4}"');
    expect(html).toContain('autoCapitalize="characters"'); expect(html).not.toContain("maxLength");
  });

  it("starts with the reporting summary and groups technical inputs under details", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StatisticsForm onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>);
    expect(html).toContain("Add reporting statistics"); expect(html).toContain("Reporting period start");
    expect(html.indexOf("Estimated CO\u2082")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("NOx-registered distance")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain("Vehicle, fuel and NOx details"); expect(html).not.toContain("Median");
    expect(html).not.toContain("Source / reference"); expect(html).toContain("Save and check");
  });
});
