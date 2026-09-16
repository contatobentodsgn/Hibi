import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';
import './ui/tokens.css';
import './ui/refined-ui.css';
import { NotchOverlay } from './ui/NotchOverlay';
import { ThemeProvider } from './ui/theme-context';
import { LocaleProvider } from './i18n/LocaleProvider';

const root = document.getElementById('root');

if (!root) throw new Error('Hibi renderer root was not found');

const isNotchOverlay = new URLSearchParams(window.location.search).get('overlay') === 'notch';
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider><LocaleProvider>{isNotchOverlay ? <NotchOverlay /> : <App />}</LocaleProvider></ThemeProvider>
  </React.StrictMode>,
);
