import { AccessPanel } from "../../components/access/AccessPanel";

export default function Access() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Tilgang</h1>
      <p className="text-sm text-neutral-600">
        Alle med tilgang, administratorer og leverandører. Godkjenn en midlertidig tilgang for å beholde den hvis personen som ga den senere mister sin egen.
      </p>
      <AccessPanel mode="admin" />
    </div>
  );
}
