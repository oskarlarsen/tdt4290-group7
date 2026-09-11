type Status = "red" | "orange" | "yellow" | "tertiary";

const COLORS: Record<Status, string> = {
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  yellow: "bg-yellow-100 text-yellow-700",
  tertiary: "bg-tertiary-100 text-tertiary-700",
};

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${COLORS[status]}`}>
      {label}
    </span>
  );
}