import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { OperationsPanel } from "@/components/configuracion/OperationsPanel";
import { TrafficGateDial, trafficGateWarnings } from "@/components/configuracion/TrafficGateDial";

vi.mock("@/hooks/useRole", () => ({
  useRole: () => ({
    user: {
      id: "u1",
      email: "admin@aria.test",
      name: "Admin",
      role: "channel_manager",
      permissions: ["configuration"],
    },
    role: "channel_manager",
    signIn: vi.fn(),
    logout: vi.fn(),
  }),
}));

const available = { available: 2, status: "available", total: 3 };

describe("trafficGateWarnings", () => {
  it("is silent at 100 % whatever the analysts look like", () => {
    expect(trafficGateWarnings({ pct: 100, analystEnabled: false, analysts: undefined })).toEqual(
      [],
    );
  });
  it("warns when analysts are off, exhausted or unavailable", () => {
    expect(
      trafficGateWarnings({ pct: 50, analystEnabled: false, analysts: available }),
    ).toHaveLength(1);
    expect(
      trafficGateWarnings({
        pct: 50,
        analystEnabled: true,
        analysts: { ...available, status: "exhausted" },
      })[0],
    ).toMatch(/No hay analistas libres/);
    expect(
      trafficGateWarnings({
        pct: 50,
        analystEnabled: true,
        analysts: { ...available, status: "unavailable" },
      })[0],
    ).toMatch(/no están disponibles/);
  });
  it("adds the zero-percent warning", () => {
    const warnings = trafficGateWarnings({ pct: 0, analystEnabled: true, analysts: available });
    expect(warnings).toEqual([expect.stringMatching(/0 % ARIA no procesa/)]);
  });
});

describe("TrafficGateDial", () => {
  it("does nothing until the admin confirms in the dialog", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<TrafficGateDial current={100} analystEnabled analysts={available} onApply={onApply} />);
    expect(screen.getByTestId("traffic-current")).toHaveTextContent(
      "ARIA recibe 100 % del tráfico",
    );
    const apply = screen.getByRole("button", { name: /Aplicar porcentaje/ });
    expect(apply).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "25 %" }));
    expect(apply).toBeEnabled();
    expect(onApply).not.toHaveBeenCalled();

    await user.click(apply);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/100 % → 25 %/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aplicar" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(25));
  });

  it("cancelling the announcement applies nothing and keeps the applied value", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<TrafficGateDial current={50} analystEnabled analysts={available} onApply={onApply} />);

    await user.click(screen.getByRole("button", { name: "10 %" }));
    await user.click(screen.getByRole("button", { name: /Aplicar porcentaje/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/Algunas alertas que hoy irían a ARIA pasarán/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByTestId("traffic-current")).toHaveTextContent("50 %");
  });

  it("explains that raising the share keeps the alerts ARIA already had", async () => {
    const user = userEvent.setup();
    render(<TrafficGateDial current={50} analystEnabled analysts={available} onApply={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "100 %" }));
    await user.click(screen.getByRole("button", { name: /Aplicar porcentaje/ }));

    expect(
      within(await screen.findByRole("alertdialog")).getByText(
        /Las alertas que ARIA ya tenía asignadas se mantienen/,
      ),
    ).toBeInTheDocument();
  });

  it("discard returns to the applied value", async () => {
    const user = userEvent.setup();
    render(<TrafficGateDial current={50} analystEnabled analysts={available} onApply={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "5 %" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByRole("button", { name: /Aplicar porcentaje/ })).toBeDisabled();
  });

  it("read-only users cannot prepare or apply", () => {
    render(
      <TrafficGateDial
        current={50}
        analystEnabled
        analysts={available}
        readOnly
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "10 %" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Aplicar porcentaje/ })).toBeDisabled();
  });
});

const settings = {
  agent_enabled: true,
  agent_traffic_pct: 100,
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
  amount_tiers: [{ code: "all", label: "Todo", min_inclusive: 0, max_exclusive: null }],
  reasoning_evaluation_sample_rate: 0.05,
  maturing_days: 4,
  expected_coverage_pct: 98,
  stable_months: 6,
};

let putBody: { settings: typeof settings; changed_by: string | null } | undefined;
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
    putBody = (await request.json()) as typeof putBody;
    return HttpResponse.json(putBody!.settings);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  putBody = undefined;
});
afterAll(() => server.close());

describe("Operación → llave de paso", () => {
  it("PUTs agent_traffic_pct only after confirming, with the saved settings", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <OperationsPanel />
      </QueryClientProvider>,
    );
    const gate = await screen.findByTestId("traffic-gate");

    await user.click(within(gate).getByRole("button", { name: "25 %" }));
    await user.click(within(gate).getByRole("button", { name: /Aplicar porcentaje/ }));
    expect(putBody).toBeUndefined();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aplicar" }));

    await waitFor(() => expect(putBody).toBeDefined());
    expect(putBody!.settings.agent_traffic_pct).toBe(25);
    expect(putBody!.settings.agent_enabled).toBe(true);
    expect(putBody!.changed_by).toBe("admin@aria.test");
    await waitFor(() =>
      expect(screen.getByTestId("traffic-current")).toHaveTextContent(
        "ARIA recibe 25 % del tráfico",
      ),
    );
    // The generic save button stays untouched by the gate.
    expect(screen.getByRole("button", { name: /Guardar y aplicar/ })).toBeDisabled();
  });
});
