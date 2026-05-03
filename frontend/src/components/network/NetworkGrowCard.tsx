import { ContactRound, Leaf, UserRound, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { NetworkCard } from "./NetworkCard";

/**
 * LinkedIn-style “Grow your network” promo below the network sidebar.
 */
export function NetworkGrowCard() {
  const navigate = useNavigate();

  return (
    <NetworkCard padded={false} className="overflow-hidden">
      <div className="p-3.5">
        <h3 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[#222]">Grow your network</h3>
        <p className="mt-2 text-[13px] leading-[1.35] text-[#666]">
          Add personal contacts and connect with people you know.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3.5 w-full gap-2 rounded-full border border-[#0a66c2] px-4 py-2.5 text-[14px] font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
          onClick={() => navigate("/search")}
        >
          <ContactRound className="h-4 w-4" />
          Find contacts
        </Button>
      </div>
      <div className="border-t border-[#f3f2ef] bg-[#fafafa] px-4 py-3.5">
        <div className="relative mx-auto h-[7.25rem] w-full max-w-[190px] rounded-xl bg-[#eef5fb]">
          <div className="absolute bottom-2 left-3 flex h-14 w-10 items-center justify-center rounded-md bg-white shadow-sm">
            <Leaf className="h-5 w-5 text-[#0a66c2]" />
          </div>
          <div className="absolute right-3 top-4 h-9 w-16 rounded-lg bg-white shadow-sm" />
          <div className="absolute right-5 top-6 flex items-center gap-1 text-[#7d8895]">
            <UsersRound className="h-3.5 w-3.5" />
            <div className="h-1.5 w-8 rounded bg-[#d9e3ef]" />
          </div>
          <div className="absolute right-3 top-14 h-9 w-16 rounded-lg bg-white shadow-sm" />
          <div className="absolute right-5 top-16 flex items-center gap-1 text-[#7d8895]">
            <UserRound className="h-3.5 w-3.5" />
            <div className="h-1.5 w-8 rounded bg-[#d9e3ef]" />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[#222]">
            Build relationships that open doors
          </p>
          <p className="text-[13px] leading-[1.35] text-[#666]">
            Connecting with the right people can lead to new opportunities.
          </p>
          <button
            type="button"
            className="pt-0.5 text-[14px] font-semibold text-[#0a66c2] hover:underline"
            onClick={() => navigate("/search")}
          >
            Learn more
          </button>
        </div>
      </div>
    </NetworkCard>
  );
}
