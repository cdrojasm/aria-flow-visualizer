import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

// recharts' ResponsiveContainer needs it; jsdom has none.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

let permissions: string[] = [];
vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    user: {
      id: "u1",
      email: "fraude@bbva.test",
      name: "Fran Fraude",
      role: "manager",
      permissions,
    },
    role: "manager",
    signIn: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Link needs a router; the pages only use it for navigation.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const { Route: DashboardRoute } = await import("@/routes/dashboard");
const { Route: MonitorRoute } = await import("@/routes/monitor");
const { Route: HistoricoRoute } = await import("@/routes/historico-fraude");

const range = {
  from: "2026-09-30T12:00:00Z",
  to: "2026-10-01T12:00:00Z",
  timezone: "America/Bogota",
  schema_versions: ["1"],
};
const histogram = [{ bucket: "rt_lt_1m", upper_bound_seconds: 60, count: 3 }];
const quality = {
  decided: 0,
  pending: 2,
  true_positives: 0,
  true_negatives: 0,
  false_positives: 0,
  undetected_fraud: 0,
  true_positive_amount_sum: 0,
  false_positive_amount_sum: 0,
  undetected_fraud_amount_sum: 0,
  reviewed: 0,
  reviewed_changed: 0,
  reviewed_confirmed: 0,
  review_events: 0,
  maturation_histogram: [],
};
const resolutionTime = { count: 4, sum_seconds: 480, within_sla_count: 3, histogram };
const period = {
  level: "day",
  period: "2026-10-01",
  period_start: "2026-10-01",
  period_end: "2026-10-01",
  hours: [0],
  partial: false,
  maturation: "maturing",
  alerts: 6,
  amount_sum: 0,
  decided: 0,
  false_positives: 0,
  undetected_fraud: 0,
  reviewed: 0,
};
const warnings = [
  { code: "fraud_label_maturing", message: "English text", periods: ["2026-10-01"] },
];

const overview = {
  range,
  periods: [period],
  warnings,
  totals: { alerts: 6, amount_sum: 1200, amount_count: 6 },
  funnel_by_status: [
    {
      value: "CLOSED",
      alerts: 6,
      amount_sum: 0,
      amount_count: 0,
      decided: 0,
      false_positives: 0,
      undetected_fraud: 0,
    },
  ],
  fraud_quality: quality,
  resolution_time: resolutionTime,
  distributions: {
    channel: [
      {
        value: "WEB",
        alerts: 6,
        amount_sum: 0,
        amount_count: 0,
        decided: 0,
        false_positives: 0,
        undetected_fraud: 0,
      },
    ],
  },
  hourly_profile: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    alerts: 0,
    amount_sum: 0,
    resolution_time_count: 0,
    resolution_time_sum_seconds: 0,
    within_sla_count: 0,
  })),
};
const duration = { count: 0, sum_seconds: 0, histogram: [] };
const technical = {
  range,
  periods: [],
  warnings: [],
  workflow_steps: { step_name: "", executions: 10, succeeded: 10, failed: 0, retries: 0, duration },
  workflow_steps_by_step: [
    { step_name: "classification", executions: 10, succeeded: 10, failed: 0, retries: 0, duration },
  ],
  llm_calls: {
    model: "",
    calls: 0,
    errors: 0,
    input_tokens: 0,
    output_tokens: 0,
    latency: duration,
  },
  llm_calls_by_model: [],
  research_calls: { source: "", calls: 0, ok: 0, failed: 0, timeout: 0 },
  research_calls_by_source: [],
  evaluations: { evaluated: 0, hallucinations: 0, data_use_correct: 0, invalid: 0 },
  hourly_profile: [],
};
const agent = {
  range,
  periods: [period],
  warnings,
  totals: { alerts: 6, amount_sum: 0, amount_count: 0 },
  by_resolution_method: [
    {
      resolution_method: "aria",
      alerts: 6,
      fraud_marks: 2,
      no_fraud_marks: 4,
      fraud_quality: quality,
      resolution_time: resolutionTime,
    },
  ],
  fraud_quality: quality,
  resolution_time: resolutionTime,
  hourly_profile: [],
  recommendations: {
    available: false,
    accepted: null,
    ignored: null,
    reason: "Las recomendaciones aún no se registran por alerta.",
  },
};
const historyItem = {
  alert_id: "11111111-1111-1111-1111-111111111111",
  event_id: "EVT-1",
  event_type: "transfer",
  status: "CLOSED",
  customer_id: "C-9",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:05:00Z",
  has_snapshot: true,
  origin: "production",
  segment: "tarjetas",
  channel: "WEB",
  subchannel: "PSE",
  amount: 1200,
  amount_tier: "bajo",
  schema_version: 1,
  configuration_id: "cfg",
  resolution_method: "aria",
  mark: "fraud",
  fraud_label: "fraud",
  marked_at: "2026-10-01T10:05:00Z",
  fraud_reviewed_at: null,
  fraud_review_count: 0,
  resolution_time_seconds: 300,
};

