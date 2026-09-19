import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/heroui.css';
import './ui/redesign/theme.css';
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
// A galeria da nova UI (U02) existe só no desenvolvimento: no build de produção esta condição é falsa e o
// código dela nem entra no pacote.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./ui/redesign/preview/ComponentGallery').then((module) => ({ default: module.ComponentGallery }))) : null;
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider><LocaleProvider>{overlay === 'notch' ? <NotchOverlay /> : overlay === 'bar' ? <TabyBar /> : overlay === 'ui-gallery' && ComponentGallery ? <Suspense fallback={null}><ComponentGallery /></Suspense> : <App />}</LocaleProvider></ThemeProvider>
  </React.StrictMode>,
);
