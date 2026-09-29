import { createBrowserRouter } from 'react-router';
import { BootPage } from '../pages/BootPage';

export const router = createBrowserRouter([{ path: '/', element: <BootPage /> }], {
  // Vite `base` ("/admin/") → every route lives under /admin/*
  basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
});
