import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2"><Link className="underline" to="/">Go to the start page</Link></p>
    </main>
  );
}
