import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './ui/pwa';
import { startAppearance } from './ui/settings';
import './styles.css';

// Theme, style and language are applied before the first paint, so there's no flash.
startAppearance();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
