import { describe, expect, it } from "vitest";

import { historicalTierCodes, validateAmountTiers, type AmountTier } from "@/lib/amountTiers";
import {
  collectAlertHistoryPage,
  type ApiAlertHistoryItem,
  type ApiAlertHistoryPage,
} from "@/lib/api/alerts.functions";
import { metricsSearchParams } from "@/lib/api/metrics.functions";
import {
  customDayRange,
  falsePositiveRate,
  formatPct,
  NO_DATA,
  ratio,
  toMetricsFilters,
  undetectedFraudRate,
  worstMaturation,
} from "@/lib/api/metricsMapping";

const tier = (code: string, min: number, max: number | null): AmountTier => ({
  code,
  label: code,
  minInclusive: min,
  maxExclusive: max,
});

describe("validateAmountTiers (mirror of backend validate_amount_tiers)", () => {
  it("accepts an empty list and a contiguous 0 -> inf cover in any order", () => {
    expect(validateAmountTiers([])).toEqual([]);
    expect(
      validateAmountTiers([
        tier("alto", 5000, null),
        tier("bajo", 0, 1000),
        tier("medio", 1000, 5000),
      ]),
    ).toEqual([]);
  });

  it("flags gaps, overlaps, a non-zero start and a bounded last tier", () => {
    expect(validateAmountTiers([tier("a", 0, 1000), tier("b", 1200, null)]).join(" ")).toMatch(
      /hueco/,
    );
    expect(validateAmountTiers([tier("a", 0, 1500), tier("b", 1000, null)]).join(" ")).toMatch(
      /solapan/,
    );
    expect(validateAmountTiers([tier("a", 10, null)]).join(" ")).toMatch(/empezar en 0/);
    expect(validateAmountTiers([tier("a", 0, 1000)]).join(" ")).toMatch(/sin tope/);
    expect(validateAmountTiers([tier("a", 0, null), tier("b", 0, null)]).join(" ")).toMatch(
      /Sólo el último/,
    );
  });

  it("flags empty, duplicated and reserved codes", () => {
    expect(validateAmountTiers([tier(" ", 0, null)]).join(" ")).toMatch(/necesita un código/);
    expect(validateAmountTiers([tier("x", 0, 10), tier("x", 10, null)]).join(" ")).toMatch(
      /repetidos/,
    );
    expect(validateAmountTiers([tier("unknown", 0, null)]).join(" ")).toMatch(/reservado/);
  });
});

describe("metrics rates are numerator / denominator on the client", () => {
  const quality = {
    decided: 200,
    pending: 7,
    true_positives: 50,
    true_negatives: 130,
    false_positives: 15,
    undetected_fraud: 5,
    true_positive_amount_sum: 0,
    false_positive_amount_sum: 0,
    undetected_fraud_amount_sum: 0,
    reviewed: 0,
    reviewed_changed: 0,
    reviewed_confirmed: 0,
    review_events: 0,
    maturation_histogram: [],
  };

  it("computes FP and undetected fraud over decided alerts (pending excluded)", () => {
    expect(falsePositiveRate(quality)).toBeCloseTo(0.075);
    expect(undetectedFraudRate(quality)).toBeCloseTo(0.025);
  });

  it("shows 'sin datos' when the denominator is zero", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(formatPct(ratio(3, 0))).toBe(NO_DATA);
    expect(falsePositiveRate({ ...quality, decided: 0 })).toBeNull();
  });

  it("picks the least mature period state", () => {
    expect(worstMaturation([])).toBeNull();
    expect(worstMaturation([{ maturation: "stable" }, { maturation: "may_vary" }])).toBe(
      "may_vary",
    );
    expect(worstMaturation([{ maturation: "may_vary" }, { maturation: "maturing" }])).toBe(
      "maturing",
    );
  });
});

describe("metrics query", () => {
  it("serializes repeatable filters and skips empty values", () => {
    const params = metricsSearchParams({
      from: "2026-09-01T00:00:00",
      filters: { channel: ["WEB", "APP"], segment: [""], amount_tier: ["alto"] },
    });
    expect(params.getAll("channel")).toEqual(["WEB", "APP"]);
    expect(params.has("segment")).toBe(false);
    expect(params.get("from")).toBe("2026-09-01T00:00:00");
    expect(params.has("to")).toBe(false);
  });

  it("turns a UI single-select into wire filters", () => {
    expect(toMetricsFilters({ segment: "tarjetas", channel: undefined, status: "" })).toEqual({
      segment: ["tarjetas"],
    });
  });

  it("sends whole days, half-open, without offset (read in Bogotá)", () => {
    expect(customDayRange(new Date(2026, 8, 1), new Date(2026, 8, 30))).toEqual({
      from: "2026-09-01T00:00:00",
      to: "2026-10-01T00:00:00",
    });
  });
});

describe("collectAlertHistoryPage", () => {
  const item = (id: string) => ({ alert_id: id }) as ApiAlertHistoryItem;

  it("keeps following the cursor through short/empty pages until enough rows or no cursor", async () => {
    const pages: Record<string, ApiAlertHistoryPage> = {
      start: { items: [item("a")], next_cursor: "c1" },
      c1: { items: [], next_cursor: "c2" },
      c2: { items: [item("b"), item("c")], next_cursor: "c3" },
      c3: { items: [item("d")], next_cursor: null },
    };
    const cursors: (string | null | undefined)[] = [];
    const fetchPage = async ({ data }: { data: { cursor?: string | null } }) => {
      cursors.push(data.cursor);
      return pages[data.cursor ?? "start"];
    };
    const page = await collectAlertHistoryPage({}, null, { minItems: 3, fetchPage });
    expect(page.items.map((i) => i.alert_id)).toEqual(["a", "b", "c"]);
    expect(page.next_cursor).toBe("c3");
    expect(cursors).toEqual([null, "c1", "c2"]);

    const rest = await collectAlertHistoryPage({}, page.next_cursor, { minItems: 3, fetchPage });
    expect(rest).toEqual({ items: [item("d")], next_cursor: null });
  });
});

describe("historicalTierCodes", () => {
  it("collects tier codes from amount_tiers history entries that are not current", () => {
    const history = [
      {
        changes: [
          {
            path: "amount_tiers",
            previous: [{ code: "bajo", label: "Bajo" }],
            new: [{ code: "b1", label: "" }],
          },
        ],
      },
      { changes: [{ path: "agent_enabled", previous: true, new: false }] },
    ];
    expect([...historicalTierCodes(history, new Set(["b1"]))]).toEqual([["bajo", "Bajo"]]);
  });
});
