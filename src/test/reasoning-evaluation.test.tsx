import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
  prompt_version: "v2",
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
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReasoningEvaluationTab alertId={ALERT} />
    </QueryClientProvider>,
  );
}

describe("ReasoningEvaluationTab", () => {
  it("shows the verdict, the judge's rationale and the verdict of each step", async () => {
    body = { alert_id: ALERT, state: "evaluated", evaluation: evaluated };
    show();

    expect(await screen.findByText(evaluated.rationale)).toBeInTheDocument();
    expect(screen.getAllByText("Alucinación").length).toBeGreaterThan(0);
    expect(screen.getByText("Uso incorrecto de datos")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
    expect(screen.getByText("Habla de 9999 y el payload dice 1500.")).toBeInTheDocument();
    expect(screen.getByText(/prompt v2/)).toBeInTheDocument();
    expect(screen.getByText(/2 intentos/)).toBeInTheDocument();
  });

  it("explains why there is no verdict instead of showing an empty tab", async () => {
    body = { alert_id: ALERT, state: "not_sampled", evaluation: null };
    show();

    expect(await screen.findByText("No muestreada")).toBeInTheDocument();
    expect(screen.getByText(/solo revisa una muestra aleatoria/)).toBeInTheDocument();
  });

  it("says when a verdict predates the per-step detail", async () => {
    body = {
      alert_id: ALERT,
      state: "evaluated",
      evaluation: { ...evaluated, steps: [], prompt_version: "v1", attempts: 1 },
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
      },
    };
    show();

    expect(await screen.findByText("Evaluación inválida")).toBeInTheDocument();
  });
});
