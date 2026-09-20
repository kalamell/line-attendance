import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { SuperAdminPage } from './pages/SuperAdmin';
import { HrPage } from './pages/Hr';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/super" replace /> },
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