let reviewBody: unknown;
const server = setupServer(
  http.get("*/api/v0/metrics/overview", () => HttpResponse.json(overview)),
  http.get("*/api/v0/metrics/agent", () => HttpResponse.json(agent)),
  http.get("*/api/v0/metrics/technical", () => HttpResponse.json(technical)),
  http.get("*/api/v0/metrics/live", () =>
    HttpResponse.json({
      received: 4,
      processing: 2,
      escalated: 1,
      voicebot_in_call: 3,
      measured_at: "2026-10-01T12:00:00Z",
    }),
  ),
  http.get("*/api/v0/operations/capacity", () =>
    HttpResponse.json({
      analysts: { available: 2, status: "available", total: 5 },
      voicebot: { available: 1, status: "available", total: 4 },
      bidi: { available: 0, status: "unavailable", total: null },
      updated_at: "2026-10-01T12:00:00Z",
    }),
  ),
  http.get("*/api/v0/library/channels", () => HttpResponse.json([])),
  http.get("*/api/v0/configurations", () => HttpResponse.json([])),
  http.get("*/api/v0/operational-settings", () =>
    HttpResponse.json({
      amount_tiers: [],
      schema_version: 1,
      reasoning_evaluation_sample_rate: 0.05,
      analyst_capacity: { profiles: [], default_profile_id: "", day_overrides: {} },
      queue_discard_behavior: { resolution_tag: "block_soft", resolution_method_id: null },
    }),
  ),
  http.get("*/api/v0/operational-settings/history", () => HttpResponse.json([])),
  http.get("*/api/v0/alerts/history", () =>
    HttpResponse.json({ items: [historyItem], next_cursor: null }),
  ),
  http.post("*/api/v0/alerts/:alertId/fraud-review", async ({ request }) => {
    reviewBody = await request.json();
    return HttpResponse.json({
      review: {
        id: "r1",
        alert_id: historyItem.alert_id,
        from_label: "fraud",
        to_label: "no_fraud",
        reviewed_by: "fraude@bbva.test",
        reviewed_at: "2026-10-01T12:00:00Z",
        channel: "ui",
        note: "x",
      },
      mark: "fraud",
      fraud_label: "no_fraud",
      marked_at: historyItem.marked_at,
      fraud_reviewed_at: "2026-10-01T12:00:00Z",
      fraud_review_count: 1,
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  permissions = [];
  reviewBody = undefined;
});

function renderPage(Page: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

describe("/dashboard", () => {
  it("shows the cumulative-only note, translated warnings, real KPIs and the live funnel", async () => {
    permissions = ["dashboard"];
    renderPage(DashboardRoute.options.component as ComponentType);
    expect(screen.getByText("Sólo medidas acumulativas sobre el periodo")).toBeInTheDocument();
    expect(
      await screen.findByText(/Falsos positivos y fraude no detectado aún pueden cambiar/),
    ).toBeInTheDocument();
    // decided = 0 -> no rate, never a made-up number.
    const fpCard = screen
      .getByText("Ratio falsos positivos")
      .closest("div.relative") as HTMLElement;
    expect(within(fpCard).getByText("sin datos")).toBeInTheDocument();
    expect(within(fpCard).getByText("En maduración")).toBeInTheDocument();
    expect(await screen.findByText("En llamada con Voicebot")).toBeInTheDocument();
    expect(await screen.findByText("10")).toBeInTheDocument(); // 4 + 2 + 1 + 3 live alerts
  });
});

describe("/monitor", () => {
  it("splits the page in tabs and keeps each section's data in its own tab", async () => {
    permissions = ["monitor"];
    const user = userEvent.setup();
    renderPage(MonitorRoute.options.component as ComponentType);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Indicadores generales",
      "Indicadores de área",
      "Analistas y otros canales",
      "Explicabilidad",
      "Indicadores técnicos",
      "% Recomendaciones",
    ]);
    // Only the first tab is open; Voicebot and Bidi are disabled everywhere.
    expect(screen.getByRole("tab", { name: "Indicadores generales" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Fraude no detectado")).toBeInTheDocument();
    expect(screen.queryByText("classification")).not.toBeInTheDocument();
    expect(screen.queryByText("Voicebot")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Explicabilidad" }));
    const hallucinations = screen.getByText("Alucinaciones").parentElement as HTMLElement;
    await waitFor(() => expect(within(hallucinations).getByText("sin datos")).toBeInTheDocument());
    const dataUse = screen.getByText("Uso correcto de datos").parentElement as HTMLElement;
    expect(within(dataUse).getByText("sin datos")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Indicadores técnicos" }));
    expect(await screen.findByText("classification")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "% Recomendaciones" }));
    expect(
      await screen.findByText(/Las recomendaciones aún no se registran por alerta/),
    ).toBeInTheDocument();
  });

  it("remembers the last tab and ignores an unknown stored value", async () => {
    permissions = ["monitor"];
    localStorage.setItem("aria.monitor.tab", "tecnicos");
    const view = renderPage(MonitorRoute.options.component as ComponentType);
    expect(await screen.findByText("classification")).toBeInTheDocument();
    view.unmount();
    localStorage.setItem("aria.monitor.tab", "no-existe");
    renderPage(MonitorRoute.options.component as ComponentType);
    expect(
      await screen.findByRole("tab", { name: "Indicadores generales", selected: true }),
    ).toBeInTheDocument();
    localStorage.removeItem("aria.monitor.tab");
  });
});

describe("/historico-fraude", () => {
  it("hides 'Revisar fraude' and the CSV upload without the fraud_review permission", async () => {
    permissions = ["fraud_history"];
    renderPage(HistoricoRoute.options.component as ComponentType);
    expect(await screen.findByText("EVT-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar fraude/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Cargar CSV de revisiones/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No hay más alertas en el rango.")).toBeInTheDocument();
  });

  it("reviews an alert through a confirmation step and shows the corrected label", async () => {
    permissions = ["fraud_history", "fraud_review", "dashboard"];
    const user = userEvent.setup();
    renderPage(HistoricoRoute.options.component as ComponentType);
    await user.click(await screen.findByRole("button", { name: /Revisar fraude/ }));
    await user.click(screen.getByRole("button", { name: "No fraude" }));
    await user.type(screen.getByLabelText(/Nota/), "Cliente reconoce la compra");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Vas a cambiar el resultado/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() =>
      expect(reviewBody).toEqual({ fraud_label: "no_fraud", note: "Cliente reconoce la compra" }),
    );
    // The row now shows the struck-through mark and the reviewed label.
    expect(
      await screen.findByTitle("Marca: Fraude · Resultado revisado: No fraude"),
    ).toBeInTheDocument();
  });
});
