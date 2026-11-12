// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierDetailsDrawer } from "../src/components/suppliers/SupplierDetailsDrawer";
import { CreateManualAlertDialog } from "../src/components/alerts/CreateManualAlertDialog";
import * as notesApi from "../src/api/notes";
import type { SupplierNote, TopRiskSupplier } from "../src/types/dashboard";

vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-1", name: "Test admin" } }) }));

const supplier: TopRiskSupplier = {
  id: "supplier-1", displayName: "Nordvik Transport AS", orgId: "987654321", primaryContract: "2024/1234",
  risk: "medium", mainIssue: "Vehicle check required",
};

const note = (id: string, visibility: SupplierNote["visibility"], text: string): SupplierNote => ({
  id, supplierId: supplier.id, authorId: "admin-1", authorName: "Test admin", visibility, text, alertId: null, createdAt: "2026-10-01T10:00:00Z",
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mountDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SupplierDetailsDrawer supplier={supplier} alerts={[]} reviewStatus="to-review" onChangeReviewStatus={vi.fn()} onOpenDetails={vi.fn()} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("supplier notes in the drawer", () => {
  it("tags each note and says suppliers never see them", async () => {
    vi.spyOn(notesApi, "getSupplierNotes").mockResolvedValue([note("n1", "INTERNAL", "Shared"), note("n2", "SELF", "Mine")]);
    mountDrawer();
    expect(await screen.findByText("Shared")).toBeTruthy();
    // The choices carry a hint ("Internt notat (alle administratorer)"); the exact label appears only as the tag on a note.
    expect(screen.getAllByText("Internt notat")).toHaveLength(1);
    expect(screen.getAllByText("Notat til meg selv")).toHaveLength(1);
    expect(screen.getByText("Leverandøren ser ikke dette notatet.")).toBeTruthy();
  });

  it("saves a note to self by default and an internal note when chosen first", async () => {
    vi.spyOn(notesApi, "getSupplierNotes").mockResolvedValue([]);
    const add = vi.spyOn(notesApi, "addSupplierNote").mockResolvedValue(note("n3", "SELF", "x"));
    mountDrawer();

    const box = await screen.findByPlaceholderText("Legg til et notat om denne leverandøren…");
    fireEvent.change(box, { target: { value: "  First  " } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til notat" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][2]).toEqual({ text: "First", visibility: "SELF" });

    fireEvent.click(screen.getByRole("radio", { name: "Internt notat (alle administratorer)" }));
    fireEvent.change(box, { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til notat" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(add.mock.calls[1][2]).toEqual({ text: "Second", visibility: "INTERNAL" });
  });
});

describe("manual alert dialog note to self", () => {
  function fillAlert() {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateManualAlertDialog open suppliers={[supplier]} onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText(/Tittel på varsel/), { target: { value: "Follow up" } });
    fireEvent.change(screen.getByLabelText(/^Leverandør/), { target: { value: supplier.id } });
    fireEvent.change(screen.getByLabelText(/^Risikokategori/), { target: { value: "VEHICLE_COMPLIANCE" } });
    fireEvent.change(screen.getByLabelText(/^Risiko \*/), { target: { value: "medium" } });
    fireEvent.change(screen.getByLabelText(/^Varseltype/), { target: { value: "CONFIRMED_DEVIATION" } });
    fireEvent.change(screen.getByLabelText(/^Beskrivelse/), { target: { value: "Check the vehicles" } });
    return onCreate;
  }

  it("passes the note along only when the box is ticked", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("button", { name: "Opprett varsel" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toBeUndefined();
  });

  it("sends the trimmed note when the box is ticked", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lagre et notat til meg selv" }));
    fireEvent.change(screen.getByLabelText(/^Notat til meg selv/), { target: { value: "  Call on Monday " } });
    fireEvent.click(screen.getByRole("button", { name: "Opprett varsel" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toBe("Call on Monday");
  });

  it("asks for the note text when the box is ticked but empty", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lagre et notat til meg selv" }));
    fireEvent.click(screen.getByRole("button", { name: "Opprett varsel" }));
    expect(await screen.findByText(/Skriv notatet, eller fjern haken/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
