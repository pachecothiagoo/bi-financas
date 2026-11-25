import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 3_000, refetchOnWindowFocus: true },
  },
});

const csrfToken = fetch("/api/csrf", { credentials: "include", cache: "no-store" })
  .then(async response => {
    if (!response.ok) throw new Error("Não foi possível iniciar uma sessão segura.");
    const payload = (await response.json()) as { token: string };
    return payload.token;
  })
  .catch(error => {
    console.error("[Security] CSRF token unavailable:", error);
    return "";
  });

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        return { "x-csrf-token": await csrfToken };
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
