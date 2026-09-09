export function FilterSidebar() {
  return (
    <aside className="w-56 border-r p-4 space-y-4">
      <div>
        <label className="block text-xs text-gray-500">Leverandør</label>
        <select className="w-full border rounded p-1" />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Avtale</label>
        <select className="w-full border rounded p-1" />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Periode</label>
        <select className="w-full border rounded p-1" />
      </div>
      <button className="text-sm underline">Oppdater visning</button>
    </aside>
  );
}
