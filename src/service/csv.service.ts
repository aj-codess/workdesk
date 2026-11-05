// External-module work: CSV serialisation for GET /reports/export.
import { notImplemented } from "@/utilities/not-implemented";

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * Serialise rows to CSV. Guard against CSV injection: prefix any cell that starts with
 * `=`, `+`, `-` or `@` with `'`.
 */
export function toCsv<T>(_columns: CsvColumn<T>[], _rows: T[]): string {
  return notImplemented("CsvService.toCsv");
}
