import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { FraudArchiveDrawer } from "@/components/fraude/FraudArchive";

const ALERT = "00000000-0000-4000-8000-0000000011c0";
const hit = { alert_id: ALERT, event_id: "EV-1", created_day: "2024-02-29", legal_hold: false };
const detail = {
  alert_id: ALERT,
  created_day: "2024-02-29",
  archive_object: "fraud-history-archive/x.jsonl.gz",
  verified_against: "record",
  alert: { alert_id: ALERT, event_id: "EV-1" },
  fraud_label_reviews: [],
};

let searches: string[];
let placed: Record<string, unknown> | undefined;
let holdActive: boolean;

const server = setupServer(
  http.get("*/api/v0/fraud-history/archive", ({ request }) => {
    searches.push(new URL(request.url).search);
    return HttpResponse.json([{ ...hit, legal_hold: holdActive }]);
  }),
  http.get(`*/api/v0/fraud-history/archive/${ALERT}`, () => HttpResponse.json(detail)),
  http.get(`*/api/v0/fraud-history/legal-holds/${ALERT}`, () =>
    holdActive
      ? HttpResponse.json({
          alert_id: ALERT,
          active: true,
          reason: "Requerimiento judicial 123",
          case_reference: "CASO-1",
          placed_by: "u1",
          placed_at: "2026-11-04T10:00:00Z",
          released_at: null,
          released_by: null,
          release_reason: null,
        })
      : HttpResponse.json({ detail: { code: "LEGAL_HOLD_NOT_FOUND" } }, { status: 404 }),
  ),
  http.put(`*/api/v0/fraud-history/legal-holds/${ALERT}`, async ({ request }) => {
    placed = (await request.json()) as Record<string, unknown>;
    if (placed.reason === "ya retenida pero largo") {
      return HttpResponse.json({ detail: { code: "LEGAL_HOLD_ALREADY_ACTIVE" } }, { status: 409 });
    }
    holdActive = true;
    return HttpResponse.json({ alert_id: ALERT, active: true }, { status: 201 });
  }),
  http.get("*/api/v0/fraud-history/legal-holds", () => HttpResponse.json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

async function openDetail(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Buscar por"), "event_id");
  await user.type(screen.getByLabelText("Valor a buscar en el archivo"), "EV-1");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  await user.click(await screen.findByRole("button", { name: `Abrir ${ALERT}` }));
}

describe("FraudArchiveDrawer", () => {
  it("searches by event id, opens the verified detail and places a hold with its reason", async () => {
    searches = [];
    placed = undefined;
    holdActive = false;
    const user = userEvent.setup();
    render(wrap(<FraudArchiveDrawer open onOpenChange={() => {}} canHold />));

    await openDetail(user);

    expect(searches).toEqual(["?event_id=EV-1&limit=100"]);
    expect(await screen.findByText(/Integridad verificada/)).toBeInTheDocument();
    const panel = await screen.findByRole("region", { name: "Retención legal" });
    expect(within(panel).getByRole("button", { name: "Retener" })).toBeDisabled();

    await user.type(
      within(panel).getByLabelText("Motivo de la retención"),
      "Requerimiento judicial 123",
    );
    await user.type(within(panel).getByLabelText("Referencia del caso"), "CASO-1");
    await user.click(within(panel).getByRole("button", { name: "Retener" }));

    await waitFor(() =>
      expect(placed).toEqual({ reason: "Requerimiento judicial 123", case_reference: "CASO-1" }),
    );
    expect(await within(panel).findByText("Requerimiento judicial 123")).toBeInTheDocument();
  });

  it("explains a conflicting hold in plain language", async () => {
    searches = [];
    holdActive = false;
    const user = userEvent.setup();
    render(wrap(<FraudArchiveDrawer open onOpenChange={() => {}} canHold />));
    await openDetail(user);
    const panel = await screen.findByRole("region", { name: "Retención legal" });

    await user.type(
      within(panel).getByLabelText("Motivo de la retención"),
      "ya retenida pero largo",
    );
    await user.click(within(panel).getByRole("button", { name: "Retener" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Esa alerta ya está retenida.",
    );
  });

  it("is read-only without the legal_hold permission", async () => {
    searches = [];
    holdActive = false;
    const user = userEvent.setup();
    render(wrap(<FraudArchiveDrawer open onOpenChange={() => {}} canHold={false} />));

    expect(screen.queryByRole("tab", { name: "Retenciones" })).not.toBeInTheDocument();
    await openDetail(user);

    const panel = await screen.findByRole("region", { name: "Retención legal" });
    expect(await within(panel).findByText("Sin retención activa.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Retener" })).not.toBeInTheDocument();
  });
});
