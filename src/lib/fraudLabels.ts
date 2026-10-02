import type { ApiMark } from "@/lib/api/alerts.functions";

// Spanish labels/badges for mark and fraud_label values.
export const MARK_LABELS: Record<ApiMark, string> = {
  fraud: "Fraude",
  no_fraud: "No fraude",
  pending: "Pendiente",
};

export const MARK_BADGES: Record<ApiMark, string> = {
  fraud: "bg-[#fee2e2] text-[#991b1b]",
  no_fraud: "bg-[#dcfce7] text-[#166534]",
  pending: "bg-[#f3f4f6] text-[#374151]",
};
