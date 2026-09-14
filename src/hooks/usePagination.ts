import { useMemo, useState } from "react";

// Keeps the pagination state local to each list. Consumers keep the complete
// query result for filtering/actions and render only `pageItems`.
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize],
  );
  return { page: clampedPage, pageCount, pageItems, setPage, total: items.length, pageSize };
}
