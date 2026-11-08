type Column<T> = { key: keyof T; header: string };

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
}: {
  columns: Column<T>[];
  rows: T[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {columns.map((c) => (
            <th scope="col" key={String(c.key)} className="text-left p-2 border-b">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => (
              <td key={String(c.key)} className="p-2 border-b">
                {String(row[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
