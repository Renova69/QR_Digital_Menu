import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import reportWebVitals from './reportWebVitals';
import './i18n';

// Fix C-6 — validate the Stripe publishable key at startup so a misconfigured
// deploy surfaces loudly instead of silently breaking pay-at-table.
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  const message =
    '[Startup] VITE_STRIPE_PUBLISHABLE_KEY is not set — payment will not work';
  if (import.meta.env.DEV) {
    // In dev: throw a visible error so it cannot be missed during development.
    throw new Error(message);
  }
  // In prod: log the error and continue (don't crash the whole app over a
  // feature that not every page depends on).
  console.error(message);
}

const queryClient = new QueryClient();
const container = document.getElementById('root');

if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Analytics />
        <SpeedInsights />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
