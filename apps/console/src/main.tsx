import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './styles/theme.css';
import { App } from './App';
import { SuperAdminPage } from './pages/SuperAdmin';
import { HrPage } from './pages/Hr';
import { currentUser } from './lib/api';

function RoleHome() {
  const me = currentUser();
  return <Navigate to={me?.role === 'super_admin' ? '/super' : '/hr'} replace />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'super', element: <SuperAdminPage /> },
      { path: 'hr', element: <HrPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
