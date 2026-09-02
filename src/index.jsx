import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import { applyStoredTheme } from './contexts/ThemeContext';
import './globals.css';

// Paint the persisted theme before the first render — no flash on startup.
applyStoredTheme();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
