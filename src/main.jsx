/**
 * @file main.jsx
 * @description React application entry point.
 * Mounts the App component into the DOM and wraps it with providers.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { CampaignProvider } from './context/CampaignContext';
import { CampaignThemeProvider } from './components/campaigns/CampaignThemeProvider';

/**
 * TanStack Query client configuration.
 * - staleTime: How long data is considered "fresh" (5 minutes)
 * - retry: Retry failed requests up to 2 times
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CampaignProvider>
          <CampaignThemeProvider>
            <App />
          </CampaignThemeProvider>
        </CampaignProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
