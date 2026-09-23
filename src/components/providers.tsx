"use client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { loadStore, loadTemplates } from "@/lib/repository";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={client}>
        {children}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
export function useStore() {
  return useQuery({
    queryKey: ["store"],
    queryFn: loadStore,
    refetchInterval: 60000,
  });
}
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: loadTemplates,
    refetchInterval: 60000,
  });
}
export function useAction() {
  const q = useQueryClient();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (action: () => Promise<unknown>, message = "保存しました") => {
      setBusy(true);
      try {
        await action();
        await Promise.all([
          q.invalidateQueries({ queryKey: ["recruitment-monitor"] }),
          q.invalidateQueries({ queryKey: ["store"] }),
          q.invalidateQueries({ queryKey: ["templates"] }),
        ]);
        toast.success(message);
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : typeof e === "object" && e && "message" in e
              ? String(e.message)
              : "保存できませんでした",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
