import { Search } from "lucide-react";
import { SupplierNotificationBell } from "./SupplierNotificationBell";
import { ProfileMenu } from "./ProfileMenu";

export function SupplierTopBar() {
  return (
    <div className="flex items-center gap-4 border-b border-neutral-100 bg-white px-6 py-3 h-14">
      {/* Search Input visually similar to Admin Dashboard but disabled */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          disabled
          title="Search feature is not yet available for the supplier portal"
          className="w-full cursor-not-allowed rounded-md border border-neutral-200 bg-neutral-50/50 pl-9 pr-4 py-1.5 text-sm outline-none placeholder:text-neutral-400 opacity-70"
          placeholder="Search documents and vehicles..."
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <SupplierNotificationBell />
        <ProfileMenu variant="compact" />
      </div>
    </div>
  );
}
