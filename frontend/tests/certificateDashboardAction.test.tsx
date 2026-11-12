// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { QuickActions } from "../src/components/ui/QuickActions";

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

describe("dashboard certificate action", () => {
  it("opens the certificate page with the PDF upload dialog requested", () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <QuickActions />
        <CurrentLocation />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Legg til leverandørsertifikat" }));
    expect(screen.getByTestId("location").textContent).toBe("/admin/certificates?upload=true");
  });
});
