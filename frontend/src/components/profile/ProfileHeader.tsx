import { MapPin } from "lucide-react";
import type { MemberProfile } from "../../types/member";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ProfileHeader({
  member,
  isOwnProfile
}: {
  member: MemberProfile;
  isOwnProfile: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-[200px] bg-gradient-to-r from-[#1d4477] to-[#1568bf]" />
      <div className="-mt-[76px] px-6 pb-6">
        <Avatar
          src={member.profile_photo_url}
          alt={`${member.first_name} ${member.last_name}`}
          name={`${member.first_name} ${member.last_name}`}
          size="2xl"
        />
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {member.first_name} {member.last_name}
            </h1>
            <p className="text-base text-text-secondary">{member.headline}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
              <MapPin className="h-4 w-4" />
              {[member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-sm font-semibold text-text-secondary">
              {member.connections_count ?? 0} connections
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwnProfile ? (
              <>
                <Button className="bg-success border-success hover:bg-[#046338] hover:border-[#046338]">Open to</Button>
                <Button variant="secondary">Add profile section</Button>
                <Button variant="ghost">More</Button>
              </>
            ) : (
              <>
                <Button>Connect</Button>
                <Button variant="secondary">Message</Button>
                <Button variant="ghost">More</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
