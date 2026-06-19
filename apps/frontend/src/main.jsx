import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:           1,
      staleTime:       1000 * 60 * 5,   // 5 min
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#112236',
            color:      '#E2EBF5',
            border:     '1px solid rgba(59,158,232,0.2)',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#112236' } },
          error:   { iconTheme: { primary: '#f43f5e', secondary: '#112236' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
