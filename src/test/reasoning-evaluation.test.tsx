import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ReasoningEvaluationTab } from "@/components/alert/ReasoningEvaluationTab";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const ALERT = "00000000-0000-4000-8000-0000000011c0";
const evaluated = {
  alert_id: ALERT,
  status: "evaluated",
  hallucination: true,
  data_use_correct: false,
  rationale: "La clasificación cita un monto que no está en el payload.",
  judge_model: "judge-1",
  prompt_version: "v3",
  duration_ms: 7300,
  criteria: [
    { key: "clarity", label: "Claridad", passed: true, note: "Se entiende." },
    {
      key: "step_consistency",
      label: "Coherencia entre pasos",
      passed: false,
      note: "Se contradicen.",
    },
    { key: "model_alignment", label: "Consistencia con el modelo", passed: null, note: "" },
  ],
  attempts: 2,
  input_tokens: 900,
  output_tokens: 40,
  evaluated_at: "2026-11-05T15:00:00Z",
  steps: [
    {
      step: "classification",
      hallucination: true,
      data_use_correct: false,
      note: "Habla de 9999 y el payload dice 1500.",
    },
    { step: "analyst", hallucination: false, data_use_correct: true, note: "" },
  ],
};

let body: unknown;
const server = setupServer(
  http.get(`*/api/v0/alerts/${ALERT}/reasoning-evaluation`, () => HttpResponse.json(body)),
  http.post(`*/api/v0/alerts/${ALERT}/reasoning-evaluation`, () => {
    asked += 1;
    return HttpResponse.json(
      { alert_id: ALERT, state: "queued", evaluation: null, job: job("queued") },
      { status: 202 },
    );
  }),
);

let asked = 0;
const job = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  requested_by: "manual",
  queued_at: "2026-11-06T12:00:00Z",
  started_at: null,
  finished_at: null,
  attempts: 0,
  error_code: null,
  wait_ms: null,
  run_ms: 0,
  total_ms: null,
  ...extra,
});
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function show(canRequest = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReasoningEvaluationTab alertId={ALERT} canRequest={canRequest} />
    </QueryClientProvider>,
  );
}

describe("ReasoningEvaluationTab", () => {
  it("shows the verdict, the judge's rationale and the verdict of each step", async () => {
    body = { alert_id: ALERT, state: "evaluated", evaluation: evaluated, job: null };
    show();

    expect(await screen.findByText(evaluated.rationale)).toBeInTheDocument();
    expect(screen.getAllByText("Alucinación").length).toBeGreaterThan(0);
    expect(screen.getByText("Uso incorrecto de datos")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
    expect(screen.getByText("Habla de 9999 y el payload dice 1500.")).toBeInTheDocument();
    expect(screen.getByText(/prompt v3/)).toBeInTheDocument();
    expect(screen.getByText(/el modelo tardó 7,3 s/)).toBeInTheDocument();
    expect(screen.getByText(/2 intentos/)).toBeInTheDocument();
  });

  it("explains why there is no verdict instead of showing an empty tab", async () => {
    body = { alert_id: ALERT, state: "not_sampled", evaluation: null, job: null };
    show();

    expect(await screen.findByText("Sin evaluación")).toBeInTheDocument();
    expect(screen.getByText(/solo revisa una muestra aleatoria/)).toBeInTheDocument();
  });

  it("says when a verdict predates the per-step detail", async () => {
    body = {
      alert_id: ALERT,
      state: "evaluated",
      evaluation: { ...evaluated, steps: [], criteria: [], prompt_version: "v1", attempts: 1 },
      job: null,
    };
    show();

    expect(await screen.findByText(/anterior al detalle por paso/)).toBeInTheDocument();
  });

  it("marks an invalid evaluation as such", async () => {
    body = {
      alert_id: ALERT,
      state: "invalid",
      evaluation: {
        ...evaluated,
        status: "invalid",
        hallucination: null,
        data_use_correct: null,
        steps: [],
        criteria: [],
      },
      job: null,
    };
    show();

    expect(await screen.findByText("Evaluación inválida")).toBeInTheDocument();
  });

  it("shows the explainability criteria with their verdict, even the undecidable one", async () => {
    body = { alert_id: ALERT, state: "evaluated", evaluation: evaluated, job: null };
    show();

    expect(await screen.findByText("Explicabilidad")).toBeInTheDocument();
    expect(screen.getByText("Claridad")).toBeInTheDocument();
    expect(screen.getByText("Cumple")).toBeInTheDocument();
    expect(screen.getByText("No cumple")).toBeInTheDocument();
    expect(screen.getByText("No se pudo decidir")).toBeInTheDocument();
    expect(screen.getByText("Se contradicen.")).toBeInTheDocument();
  });

  it("reports how long it took, split into waiting and judging", async () => {
    body = {
      alert_id: ALERT,
      state: "evaluated",
      evaluation: evaluated,
      job: job("evaluated", {
        started_at: "2026-11-06T12:00:03Z",
        finished_at: "2026-11-06T12:00:14Z",
        attempts: 1,
        wait_ms: 3000,
        run_ms: 8000,
        total_ms: 14000,
      }),
    };
    show();

    const timings = await screen.findByTestId("evaluation-timings");
    expect(timings).toHaveTextContent("pedida a mano");
    expect(timings).toHaveTextContent("tardó 14,0 s en total (3,0 s en cola + 8,0 s evaluando)");
  });

  it("tells that the evaluator has it queued without touching the alert", async () => {
    body = { alert_id: ALERT, state: "queued", evaluation: null, job: job("queued") };
    show();

    expect(await screen.findByText("En cola de evaluación")).toBeInTheDocument();
    expect(screen.getByText(/No afecta a la alerta: ya está resuelta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /evaluar/i })).not.toBeInTheDocument();
  });

  it("lets who may ask for an evaluation do it, once, and shows it queued", async () => {
    asked = 0;
    body = { alert_id: ALERT, state: "not_sampled", evaluation: null, job: null };
    show(true);

    await userEvent.click(await screen.findByRole("button", { name: "Evaluar ahora" }));

    expect(await screen.findByText("En cola de evaluación")).toBeInTheDocument();
    expect(asked).toBe(1);
  });

  it("does not offer the button without permission, and offers a retry after a failure", async () => {
    body = { alert_id: ALERT, state: "not_sampled", evaluation: null, job: null };
    show(false);
    expect(await screen.findByText("Sin evaluación")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evaluar ahora" })).not.toBeInTheDocument();
  });

  it("offers to evaluate again after a failure", async () => {
    body = {
      alert_id: ALERT,
      state: "failed",
      evaluation: null,
      job: job("failed", { error_code: "EVALUATION_FAILED", attempts: 4 }),
    };
    show(true);

    expect(await screen.findByText("La evaluación falló")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a evaluar" })).toBeInTheDocument();
  });
});
