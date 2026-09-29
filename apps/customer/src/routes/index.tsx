import { createBrowserRouter } from 'react-router';
import { BootPage } from '../pages/BootPage';

export const router = createBrowserRouter([{ path: '/', element: <BootPage /> }], {
  // Vite `base` ("/customer/") → every route lives under /customer/*
  basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
});
