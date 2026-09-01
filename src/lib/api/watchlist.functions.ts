import { API_BASE, apiFetch } from "./client";

// Client functions wrapping the backend's watchlist API (blacklist/
// whitelist admin). Elements are NOT a field on WatchlistEntry - a gigantic
// list (tens of thousands+ of values) is paginated (listWatchlistElements)
// and mutated incrementally (add/remove/import), never round-tripped whole
// like channelLibrary.functions.ts's small catalogs. Mirrors the backend's
// watchlist_port.py split between Watchlist metadata and its elements.

export type WatchlistType = "blacklist" | "whitelist";

export type WatchlistEntry = {
  id: string;
  name: string;
  description: string;
  list_type: WatchlistType;
  element_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WatchlistElementsPage = {
  values: string[];
  next_cursor: string | null;
};

export function listWatchlists({
  data,
}: {
  data: { listType?: WatchlistType; activeOnly?: boolean };
}): Promise<WatchlistEntry[]> {
  const params = new URLSearchParams();
  if (data.listType) params.set("list_type", data.listType);
  if (data.activeOnly) params.set("active_only", "true");
  const qs = params.toString();
  return apiFetch(`/api/v0/watchlists${qs ? `?${qs}` : ""}`);
}

export function createWatchlist({
  data,
}: {
  data: { name: string; description: string; listType: WatchlistType; elements?: string[] };
}): Promise<WatchlistEntry> {
  return apiFetch("/api/v0/watchlists", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      list_type: data.listType,
      elements: data.elements ?? [],
    }),
  });
}

export function updateWatchlist({
  data,
}: {
  data: { watchlistId: string; name?: string; description?: string; active?: boolean };
}): Promise<WatchlistEntry> {
  const { watchlistId, ...body } = data;
  return apiFetch(`/api/v0/watchlists/${encodeURIComponent(watchlistId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteWatchlist({ data }: { data: { watchlistId: string } }): Promise<void> {
  return apiFetch(`/api/v0/watchlists/${encodeURIComponent(data.watchlistId)}`, {
    method: "DELETE",
  });
}

export function listWatchlistElements({
  data,
}: {
  data: { watchlistId: string; limit?: number; cursor?: string | null };
}): Promise<WatchlistElementsPage> {
  const params = new URLSearchParams();
  if (data.limit) params.set("limit", String(data.limit));
  if (data.cursor) params.set("cursor", data.cursor);
  const qs = params.toString();
  return apiFetch(
    `/api/v0/watchlists/${encodeURIComponent(data.watchlistId)}/elements${qs ? `?${qs}` : ""}`,
  );
}

export function addWatchlistElements({
  data,
}: {
  data: { watchlistId: string; values: string[] };
}): Promise<{ added: number }> {
  return apiFetch(`/api/v0/watchlists/${encodeURIComponent(data.watchlistId)}/elements`, {
    method: "POST",
    body: JSON.stringify({ values: data.values }),
  });
}

export function removeWatchlistElements({
  data,
}: {
  data: { watchlistId: string; values: string[] };
}): Promise<{ removed: number }> {
  return apiFetch(`/api/v0/watchlists/${encodeURIComponent(data.watchlistId)}/elements`, {
    method: "DELETE",
    body: JSON.stringify({ values: data.values }),
  });
}

// FormData payload (the uploaded .csv/.txt file) - bypasses apiFetch's
// forced JSON Content-Type so the browser's multipart boundary reaches the
// backend intact. The bulk-import path for gigantic lists (tens of
// thousands of rows in one file instead of one-by-one form entries).
export async function importWatchlistElements({
  data,
}: {
  data: { watchlistId: string; file: File };
}): Promise<{ added: number }> {
  const body = new FormData();
  body.append("file", data.file);
  const path = `/api/v0/watchlists/${encodeURIComponent(data.watchlistId)}/elements/import`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ added: number }>;
}

export function checkWatchlistMembership({
  data,
}: {
  data: { listType: WatchlistType; value: string };
}): Promise<{ is_member: boolean; matches: { watchlist_id: string; watchlist_name: string }[] }> {
  return apiFetch("/api/v0/watchlists/check-membership", {
    method: "POST",
    body: JSON.stringify({ list_type: data.listType, value: data.value }),
  });
}
