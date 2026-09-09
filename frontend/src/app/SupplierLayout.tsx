import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "dashboard", label: "Dashboard" },
  { to: "company", label: "My Company" },
  { to: "contracts", label: "My Contracts" },
  { to: "vehicles", label: "My Vehicles" },
  { to: "certificates", label: "My Certificates" },
  { to: "energy", label: "Energy & Fuel" },
  { to: "compliance", label: "My Compliance" },
  { to: "risk", label: "My Risk & Prediction" },
  { to: "alerts", label: "My Alerts" },
  { to: "required-actions", label: "Required Actions" },
];

export function SupplierLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex gap-4">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
