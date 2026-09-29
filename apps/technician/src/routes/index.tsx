import { createBrowserRouter, Navigate } from 'react-router';
import { BootPage } from '../pages/BootPage';
import { LoginPage } from '../pages/LoginPage';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <RequireAuth />,
      children: [{ path: '/', element: <BootPage /> }],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  {
    // Vite `base` ("/technician/") → every route lives under /technician/*
    basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
  },
);
