import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../src/utils/vehicleCatalog";
import { ApprovalForm, StatisticsForm } from "../src/components/vehicles/VehicleForms";
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
    expect(Object.keys(fuels).filter(code => /^\d+$/.test(code))).toHaveLength(22);
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

  it("renders required statistics openly and keeps comments/references optional", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StatisticsForm onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>);
    expect(html).toContain("Required statistics"); expect(html).not.toContain("Additional statistics (optional)");
    expect(html).toContain("Comment (optional)"); expect(html).toContain("Assignment number / reference (optional)");
    expect(html).toContain("Reported vehicle category *"); expect(html).toContain("Reported body type *");
    expect(html).not.toContain("Not provided</option>");
    expect((html.match(/required=""/g) ?? []).length).toBe(21);
  });

  it("requires typed approval fuel/category without requiring an expiry date", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><ApprovalForm onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>);
    expect(html).toContain("Vehicle category *"); expect(html).toContain("Approved fuel technology *");
    expect(html).toContain("Approved indefinitely"); expect(html).not.toContain('type="date" required');
  });
});
