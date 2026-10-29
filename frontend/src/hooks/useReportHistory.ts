import { useEffect, useState } from "react";
import type { ReportId } from "../types/report";

type ReportGeneration = { reportId: ReportId; at: string };

const STORAGE_KEY = "report_generation_history";
const MAX_ENTRIES = 200;

function isGeneration(value: unknown): value is ReportGeneration {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.reportId === "string" && typeof v.at === "string";
}

function readHistory(): ReportGeneration[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isGeneration) : [];
  } catch {
    return [];
  }
}

// Records when a report was actually downloaded, in THIS browser only (localStorage).
// It feeds "Last generated" and "Generated this month", so those are real values,
// never invented. TODO(backend): becomes a server-side audit trail of generated reports.
export function useReportHistory() {
  const [history, setHistory] = useState(readHistory);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Keep the page usable if storage is unavailable.
    }
  }, [history]);

  function record(reportId: ReportId) {
    const entry: ReportGeneration = { reportId, at: new Date().toISOString() };
    setHistory((current) => [entry, ...current].slice(0, MAX_ENTRIES)); // newest first
  }

  function lastGeneratedAt(reportId: ReportId): string | null {
    return history.find((h) => h.reportId === reportId)?.at ?? null;
  }

  const now = new Date();
  const generatedThisMonth = history.filter((h) => {
    const date = new Date(h.at);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;

  return { record, lastGeneratedAt, generatedThisMonth, latest: history[0] ?? null };
}