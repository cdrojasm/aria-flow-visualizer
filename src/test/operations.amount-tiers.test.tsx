import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OperationsPanel } from "@/components/configuracion/OperationsPanel";

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    user: {
      id: "u1",
      email: "ops@bbva.test",
      name: "Ops",
      role: "channel_manager",
      permissions: ["configuration"],
    },
    role: "channel_manager",
    signIn: vi.fn(),
    logout: vi.fn(),
  }),
}));

const settings = {
  agent_enabled: true,
  analyst_enabled: true,
  voicebot_enabled: true,
  max_instances: 8,
  auto_scale: true,
  voicebot_max_concurrent_calls: 40,
  analyst_capacity: {
    profiles: [{ id: "p", name: "Base", description: "", hourly: Array(24).fill(1) }],
    default_profile_id: "p",
    day_overrides: {},
  },
  queue_max_lifetime_value: 60,
  queue_max_lifetime_unit: "minutes",
  queue_discard_amount_threshold: 0,
  queue_rule_filter_enabled: false,
  queue_rule_filter_mode: "belongs",
  queue_allowed_triggered_rules: [],
  queue_discard_behavior: { resolution_tag: "block_soft", resolution_method_id: null },
  max_test_instances: 4,
  max_concurrent_experiments: 3,
  experiment_timeout_minutes: 30,
  max_stored_test_runs: 20,
  test_cleanup_policy: "oldest",
  amount_tiers: [
    { code: "bajo", label: "Bajo", min_inclusive: 0, max_exclusive: 1000 },
    { code: "alto", label: "Alto", min_inclusive: 1000, max_exclusive: null },
  ],
  reasoning_evaluation_sample_rate: 0.05,
};

let putBody: { settings: typeof settings } | undefined;
const server = setupServer(
  http.get("*/api/v0/operational-settings", () => HttpResponse.json(settings)),
  http.get("*/api/v0/operational-settings/history", () => HttpResponse.json([])),
  http.get("*/api/v0/operations/capacity", () =>
    HttpResponse.json({
      analysts: { available: 1, status: "available", total: 1 },
      voicebot: { available: 1, status: "available", total: 1 },
      bidi: { available: 0, status: "unavailable", total: null },
      updated_at: "2026-10-01T00:00:00Z",
    }),
  ),
  http.get("*/api/v0/resolution-methods", () => HttpResponse.json([])),
  http.get("*/api/v0/tags", () => HttpResponse.json([])),
  http.put("*/api/v0/operational-settings", async ({ request }) => {
    putBody = (await request.json()) as { settings: typeof settings };
    return HttpResponse.json(putBody.settings);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Operación → rangos de monto y muestreo de evaluación", () => {
  it("validates tiers live, blocks saving while invalid and sends tiers + sample rate", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OperationsPanel />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Sólo aplica a alertas nuevas.")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /Guardar y aplicar/ });

    // Break contiguity: "bajo" now ends at 900, "alto" starts at 1000.
    const bajoMax = screen.getByLabelText("Hasta del rango 1");
    await user.clear(bajoMax);
    await user.type(bajoMax, "900");
    expect(await screen.findByText(/Hay un hueco entre "bajo" y "alto"/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(bajoMax);
    await user.type(bajoMax, "1000");
    const rate = screen.getByLabelText("Porcentaje de muestreo de evaluación");
    await user.clear(rate);
    await user.type(rate, "10");
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody!.settings.amount_tiers).toEqual(settings.amount_tiers);
    expect(putBody!.settings.reasoning_evaluation_sample_rate).toBeCloseTo(0.1);
  });
});
