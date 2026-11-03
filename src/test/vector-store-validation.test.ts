import { describe, expect, it } from "vitest";

import { vectorStoreValidationErrors } from "@/components/configuracion/shared/vectorStoreValidation";
import { defaultToolPickerFields, type ToolPickerFields } from "@/data/configs";

function tools(enabled: boolean, instanceId: string | null): ToolPickerFields {
  const base = defaultToolPickerFields();
  return {
    ...base,
    delegatedResearch: {
      ...base.delegatedResearch,
      vectorStore: {
        ...base.delegatedResearch.vectorStore,
        enabled,
        vectorStoreInstanceId: instanceId,
      },
    },
  };
}

describe("vectorStoreValidationErrors", () => {
  it("names each segment and step with the search on and no instance", () => {
    expect(
      vectorStoreValidationErrors({
        TC: {
          agent: {
            detector: tools(true, null),
            detectorAdversarial: tools(false, null),
            classification: tools(true, "vs-1"),
            adversarial: tools(true, null),
          },
        },
        PSE: { agent: { detector: tools(false, null) } },
      }),
    ).toEqual(["TC · Detector", "TC · Adversarial (clasificador)"]);
  });

  it("accepts segments without agent settings", () => {
    expect(vectorStoreValidationErrors({ TC: {} })).toEqual([]);
  });
});
