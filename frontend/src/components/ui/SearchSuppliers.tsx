import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardSummary } from "../../hooks/useDashboardSummary";

// TODO: Replace client-side search with the backend search endpoint when available
export function SearchSuppliers() {
  const { data } = useDashboardSummary();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const supplierMatches =
    q.length > 0
      ? (data?.topRiskSuppliers ?? []).filter(
          (s) =>
            s.displayName.toLowerCase().includes(q) ||
            s.orgId.toLowerCase().includes(q) ||
            s.primaryContract.toLowerCase().includes(q)
        )
      : [];
  const alertMatches =
    q.length > 0
      ? (data?.recentAlerts ?? []).filter(
          (a) => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
        )
      : [];

  return (
    <div className="relative w-full max-w-sm" ref={ref}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search suppliers, contracts, alerts…"
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-sm text-neutral-700 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-700/20 focus:border-primary-700"
      />

      {open && q.length > 0 && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-96 overflow-y-auto rounded-lg border border-neutral-100 bg-white p-1 shadow-card">
          {supplierMatches.length === 0 && alertMatches.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-500">No matches.</div>
          )}
          {supplierMatches.length > 0 && (
            <div className="px-3 pt-2 text-[10px] font-mono uppercase tracking-wide text-neutral-500">Suppliers</div>
          )}
          {supplierMatches.map((s) => (
            <button
              key={s.id}
              onClick={() => { setOpen(false); setQuery(""); navigate(`/admin/suppliers/${s.id}`); }}
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-neutral-50"
            >
              <div className="text-sm font-medium text-neutral-900">{s.displayName}</div>
              <div className="text-xs text-neutral-500">{s.primaryContract} · {s.orgId}</div>
            </button>
          ))}
          {alertMatches.length > 0 && (
            <div className="px-3 pt-2 text-[10px] font-mono uppercase tracking-wide text-neutral-500">Alerts</div>
          )}
          {alertMatches.map((a) => (
            <button
              key={a.id}
              onClick={() => { setOpen(false); setQuery(""); navigate(`/admin/alerts?highlight=${a.id}`); }}
              className="block w-full rounded-md px-3 py-2 text-left hover:bg-neutral-50"
            >
              <div className="text-sm font-medium text-neutral-900">{a.title}</div>
              <div className="text-xs text-neutral-500">{a.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}