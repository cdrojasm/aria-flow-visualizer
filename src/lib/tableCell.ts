// Shared cell-rendering helper for raw dataset row tables (DatasetRowsTab,
// DatasetSummaryTab's example records, PickDatasetRecordsModal) - dataset
// content is arbitrary and can contain very long strings (raw JSON blobs,
// concatenated notes) that blow out a table row. Trim at a fixed length and
// keep the full value in `title` so it's still available on hover.

export const CELL_TRUNCATE_LENGTH = 90;

export function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return String(value);
}

export function truncateCellValue(
  value: unknown,
  max: number = CELL_TRUNCATE_LENGTH,
): { display: string; full: string; truncated: boolean } {
  const full = formatCellValue(value);
  if (full.length <= max) return { display: full, full, truncated: false };
  return { display: `${full.slice(0, max)}…`, full, truncated: true };
}
