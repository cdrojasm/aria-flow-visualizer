/* ─── Shared test-run indicators, keyed by config version ──────────────── */
/* Seeded here so /configuracion (version history) and /testing/$runId      */
/* (run detail) read the same records without a real backend.              */

export type TestRunIndicators = {
  id: string;
  configId: string;
  configName: string;
  version: number;
  date: string;
  dataset: string;
  duration: string;
  processed: number;
  total: number;
  failed: number;
  fraudeNoDetectado: string;
  falsosPositivos: string;
  tiempoAhorrado: string;
  latencia: string;
  accuracy: number;
  passed: boolean;
};

export const TEST_RUNS: TestRunIndicators[] = [
  { id: "run-cfg-prod-v1", configId: "cfg-prod", configName: "Producción", version: 1, date: "2025-11-03 08:12", dataset: "Producción Q1 2025", duration: "3m 58s", processed: 335, total: 340, failed: 5, fraudeNoDetectado: "2.6%", falsosPositivos: "11.8%", tiempoAhorrado: "8.9 h", latencia: "1,040 ms", accuracy: 95.1, passed: true },
  { id: "run-cfg-prod-v2", configId: "cfg-prod", configName: "Producción", version: 2, date: "2025-12-15 10:47", dataset: "Producción Q1 2025", duration: "3m 21s", processed: 338, total: 340, failed: 2, fraudeNoDetectado: "1.9%", falsosPositivos: "9.7%", tiempoAhorrado: "10.2 h", latencia: "958 ms", accuracy: 96.3, passed: true },
  { id: "run-cfg-prod-v3", configId: "cfg-prod", configName: "Producción", version: 3, date: "2026-02-08 09:05", dataset: "Casos Críticos 2024", duration: "1m 12s", processed: 87, total: 87, failed: 0, fraudeNoDetectado: "0.0%", falsosPositivos: "4.6%", tiempoAhorrado: "2.8 h", latencia: "812 ms", accuracy: 97.6, passed: true },

  { id: "run-cfg-staging-v1", configId: "cfg-staging", configName: "Staging", version: 1, date: "2025-09-20 14:02", dataset: "Sintético Balanceado", duration: "2m 44s", processed: 145, total: 150, failed: 5, fraudeNoDetectado: "5.1%", falsosPositivos: "15.3%", tiempoAhorrado: "4.1 h", latencia: "1,210 ms", accuracy: 89.4, passed: false },
  { id: "run-cfg-staging-v2", configId: "cfg-staging", configName: "Staging", version: 2, date: "2025-10-11 11:30", dataset: "Sintético Balanceado", duration: "2m 38s", processed: 147, total: 150, failed: 3, fraudeNoDetectado: "4.2%", falsosPositivos: "13.6%", tiempoAhorrado: "5.0 h", latencia: "1,155 ms", accuracy: 91.0, passed: false },
  { id: "run-cfg-staging-v3", configId: "cfg-staging", configName: "Staging", version: 3, date: "2025-11-29 16:18", dataset: "Producción Q1 2025", duration: "4m 05s", processed: 337, total: 340, failed: 3, fraudeNoDetectado: "3.0%", falsosPositivos: "11.1%", tiempoAhorrado: "9.4 h", latencia: "1,102 ms", accuracy: 93.7, passed: false },
  { id: "run-cfg-staging-v4", configId: "cfg-staging", configName: "Staging", version: 4, date: "2026-01-22 09:52", dataset: "Producción Q1 2025", duration: "4m 12s", processed: 338, total: 340, failed: 2, fraudeNoDetectado: "1.8%", falsosPositivos: "9.2%", tiempoAhorrado: "11.4 h", latencia: "924 ms", accuracy: 95.2, passed: true },
];

export function findTestRun(id: string): TestRunIndicators | undefined {
  return TEST_RUNS.find((r) => r.id === id);
}

export function registerTestRun(run: TestRunIndicators) {
  TEST_RUNS.push(run);
}
