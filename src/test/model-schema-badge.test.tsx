import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelSchemaBadge } from "@/components/modelos/ModelSchemaBadge";

describe("ModelSchemaBadge", () => {
  it("muestra la versión y 'Requiere revisión' con los campos cambiados", () => {
    render(
      <ModelSchemaBadge
        model={{
          alert_schema_version: 5,
          schema_review: {
            required: true,
            trained_version: 5,
            active_version: 7,
            changed_fields: ["monto", "canal"],
          },
        }}
      />,
    );
    expect(screen.getByTestId("model-schema-version")).toHaveTextContent("Esquema v5");
    const chip = screen.getByTestId("model-schema-review");
    expect(chip).toHaveTextContent("Requiere revisión");
    expect(chip.getAttribute("title")).toContain("monto, canal");
  });

  it("sin revisión requerida solo muestra la versión", () => {
    render(
      <ModelSchemaBadge
        model={{
          alert_schema_version: 7,
          schema_review: {
            required: false,
            trained_version: 7,
            active_version: 7,
            changed_fields: [],
          },
        }}
      />,
    );
    expect(screen.getByTestId("model-schema-version")).toHaveTextContent("Esquema v7");
    expect(screen.queryByTestId("model-schema-review")).toBeNull();
  });

  it("tolera un backend viejo: sin pin no muestra nada", () => {
    const { container } = render(<ModelSchemaBadge model={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
