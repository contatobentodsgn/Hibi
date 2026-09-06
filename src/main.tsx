import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';
import { NotchOverlay } from './ui/NotchOverlay';

const root = document.getElementById('root');

if (!root) throw new Error('Hibi renderer root was not found');

const isNotchOverlay = new URLSearchParams(window.location.search).get('overlay') === 'notch';
createRoot(root).render(
  <React.StrictMode>
    {isNotchOverlay ? <NotchOverlay /> : <App />}
  </React.StrictMode>,
);
