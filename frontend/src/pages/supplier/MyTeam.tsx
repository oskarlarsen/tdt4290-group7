import { AccessPanel } from "../../components/access/AccessPanel";

export default function MyTeam() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Mine kollegaer</h1>
      <p className="text-sm text-neutral-600">Gi kollegaer tilgang, eller midlertidig tilgang mens noen er borte. Tilgangen utløper av seg selv på sluttdatoen.</p>
      <AccessPanel mode="supplier" />
    </div>
  );
}
