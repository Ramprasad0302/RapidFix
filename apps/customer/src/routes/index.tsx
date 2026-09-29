import { createBrowserRouter } from 'react-router';
import { BootPage } from '../pages/BootPage';
import { LoginPage } from '../pages/LoginPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter(
  [
    // Public — guests can browse everything here.
    { path: '/', element: <BootPage /> },
    { path: '/login', element: <LoginPage /> },

    // Private — login required, then the user is returned here.
    {
      element: <RequireAuth />,
      children: [{ path: '/account/profile', element: <ProfilePage /> }],
    },
  ],
  {
    // Vite `base` ("/customer/") → every route lives under /customer/*
    basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
  },
);
