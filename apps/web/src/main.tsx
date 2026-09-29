import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { authActions } from './store/auth';
import './index.css';

// Restore the saved session from the httpOnly cookie while the splash shows.
void authActions.bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
