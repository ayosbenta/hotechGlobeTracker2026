import { Navigate, Route, Routes } from "react-router-dom";

import { PortalPlaceholder } from "@/pages/portal-placeholder";
import { APP_ROUTES } from "@/routes/constants";

export function App() {
  return (
    <Routes>
      <Route
        element={<Navigate replace to={APP_ROUTES.admin} />}
        path={APP_ROUTES.home}
      />
      <Route
        element={<PortalPlaceholder role="admin" />}
        path={APP_ROUTES.admin}
      />
      <Route
        element={<PortalPlaceholder role="agent" />}
        path={APP_ROUTES.agent}
      />
      <Route
        element={<PortalPlaceholder role="processor" />}
        path={APP_ROUTES.processor}
      />
      <Route element={<Navigate replace to={APP_ROUTES.admin} />} path="*" />
    </Routes>
  );
}
