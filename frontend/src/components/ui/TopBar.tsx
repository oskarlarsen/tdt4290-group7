import { SearchSuppliers } from "./SearchSuppliers";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";

export function TopBar() {
  return (
    <div className="flex items-center gap-4 border-b border-neutral-100 bg-white px-6 py-3">
      <SearchSuppliers />
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <ProfileMenu variant="compact" />
      </div>
    </div>
  );
}