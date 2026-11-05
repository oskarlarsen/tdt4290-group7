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
    // Each label appears once as a choice and once as a tag on a note.
    expect(screen.getAllByText("Internal note")).toHaveLength(2);
    expect(screen.getAllByText("Note to self")).toHaveLength(2);
    expect(screen.getByText("Notes are never shown to the supplier.")).toBeTruthy();
  });

  it("saves a note to self by default and an internal note when chosen first", async () => {
    vi.spyOn(notesApi, "getSupplierNotes").mockResolvedValue([]);
    const add = vi.spyOn(notesApi, "addSupplierNote").mockResolvedValue(note("n3", "SELF", "x"));
    mountDrawer();

    const box = await screen.findByPlaceholderText("Add a note about this supplier…");
    fireEvent.change(box, { target: { value: "  First  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0][2]).toEqual({ text: "First", visibility: "SELF" });

    fireEvent.click(screen.getByRole("radio", { name: "Internal note" }));
    fireEvent.change(box, { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
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
    fireEvent.change(screen.getByLabelText(/Alert Title/), { target: { value: "Follow up" } });
    fireEvent.change(screen.getByLabelText(/^Supplier/), { target: { value: supplier.id } });
    fireEvent.change(screen.getByLabelText(/^Risk Category/), { target: { value: "VEHICLE_COMPLIANCE" } });
    fireEvent.change(screen.getByLabelText(/^Risk \*/), { target: { value: "medium" } });
    fireEvent.change(screen.getByLabelText(/^Alert Type/), { target: { value: "CONFIRMED_DEVIATION" } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Check the vehicles" } });
    return onCreate;
  }

  it("passes the note along only when the box is ticked", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toBeUndefined();
  });

  it("sends the trimmed note when the box is ticked", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("checkbox", { name: "Save a note to self" }));
    fireEvent.change(screen.getByLabelText(/^Note to self/), { target: { value: "  Call on Monday " } });
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][1]).toBe("Call on Monday");
  });

  it("asks for the note text when the box is ticked but empty", async () => {
    const onCreate = fillAlert();
    fireEvent.click(screen.getByRole("checkbox", { name: "Save a note to self" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));
    expect(await screen.findByText(/Write the note, or untick/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
