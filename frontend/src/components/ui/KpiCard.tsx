type Props = { label: string; value: string | number; sublabel?: string };

export function KpiCard({ label, value, sublabel }: Props) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sublabel && <div className="text-xs text-gray-400">{sublabel}</div>}
    </div>
  );
}
