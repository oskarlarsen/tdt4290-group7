import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Siden ble ikke funnet</h1>
      <Link className="rounded-lg bg-primary-900 px-4 py-2 text-sm font-medium text-white" to="/">Gå til startsiden</Link>
    </main>
  );
}
