"use client";

import { SWRConfig } from "swr";
import { ReactNode } from "react";

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        // Keep data in cache for 10 minutes
        dedupingInterval: 600000,
        // Revalidate in background after 5 minutes
        refreshInterval: 0, // Don't auto-refresh
        revalidateOnFocus: false, // Don't refetch on window focus
        revalidateOnReconnect: false, // Don't refetch on reconnect
        // Keep stale data while revalidating
        keepPreviousData: true,
        // Error retry
        errorRetryCount: 2,
        // Global fetcher - not used since we use Supabase directly
      }}
    >
      {children}
    </SWRConfig>
  );
}
