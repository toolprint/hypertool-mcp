import { createBrowserRouter, createRoutesFromElements, Route } from "react-router-dom";
import RootLayout from "./root-layout";
import DashboardPage from "./pages/dashboard";
import ServersPage from "./pages/servers";
import ToolsPage from "./pages/tools";
import ToolsetsPage from "./pages/toolsets";
import PersonasPage from "./pages/personas";
import ConfigPage from "./pages/config";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="servers" element={<ServersPage />} />
      <Route path="tools" element={<ToolsPage />} />
      <Route path="toolsets" element={<ToolsetsPage />} />
      <Route path="personas" element={<PersonasPage />} />
      <Route path="config" element={<ConfigPage />} />
    </Route>
  )
);

export default router;
