import { MapPin } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { updateMember, uploadProfilePhoto } from "../../api/members";
import type { MemberProfile, OpenToOption } from "../../types/member";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { AffiliationPills } from "./AffiliationPills";
import { OpenToDropdown } from "./OpenToDropdown";

export function ProfileHeader({
  member,
  isOwnProfile,
  onProfileUpdated,
  onAddSection
}: {
  member: MemberProfile;
  isOwnProfile: boolean;
  onProfileUpdated?: (next: MemberProfile) => void;
  onAddSection?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [savingOpenTo, setSavingOpenTo] = useState(false);

  async function handleOpenToChange(next: OpenToOption | null) {
    if (!onProfileUpdated) return;
    setSavingOpenTo(true);
    try {
      await updateMember({ member_id: member.member_id, open_to: next });
      onProfileUpdated({ ...member, open_to: next });
      toast.success(next ? "Open-to status updated" : "Open-to status cleared");
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not update status");
    } finally {
      setSavingOpenTo(false);
    }
  }

  async function handlePhoto(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WEBP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller");
      return;
    }
    const loadingId = toast.loading("Uploading photo...");
    setUploading(true);
    try {
      const result = await uploadProfilePhoto(member.member_id, file);
      toast.success("Profile photo updated", { id: loadingId });
      onProfileUpdated?.({
        ...member,
        profile_photo_url: result.profile_photo_url,
        profile_photo_file_id: result.profile_photo_file_id
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Upload failed", { id: loadingId });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-[200px] bg-gradient-to-r from-[#1d4477] to-[#1568bf]" />
      <div className="-mt-[76px] px-6 pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <Avatar
            src={member.profile_photo_url}
            alt={`${member.first_name} ${member.last_name}`}
            name={`${member.first_name} ${member.last_name}`}
            size="2xl"
            editable={isOwnProfile}
            onFileSelected={isOwnProfile ? handlePhoto : undefined}
            uploading={uploading}
          />
          <div className="hidden md:block md:mt-[84px]">
            <AffiliationPills experience={member.experience} education={member.education} />
          </div>
        </div>
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
            <div className="mt-3 md:hidden">
              <AffiliationPills experience={member.experience} education={member.education} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwnProfile ? (
              <>
                <OpenToDropdown
                  value={member.open_to}
                  onSelect={handleOpenToChange}
                  disabled={savingOpenTo}
                />
                <Button variant="secondary" onClick={() => onAddSection?.()}>
                  Add profile section
                </Button>
              </>
            ) : (
              <>
                <Button>Connect</Button>
                <Button variant="secondary">Message</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
