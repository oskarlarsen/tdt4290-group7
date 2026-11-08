import { AccessPanel } from "../../components/access/AccessPanel";

export default function Access() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Access</h1>
      <p className="text-sm text-neutral-600">
        Everyone with access, administrators and suppliers. Approve a stand-in's access to keep it if the person who gave it later loses theirs.
      </p>
      <AccessPanel mode="admin" />
    </div>
  );
}
