import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-4">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user?.name}</span>
          <button onClick={handleLogout} className="underline">
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}