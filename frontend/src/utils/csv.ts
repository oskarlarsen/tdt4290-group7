// Spreadsheets run text starting with these as formulas; numbers (e.g. -5) are safe as they are.
function guardFormula(value: string | number): string {
  return typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const text = guardFormula(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

/**
 * One sheet from a fixed column list. Uses ";" and a UTF-8 byte order mark so Norwegian Excel splits the
 * columns and keeps æøå; a row that lacks a column gets an empty cell.
 */
export function toSemicolonCsv(columns: readonly string[], rows: Record<string, string | number | undefined>[]): string {
  const escape = (value: string | number | undefined) => {
    const text = value === undefined ? "" : guardFormula(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(";"), ...rows.map((row) => columns.map((column) => escape(row[column])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
