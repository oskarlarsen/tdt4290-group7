import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleDialog, primaryClass } from "../src/components/vehicles/VehicleDialog";
import { VehicleAllowance } from "../src/components/vehicles/AgreementCard";
import { Field } from "../src/components/vehicles/VehicleDialog";

describe("vehicle presentation", () => {
  it("provides a separate focusable help button and an initially hidden description", () => {
    const html = renderToStaticMarkup(<Field label="Fuel consumption" tooltip="Liter brukt per 100 kilometer"><input disabled value="Not applicable" readOnly /></Field>);
    expect(html).toContain('aria-label="Hjelp for Fuel consumption"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="tooltip" hidden=""');
    expect(html).toContain("Liter brukt per 100 kilometer");
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf("<button"));
    expect(renderToStaticMarkup(<Field label="Vehicle brand"><input /></Field>)).not.toContain("tooltip");
  });
  it("explicitly centers action dialogs with viewport gutters and scroll limits", () => {
    const html = renderToStaticMarkup(<VehicleDialog title="Synthetic form" onClose={() => {}}>Form fields</VehicleDialog>);
    expect(html).toContain("inset-0 m-auto h-fit");
    expect(html).toContain("max-h-[calc(100dvh_-_2rem)]");
    expect(html).toContain("w-[calc(100%_-_2rem)]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('aria-label="Synthetic form"');
    expect(html).toContain('aria-label="Lukk Synthetic form"');
  });

  it("opens spacious centered vehicle details inside the application", () => {
    const html = renderToStaticMarkup(<VehicleDialog title="Vehicle details" wide onClose={() => {}}>Details</VehicleDialog>);
    expect(html).toContain("max-w-5xl"); expect(html).toContain("inset-0 m-auto");
    expect(html).not.toContain("left-auto right-0");
  });
  it("shows only the count in red when an allowance is exceeded", () => {
    const html = renderToStaticMarkup(<VehicleAllowance count={8} allowed={5} />);
    expect(html).toContain("8 av 5 kjøretøy"); expect(html).toContain("text-red-700");
    expect(html).not.toContain("above");
    expect(renderToStaticMarkup(<VehicleAllowance count={5} allowed={5} />)).not.toContain("text-red");
    expect(primaryClass).toContain("bg-primary-900");
  });
});
