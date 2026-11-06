// External-module work: CSV serialisation for GET /reports/export.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

function cell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let s = raw instanceof Date ? raw.toISOString() : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  // CSV injection: spreadsheet apps treat these leading characters as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialise rows to CSV. Guard against CSV injection: prefix any cell that starts with
 * `=`, `+`, `-` or `@` with `'`.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}
