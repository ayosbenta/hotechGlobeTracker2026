import { Navigate, Route, Routes } from "react-router-dom";

import { DashboardPage } from "@/pages/dashboard-page";
import { APP_ROUTES } from "@/routes/constants";

export function App() {
  return (
    <Routes>
      <Route
        element={<Navigate replace to={APP_ROUTES.adminDashboard} />}
        path={APP_ROUTES.home}
      />
      <Route
        element={<Navigate replace to={APP_ROUTES.adminDashboard} />}
        path={APP_ROUTES.admin}
      />
      <Route
        element={<Navigate replace to={APP_ROUTES.agentDashboard} />}
        path={APP_ROUTES.agent}
      />
      <Route
        element={<Navigate replace to={APP_ROUTES.processorDashboard} />}
        path={APP_ROUTES.processor}
      />
      <Route
        element={<DashboardPage role="admin" />}
        path={APP_ROUTES.adminDashboard}
      />
      <Route
        element={<DashboardPage role="agent" />}
        path={APP_ROUTES.agentDashboard}
      />
      <Route
        element={<DashboardPage role="processor" />}
        path={APP_ROUTES.processorDashboard}
      />
      <Route
        element={<Navigate replace to={APP_ROUTES.adminDashboard} />}
        path="*"
      />
    </Routes>
  );
}
