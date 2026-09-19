import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/heroui.css';
import './theme.css';
import './ui/refined-ui.css';
import './ui/tokens.css';
import { NotchOverlay } from './ui/NotchOverlay';
import { TabyBar } from './ui/TabyBar';
import { ThemeProvider } from './ui/theme-context';
import { LocaleProvider } from './i18n/LocaleProvider';

const root = document.getElementById('root');

if (!root) throw new Error('Hibi renderer root was not found');

const overlay = new URLSearchParams(window.location.search).get('overlay');
// A prova do HeroUI (U01) carrega à parte: as janelas do app nunca pedem `ui-probe`, e ninguém paga por ela.
const HeroUIProbe = lazy(() => import('./styles/HeroUIProbe').then((module) => ({ default: module.HeroUIProbe })));
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider><LocaleProvider>{overlay === 'notch' ? <NotchOverlay /> : overlay === 'bar' ? <TabyBar /> : overlay === 'ui-probe' ? <Suspense fallback={null}><HeroUIProbe /></Suspense> : <App />}</LocaleProvider></ThemeProvider>
  </React.StrictMode>,
);
