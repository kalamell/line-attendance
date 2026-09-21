import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './styles/theme.css';
import { App } from './App';
import { SuperAdminPage } from './pages/SuperAdmin';
import { HrPage } from './pages/Hr';
import { currentUser } from './lib/api';

function homeFor(role: string | undefined) {
  return role === 'super_admin' ? '/super' : '/hr';
}

function RoleHome() {
  return <Navigate to={homeFor(currentUser()?.role)} replace />;
}

/** Client-side gate: send users who lack the role back to their own home.
 *  (Backend RolesGuard is the real enforcement; this keeps the UI honest.) */
function RequireRole({ role, children }: { role: string; children: React.ReactElement }) {
  const me = currentUser();
  if (me?.role !== role) return <Navigate to={homeFor(me?.role)} replace />;
  return children;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'super', element: <RequireRole role="super_admin"><SuperAdminPage /></RequireRole> },
      { path: 'hr', element: <HrPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
