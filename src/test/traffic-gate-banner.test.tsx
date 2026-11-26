import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TrafficGateBanner } from "@/components/TrafficGateBanner";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const base = {
  agent_enabled: true,
  agent_traffic_pct: 100,
  analyst_enabled: true,
  voicebot_enabled: true,
  max_instances: 8,
  auto_scale: true,
  voicebot_max_concurrent_calls: 40,
  analyst_capacity: { profiles: [], default_profile_id: "p", day_overrides: {} },
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
  amount_tiers: [],
  reasoning_evaluation_sample_rate: 0.05,
  maturing_days: 4,
  expected_coverage_pct: 98,
  stable_months: 6,
};

let body: Record<string, unknown> | "error" = base;
const server = setupServer(
  http.get("*/api/v0/operational-settings", () =>
    body === "error" ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(body),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  body = base;
});
afterAll(() => server.close());

function renderBanner(canConfigure = true) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TrafficGateBanner canConfigure={canConfigure} />
    </QueryClientProvider>,
  );
}

describe("TrafficGateBanner", () => {
  it("shows the share and a link when the gate is below 100 %", async () => {
    body = { ...base, agent_traffic_pct: 25 };
    renderBanner();

    expect(await screen.findByTestId("traffic-gate-banner")).toHaveTextContent(
      "ARIA recibe 25 % del tráfico",
    );
    expect(screen.getByRole("link", { name: "Ver llave de paso" })).toHaveAttribute(
      "href",
      "/configuracion",
    );
  });

  it("hides the link for roles that cannot open the configuration", async () => {
    body = { ...base, agent_traffic_pct: 10 };
    renderBanner(false);

    await screen.findByTestId("traffic-gate-banner");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it.each([
    ["100 %", { agent_traffic_pct: 100 }],
    ["agent off (kill-switch says it already)", { agent_traffic_pct: 25, agent_enabled: false }],
  ])("stays silent at %s", async (_label, override) => {
    body = { ...base, ...override };
    renderBanner();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId("traffic-gate-banner")).toBeNull();
  });

  it("stays silent when the settings cannot be read", async () => {
    body = "error";
    renderBanner();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId("traffic-gate-banner")).toBeNull();
  });
});
