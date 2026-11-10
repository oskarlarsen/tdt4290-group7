// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AlertDetailsDrawer } from "../src/components/alerts/AlertDetailsDrawer";
import { addManualAlert, getAllAlerts, updateManualAlert } from "../src/mocks/db";
import type { RecentAlert } from "../src/types/dashboard";

const alert = (source: RecentAlert["source"]): RecentAlert => ({
  id: "a1", severity: "medium", title: "Original title", description: "Original text", timeAgo: "1d", createdAt: "2026-10-01T10:00:00Z",
  status: "OPEN", category: "VEHICLE_COMPLIANCE", source, findingType: "CONFIRMED_DEVIATION", supplierId: "s1", dueDate: "2026-12-01",
});

afterEach(cleanup);

function mount(source: RecentAlert["source"], onEdit?: (id: string, changes: unknown) => Promise<void>) {
  render(
    <MemoryRouter>
      <AlertDetailsDrawer row={{ alert: alert(source) }} onClose={vi.fn()} onStatusChange={vi.fn()} onEdit={onEdit as never} isBusy={false} />
    </MemoryRouter>,
  );
}

describe("editing an alert in the drawer", () => {
  it("offers editing for manual alerts only", () => {
    mount("AUTOMATIC", vi.fn());
    expect(screen.queryByRole("button", { name: "Edit alert" })).toBeNull();
    cleanup();
    mount("MANUAL");
    expect(screen.queryByRole("button", { name: "Edit alert" })).toBeNull();
    cleanup();
    mount("MANUAL", vi.fn());
    expect(screen.getByRole("button", { name: "Edit alert" })).toBeTruthy();
  });

  it("saves the trimmed changes, starting from the current values", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);
    mount("MANUAL", onEdit);
    fireEvent.click(screen.getByRole("button", { name: "Edit alert" }));
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Original title");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  New title " } });
    fireEvent.change(screen.getByLabelText("Risk"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText(/Due date/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith("a1", { title: "New title", description: "Original text", severity: "high", dueDate: "" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull());
  });

  it("keeps the form open and shows the server's reason when saving fails", async () => {
    mount("MANUAL", vi.fn().mockRejectedValue(new Error("Alert title must be between 1 and 200 characters")));
    fireEvent.click(screen.getByRole("button", { name: "Edit alert" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Alert title must be between 1 and 200 characters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("refuses an empty title without calling the server", async () => {
    const onEdit = vi.fn();
    mount("MANUAL", onEdit);
    fireEvent.click(screen.getByRole("button", { name: "Edit alert" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Title and description are required.")).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("mock alert editing", () => {
  it("edits a manual alert and clears its due date, but refuses an automatic one", () => {
    const created = addManualAlert({
      title: "Edit me", supplierId: "sup-a", category: "VEHICLE_COMPLIANCE", severity: "low",
      findingType: "CONFIRMED_DEVIATION", description: "d", dueDate: "2026-12-01",
    });
    const updated = updateManualAlert(created.id, { title: " Edited ", severity: "high", dueDate: "" });
    expect(updated).toMatchObject({ title: "Edited", severity: "high", description: "d" });
    expect(updated.dueDate).toBeUndefined();
    expect(getAllAlerts().find((a) => a.id === created.id)?.title).toBe("Edited");
    expect(() => updateManualAlert("alert-1", { title: "x" })).toThrow(/cannot be edited/);
  });
});
