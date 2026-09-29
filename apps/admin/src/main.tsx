import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { authActions } from './store/authStore';
import './index.css';

// Restore any existing session from the httpOnly refresh cookie.
void authActions.bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
