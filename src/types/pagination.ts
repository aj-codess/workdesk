import type { PageMeta } from "@/utilities/api-response";

export type SortOrder = "asc" | "desc";

export interface PageQuery {
  page: number;
  limit: number;
  order: SortOrder;
}

/** What list models return: rows plus the total so the controller can build `meta`. */
export interface Paginated<T> {
  rows: T[];
  total: number;
}

export function buildMeta(query: Pick<PageQuery, "page" | "limit">, total: number): PageMeta {
  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
