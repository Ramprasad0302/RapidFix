import { createBrowserRouter } from 'react-router';
import { BootPage } from '../pages/BootPage';

export const router = createBrowserRouter([{ path: '/', element: <BootPage /> }], {
  // Vite `base` ("/technician/") → every route lives under /technician/*
  basename: import.meta.env.BASE_URL.replace(/\/$/, ''),
});
