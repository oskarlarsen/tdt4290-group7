import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F8FAF9] px-4 text-center">
      <h1 className="text-xl font-semibold">Ingen tilgang</h1>
      <p className="text-neutral-600">Du har ikke tilgang til denne siden.</p>
      <Link className="rounded-lg bg-primary-900 px-4 py-2 text-sm font-medium text-white" to="/">Gå til startsiden</Link>
    </main>
  );
}
