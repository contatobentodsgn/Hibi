// Primeiro de tudo: `heroui.css` declara a ordem das camadas da nova UI (theme, base, components, utilities).
// O CSS de um componente entra quando o módulo dele é avaliado, e o `App` vem logo abaixo; se um arquivo
// em camada dele chegasse antes, a primeira menção fixaria outra ordem, e o reset (`base`) passaria por
// cima dos utilitários (foi assim que a barra da U03 perdeu o espaçamento interno).
import './styles/heroui.css';
import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/redesign/theme.css';
import './theme.css';
import './ui/refined-ui.css';
import './ui/tokens.css';
import { NotchOverlay } from './ui/NotchOverlay';
import { AssistantBar } from './ui/AssistantBar';
import { ThemeProvider } from './ui/theme-context';
import { LocaleProvider } from './i18n/LocaleProvider';
import { NavigationPreferencesProvider } from './ui/shell/NavigationPreferencesProvider';

const root = document.getElementById('root');

if (!root) throw new Error('Pixano renderer root was not found');

const overlay = new URLSearchParams(window.location.search).get('overlay');
// A galeria da nova UI (U02) e a prévia da navegação (U03) existem só no desenvolvimento: no build de
// produção estas condições são falsas e o código delas nem entra no pacote.
const ComponentGallery = import.meta.env.DEV ? lazy(() => import('./ui/redesign/preview/ComponentGallery').then((module) => ({ default: module.ComponentGallery }))) : null;
const NavigationPreview = import.meta.env.DEV ? lazy(() => import('./ui/redesign/preview/NavigationPreview').then((module) => ({ default: module.NavigationPreview }))) : null;
createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider><LocaleProvider><NavigationPreferencesProvider>{overlay === 'notch' ? <NotchOverlay /> : overlay === 'bar' ? <AssistantBar /> : overlay === 'ui-gallery' && ComponentGallery ? <Suspense fallback={null}><ComponentGallery /></Suspense> : overlay === 'ui-navigation' && NavigationPreview ? <Suspense fallback={null}><NavigationPreview /></Suspense> : <App />}</NavigationPreferencesProvider></LocaleProvider></ThemeProvider>
  </React.StrictMode>,
);
