import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleDialog, primaryClass } from "../src/components/vehicles/VehicleDialog";
import { ApprovalBadge } from "../src/components/vehicles/VehicleTable";

describe("vehicle presentation", () => {
  it("explicitly centers action dialogs with viewport gutters and scroll limits", () => {
    const html = renderToStaticMarkup(<VehicleDialog title="Synthetic form" onClose={() => {}}>Form fields</VehicleDialog>);
    expect(html).toContain("inset-0 m-auto h-fit");
    expect(html).toContain("max-h-[calc(100dvh_-_2rem)]");
    expect(html).toContain("w-[calc(100%_-_2rem)]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('aria-label="Synthetic form"');
    expect(html).toContain('aria-label="Close Synthetic form"');
  });

  it("retains the right-hand details drawer instead of centering it", () => {
    const html = renderToStaticMarkup(<VehicleDialog title="Synthetic details" drawer onClose={() => {}}>Details</VehicleDialog>);
    expect(html).toContain("inset-y-0 left-auto right-0 m-0");
    expect(html).not.toContain("inset-0 m-auto");
  });

  it("uses one unambiguous primary action color and the shared approval badge", () => {
    expect(primaryClass).toContain("bg-primary-900");
    expect(primaryClass).not.toContain("bg-white");
    const html = renderToStaticMarkup(<ApprovalBadge status="ACTIVE" />);
    expect(html).toContain("bg-tertiary-100");
    expect(html).toContain("font-mono");
    expect(html).toContain("Approved");
  });
});
