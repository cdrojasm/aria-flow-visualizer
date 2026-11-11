import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LlmSelectionTable } from "@/components/llm/LlmSelectionTable";
import { StepLlmBadge } from "@/components/llm/StepLlmBadge";
import type { LlmCatalogResponse, LlmSelection } from "@/lib/api/llmCatalog.functions";

const ELEMENTS = [
  { element: "detector", group: "workflow", default_deployment: "gpt-default" },
  { element: "analyst", group: "workflow", default_deployment: "" },
  { element: "judge", group: "support", default_deployment: "gpt-judge" },
] as const;

let catalog: LlmCatalogResponse;
const server = setupServer(http.get("*/api/v0/llm-catalog", () => HttpResponse.json(catalog)));

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function Harness({
  initial = {},
  group,
  onChange,
}: {
  initial?: LlmSelection;
  group?: "workflow" | "support";
  onChange?: (next: LlmSelection) => void;
}) {
  const [value, setValue] = useState<LlmSelection>(initial);
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LlmSelectionTable
        value={value}
        group={group}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </QueryClientProvider>
  );
}

describe("LlmSelectionTable", () => {
  it("lists every element with its default and stores the catalog name", async () => {
    catalog = {
      entries: [{ name: "preciso", deployment: "gpt-big" }],
      elements: [...ELEMENTS],
    };
    const changes: LlmSelection[] = [];
    render(<Harness onChange={(next) => changes.push(next)} />);

    const detector = await screen.findByTestId("llm-select-detector");
    expect(screen.getByRole("option", { name: "Por defecto (gpt-default)" })).toBeTruthy();
    expect(screen.getByTestId("llm-select-judge")).toBeTruthy();

    await userEvent.selectOptions(detector, "preciso");
    expect(changes.at(-1)).toEqual({ detector: "preciso" });

    await userEvent.selectOptions(detector, "");
    expect(changes.at(-1)).toEqual({ detector: null });
  });

  it("restricts to a group", async () => {
    catalog = { entries: [{ name: "preciso", deployment: "gpt-big" }], elements: [...ELEMENTS] };
    render(<Harness group="workflow" />);
    await screen.findByTestId("llm-select-detector");
    expect(screen.queryByTestId("llm-select-judge")).toBeNull();
  });

  it("flags a saved name that is no longer in the catalog", async () => {
    catalog = { entries: [{ name: "preciso", deployment: "gpt-big" }], elements: [...ELEMENTS] };
    render(<Harness initial={{ analyst: "borrado" }} />);
    expect(
      await screen.findByRole("option", { name: "borrado (fuera del catálogo)" }),
    ).toBeTruthy();
  });

  it("explains when there is no catalog", async () => {
    catalog = { entries: [], elements: [...ELEMENTS] };
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("llm-select-empty")).toBeTruthy());
    expect(screen.queryByTestId("llm-select-detector")).toBeNull();
  });
});

describe("StepLlmBadge", () => {
  it("shows the logical name with its deployment", () => {
    render(
      <StepLlmBadge
        output={{ llm: { name: "preciso", deployment: "gpt-big", source: "configuration" } }}
      />,
    );
    const badge = screen.getByTestId("step-llm");
    expect(badge.textContent).toContain("preciso");
    expect(badge.textContent).toContain("gpt-big");
    expect(badge.getAttribute("title")).toContain("elegido en la configuración");
  });

  it("shows the default deployment when no name was chosen", () => {
    render(
      <StepLlmBadge
        output={{ llm: { name: null, deployment: "gpt-default", source: "default" } }}
      />,
    );
    expect(screen.getByTestId("step-llm").textContent).toContain("gpt-default");
  });

  it("renders nothing for steps that did not call an LLM", () => {
    render(<StepLlmBadge output={{ decision: "pass" }} />);
    expect(screen.queryByTestId("step-llm")).toBeNull();
  });
});
