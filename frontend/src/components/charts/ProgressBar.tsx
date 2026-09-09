export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-gray-100 rounded h-2">
      <div className="bg-blue-500 h-2 rounded" style={{ width: `${percent}%` }} />
    </div>
  );
}
