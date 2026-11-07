import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRedirect } from "./RoleRedirect";
import { AdminLayout } from "./AdminLayout";
import { SupplierLayout } from "./SupplierLayout";

import Login from "../pages/auth/Login";
import AcceptSupplierInvitation from "../pages/auth/AcceptSupplierInvitation";
import Unauthorized from "../pages/auth/Unauthorized";
import NotFound from "../pages/auth/NotFound";

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
import SupplierOnboarding from "../pages/supplier/Onboarding";
import MyCompany from "../pages/supplier/MyCompany";
import MyContracts from "../pages/supplier/MyContracts";
import MyVehicles from "../pages/supplier/MyVehicles";
import MyCertificates from "../pages/supplier/MyCertificates";
import MyEnergy from "../pages/supplier/MyEnergy";
import MyCompliance from "../pages/supplier/MyCompliance";
import MyRiskAndPrediction from "../pages/supplier/MyRiskAndPrediction";
import MyAlerts from "../pages/supplier/MyAlerts";
import RequiredActions from "../pages/supplier/RequiredActions";
import MyTeam from "../pages/supplier/MyTeam";
import Access from "../pages/admin/Access";

const router = createBrowserRouter([
  { path: "/", element: <RoleRedirect /> },
  { path: "/login", element: <Login /> },
  { path: "/accept-invitation", element: <AcceptSupplierInvitation /> },
  { path: "/unauthorized", element: <Unauthorized /> },
  { path: "*", element: <NotFound /> },
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
      { path: "access", element: <Access /> },
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
      { path: "onboarding", element: <SupplierOnboarding /> },
      { path: "company", element: <MyCompany /> },
      { path: "contracts", element: <MyContracts /> },
      { path: "vehicles", element: <MyVehicles /> },
      { path: "certificates", element: <MyCertificates /> },
      { path: "energy", element: <MyEnergy /> },
      { path: "compliance", element: <MyCompliance /> },
      { path: "risk", element: <MyRiskAndPrediction /> },
      { path: "alerts", element: <MyAlerts /> },
      { path: "team", element: <MyTeam /> },
      { path: "required-actions", element: <RequiredActions /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}