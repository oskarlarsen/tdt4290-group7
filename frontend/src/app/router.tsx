import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRedirect } from "./RoleRedirect";
import { AdminLayout } from "./AdminLayout";
import { SupplierLayout } from "./SupplierLayout";

import Login from "../pages/auth/Login";
import Unauthorized from "../pages/auth/Unauthorized";

import AdminDashboard from "../pages/admin/Dashboard";
import Suppliers from "../pages/admin/Suppliers";
import Contracts from "../pages/admin/Contracts";
import Vehicles from "../pages/admin/Vehicles";
import Certificates from "../pages/admin/Certificates";
import Energy from "../pages/admin/Energy";
import RiskAndPrediction from "../pages/admin/RiskAndPrediction";
import Alerts from "../pages/admin/Alerts";
import SupplierDetails from "../pages/admin/SupplierDetails";

import SupplierDashboard from "../pages/supplier/Dashboard";
import MyCompany from "../pages/supplier/MyCompany";
import MyContracts from "../pages/supplier/MyContracts";
import MyVehicles from "../pages/supplier/MyVehicles";
import MyCertificates from "../pages/supplier/MyCertificates";

const router = createBrowserRouter([
  { path: "/", element: <RoleRedirect /> },
  { path: "/login", element: <Login /> },
  { path: "/unauthorized", element: <Unauthorized /> },
  {
    path: "/admin",
    element: (
      <ProtectedRoute role="ADMIN">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "dashboard", element: <AdminDashboard /> },
      { path: "suppliers", element: <Suppliers /> },
      { path: "suppliers/:id", element: <SupplierDetails /> },
      { path: "contracts", element: <Contracts /> },
      { path: "vehicles", element: <Vehicles /> },
      { path: "certificates", element: <Certificates /> },
      { path: "energy", element: <Energy /> },
      { path: "risk", element: <RiskAndPrediction /> },
      { path: "alerts", element: <Alerts /> },
    ],
  },
  {
    path: "/supplier",
    element: (
      <ProtectedRoute role="SUPPLIER">
        <SupplierLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "dashboard", element: <SupplierDashboard /> },
      { path: "company", element: <MyCompany /> }, // kept route just in case, but removed from nav
      { path: "contracts", element: <MyContracts /> },
      { path: "vehicles", element: <MyVehicles /> },
      { path: "certificates", element: <MyCertificates /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}