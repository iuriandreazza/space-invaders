import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServices } from './compositionRoot.ts';
import { App } from './ui/App.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App services={createServices()} />
    </ErrorBoundary>
  </StrictMode>,
);
