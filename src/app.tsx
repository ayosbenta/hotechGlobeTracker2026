import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/auth-context";
import { ProtectedRoute } from "@/auth/protected-route";
import { DashboardPage } from "@/pages/dashboard-page";
import { LoginPage } from "@/pages/login-page";
import { APP_ROUTES } from "@/routes/constants";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route
          element={<Navigate replace to={APP_ROUTES.admin} />}
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
          element={
            <ProtectedRoute role="admin">
              <DashboardPage role="admin" />
            </ProtectedRoute>
          }
          path={APP_ROUTES.adminDashboard}
        />
        <Route
          element={
            <ProtectedRoute role="agent">
              <DashboardPage role="agent" />
            </ProtectedRoute>
          }
          path={APP_ROUTES.agentDashboard}
        />
        <Route
          element={
            <ProtectedRoute role="processor">
              <DashboardPage role="processor" />
            </ProtectedRoute>
          }
          path={APP_ROUTES.processorDashboard}
        />
        <Route element={<Navigate replace to={APP_ROUTES.admin} />} path="*" />
      </Routes>
    </AuthProvider>
  );
}
