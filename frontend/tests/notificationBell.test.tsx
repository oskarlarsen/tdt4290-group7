// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { Notification } from "../src/types/notification";

const auth = vi.hoisted(() => ({ role: "SUPPLIER" }));
vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", name: "U", role: auth.role } }) }));
const mark = vi.hoisted(() => vi.fn());
vi.mock("../src/hooks/useNotifications", () => ({
  useNotifications: () => ({
    data: [{ id: "n1", type: "VEHICLE_DEVIATION", title: "Vehicle deregistered", message: "Fix it", severity: "HIGH", alertId: "a1", supplierId: "s1", timeAgo: "1h ago", read: false } satisfies Notification],
  }),
  useMarkNotificationAsRead: () => ({ mutate: mark }),
  useMarkAllNotificationsAsRead: () => ({ mutate: vi.fn() }),
}));

import { NotificationBell } from "../src/components/ui/NotificationBell";

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("notification bell", () => {
  it("opens a supplier's alerts when they click a notification", () => {
    auth.role = "SUPPLIER";
    render(<MemoryRouter initialEntries={["/supplier/dashboard"]}><NotificationBell /><Where /></MemoryRouter>);
    expect(screen.getByText("1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Varslinger" }));
    fireEvent.click(screen.getByText("Vehicle deregistered"));
    expect(mark).toHaveBeenCalledWith("n1");
    expect(screen.getByTestId("where").textContent).toBe("/supplier/alerts");
  });

  it("sends an admin to the supplier the notification concerns", () => {
    auth.role = "ADMIN";
    render(<MemoryRouter initialEntries={["/admin/dashboard"]}><NotificationBell /><Where /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Varslinger" }));
    fireEvent.click(screen.getByText("Vehicle deregistered"));
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers/s1");
  });
});
