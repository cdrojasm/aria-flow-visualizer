import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchemaStatusBand } from "@/components/configuracion/schema/SchemaStatusBand";

const props = {
  activeVersion: null,
  viewedText: null,
  requiredCovered: 0,
  requiredTotal: 7,
  optionalCovered: 0,
  optionalTotal: 2,
  toReview: 0,
  sensitiveWithoutStrategy: 0,
  primary: "edit" as const,
  primaryDisabled: false,
  primaryHint: null,
  pending: false,
  onPrimary: () => {},
  canReject: false,
  onReject: () => {},
  canDiscard: false,
  onDiscard: () => {},
};

describe("SchemaStatusBand while loading", () => {
  it("shows a neutral placeholder, never a false 0/7 alarm or an action", () => {
    render(<SchemaStatusBand {...props} loading />);
    expect(screen.getByText("Cargando esquema…")).toBeInTheDocument();
    expect(screen.queryByText(/Esenciales/)).toBeNull();
    expect(screen.queryByText(/Sin versión activa/)).toBeNull();
    expect(screen.queryByTestId("schema-primary-action")).toBeNull();
  });
  it("shows the real chips once loaded", () => {
    render(<SchemaStatusBand {...props} activeVersion={78} requiredCovered={7} />);
    expect(screen.getByText(/Esenciales: 7\/7/)).toBeInTheDocument();
  });
});
