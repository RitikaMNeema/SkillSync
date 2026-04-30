import { UserRoundCheck, Users } from "lucide-react";
import { cn } from "../../utils/cn";
import { NetworkCard } from "./NetworkCard";

export type NetworkSidebarKey = "connections" | "following";

type NetworkSidebarProps = {
  connectionsCount: number;
  /** Placeholder until follow data exists in API */
  followingCount: number;
  active: NetworkSidebarKey;
  onSelect: (key: NetworkSidebarKey) => void;
};

export function NetworkSidebar({ connectionsCount, followingCount, active, onSelect }: NetworkSidebarProps) {
  const itemClass = (key: NetworkSidebarKey) =>
    cn(
      "relative flex w-full items-center justify-between rounded-r-md py-2 pl-3 pr-2 text-left text-[15px] font-medium transition-colors",
      active === key
        ? "bg-[#e8f3fc] text-[#0a66c2] before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r before:bg-[#0a66c2]"
        : "text-[#222] hover:bg-[#f3f2ef]"
    );

  const iconClass = (key: NetworkSidebarKey) =>
    cn("h-[18px] w-[18px] shrink-0", active === key ? "text-[#0a66c2]" : "text-[#666]");

  return (
    <NetworkCard className="sticky top-[68px]" padded={false}>
      <div className="p-3">
        <h2 className="px-1 pb-2 text-lg font-semibold text-[#222]">Manage my network</h2>
        <nav className="flex flex-col gap-0.5" aria-label="Network sections">
          <button type="button" className={itemClass("connections")} onClick={() => onSelect("connections")}>
            <span className="inline-flex items-center gap-2.5 pl-1">
              <Users className={iconClass("connections")} aria-hidden />
              Connections
            </span>
            <span className={cn("text-sm font-semibold tabular-nums", active === "connections" ? "text-[#0a66c2]" : "text-[#666]")}>
              {connectionsCount}
            </span>
          </button>
          <button type="button" className={itemClass("following")} onClick={() => onSelect("following")}>
            <span className="inline-flex items-center gap-2.5 pl-1">
              <UserRoundCheck className={iconClass("following")} aria-hidden />
              People I follow
            </span>
            <span className={cn("text-sm font-semibold tabular-nums", active === "following" ? "text-[#0a66c2]" : "text-[#666]")}>
              {followingCount}
            </span>
          </button>
        </nav>
      </div>
    </NetworkCard>
  );
}
