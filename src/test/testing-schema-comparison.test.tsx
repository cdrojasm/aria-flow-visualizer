import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchemaComparison } from "@/components/testing/SchemaComparison";

describe("SchemaComparison", () => {
  it("marks fields that appear, disappear and change", () => {
    render(
      <SchemaComparison
        comparison={{
          active: {
            schema_version: 1,
            input: { kept: 1, removed: "x", changed: "old" },
            labels: {},
            history_prev_alerta: [],
          },
          candidate: {
            schema_version: 2,
            input: { kept: 1, added: true, changed: "new" },
            labels: {},
            history_prev_alerta: [],
          },
        }}
      />,
    );
    expect(screen.getByText("added")).toBeInTheDocument();
    expect(screen.getByText("removed")).toBeInTheDocument();
    expect(screen.getAllByText("Cambia")).toHaveLength(1);
  });
});
