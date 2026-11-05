import { Bell } from "lucide-react";

export default function MyAlerts() {
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Alerts</h1>

      <section className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
        <div className="flex flex-col items-center py-12 text-center text-sm text-neutral-500">
          <Bell className="mb-3 h-8 w-8 text-neutral-300" />
          <p>Supplier alert records are not yet available from the backend.</p>
          <p className="mt-1">This page does not display demonstration alerts as real notifications.</p>
        </div>
      </section>
    </div>
  );
}