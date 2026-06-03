import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  /* Disable per-test timeout — the full backtest sweep can take several hours. */
  timeout: 0,
  /* Disable global timeout as well. */
  globalTimeout: 0,
  /* Retry once on failure */
  retries: 0,
  /* Run tests serially — each backtest depends on shared auth state and
     we do not want to overwhelm the API with parallel requests. */
  workers: 1,
  /* Reporter — HTML report for easy review */
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    /* Base URL for the frontend (Vite dev server) */
    baseURL: "http://localhost:5173",
    /* Extra HTTP headers — not needed for pure API calls, but handy */
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
});
