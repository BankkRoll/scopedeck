const NEEDS_QUOTING = /[",\r\n]/;
// Spreadsheet apps execute cells starting with these characters as formulas, and the values
// come from the API, so they are neutralised with a leading apostrophe.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
