export function ExportButton({ onExport }: { onExport?: () => void }) {
  return (
    <button onClick={onExport} className="border rounded px-3 py-1 text-sm">
      Eksporter
    </button>
  );
}
