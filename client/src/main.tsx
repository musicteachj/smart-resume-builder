import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { installAuthInterceptors } from "./api/interceptors";
import { queryClient } from "./api/queryClient";
import { applyTheme, useThemeStore } from "./stores/theme";
import "./index.css";

installAuthInterceptors();

// Apply the persisted/OS theme before first paint, then keep <html> in sync.
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((s) => applyTheme(s.theme));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
