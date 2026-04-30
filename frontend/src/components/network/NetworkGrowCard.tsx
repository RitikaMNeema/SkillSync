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
      <div className="p-3">
        <h3 className="text-base font-semibold text-[#222]">Grow your network</h3>
        <p className="mt-1.5 text-sm leading-snug text-[#666]">
          Add personal contacts and connect with people you know.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full rounded-full border border-[#0a66c2] px-4 py-2 text-sm text-[#0a66c2] hover:bg-[#eef3f8]"
          onClick={() => navigate("/search")}
        >
          Find contacts
        </Button>
      </div>
      <div className="flex justify-center border-t border-[#f3f2ef] bg-[#fafafa] px-4 py-5">
        <div
          className="h-24 w-32 rounded-lg bg-gradient-to-br from-[#dce6f1] to-[#c4d8ed]"
          aria-hidden
        />
      </div>
    </NetworkCard>
  );
}
