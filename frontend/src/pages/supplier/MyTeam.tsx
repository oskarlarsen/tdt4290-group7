import { AccessPanel } from "../../components/access/AccessPanel";

export default function MyTeam() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Team</h1>
      <p className="text-sm text-neutral-600">Give colleagues access, or a stand-in while someone is away. Access ends by itself on the end date.</p>
      <AccessPanel mode="supplier" />
    </div>
  );
}
