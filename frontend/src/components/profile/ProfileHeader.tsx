import { Camera, MapPin, Pencil, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { deleteCoverPhoto, updateMember, uploadCoverPhoto, uploadProfilePhoto } from "../../api/members";
import type { MemberProfile, ProfileStatusOption } from "../../types/member";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { AffiliationPills } from "./AffiliationPills";
import { OpenToDropdown } from "./OpenToDropdown";

function statusToLegacyOpenTo(status: ProfileStatusOption): "job" | "hiring" | null {
  if (status === "open_to_work") return "job";
  if (status === "hiring") return "hiring";
  return null;
}

function resolveProfileStatus(member: MemberProfile): ProfileStatusOption {
  if (member.profile_status === "open_to_work" || member.profile_status === "hiring" || member.profile_status === "none") {
    return member.profile_status;
  }
  if (member.open_to === "hiring") return "hiring";
  if (member.open_to === "job") return "open_to_work";
  return "none";
}

export function ProfileHeader({
  member,
  isOwnProfile,
  allowMediaEditing = true,
  onProfileStatusChange,
  onProfilePhotoUpload,
  onCoverPhotoUpload,
  onCoverPhotoDelete,
  onProfileUpdated,
  onAddSection,
  onEditHeadline,
  onOpenContactInfo,
  connectLabel = "Connect",
  connectDisabled = false,
  onConnect,
  onMessage
}: {
  member: MemberProfile;
  isOwnProfile: boolean;
  allowMediaEditing?: boolean;
  onProfileStatusChange?: (next: ProfileStatusOption) => Promise<void>;
  onProfilePhotoUpload?: (
    memberId: number,
    file: File
  ) => Promise<{ profile_photo_url: string; profile_photo_file_id?: string | null }>;
  onCoverPhotoUpload?: (
    memberId: number,
    file: File
  ) => Promise<{ cover_photo_url: string; cover_photo_file_id?: string | null }>;
  onCoverPhotoDelete?: (memberId: number) => Promise<void>;
  onProfileUpdated?: (next: MemberProfile) => void;
  onAddSection?: () => void;
  onEditHeadline?: () => void;
  onOpenContactInfo?: () => void;
  connectLabel?: string;
  connectDisabled?: boolean;
  onConnect?: () => void;
  onMessage?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingOpenTo, setSavingOpenTo] = useState(false);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [hoveringPendingConnect, setHoveringPendingConnect] = useState(false);
  const coverMenuButtonRef = useRef<HTMLButtonElement>(null);
  const coverMenuPanelRef = useRef<HTMLDivElement>(null);
  const [coverMenuFixedStyle, setCoverMenuFixedStyle] = useState<CSSProperties>({});
  const profileStatus = resolveProfileStatus(member);
  const hasCoverPhoto = Boolean(
    (member.cover_photo_url && member.cover_photo_url.trim()) || member.cover_photo_file_id
  );

  async function handleOpenToChange(next: ProfileStatusOption) {
    setSavingOpenTo(true);
    try {
      if (onProfileStatusChange) {
        await onProfileStatusChange(next);
      } else {
        if (!onProfileUpdated) return;
        await updateMember({
          member_id: member.member_id,
          profile_status: next,
          open_to: statusToLegacyOpenTo(next)
        });
        onProfileUpdated({ ...member, profile_status: next, open_to: statusToLegacyOpenTo(next) });
      }
      toast.success(next === "none" ? "Profile status cleared" : "Profile status updated");
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
      const result = onProfilePhotoUpload
        ? await onProfilePhotoUpload(member.member_id, file)
        : await uploadProfilePhoto(member.member_id, file);
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

  async function handleCover(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WEBP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller");
      return;
    }
    const loadingId = toast.loading(member.cover_photo_url ? "Updating cover image..." : "Uploading cover image...");
    setUploadingCover(true);
    try {
      const result = onCoverPhotoUpload
        ? await onCoverPhotoUpload(member.member_id, file)
        : await uploadCoverPhoto(member.member_id, file);
      onProfileUpdated?.({
        ...member,
        cover_photo_url: result.cover_photo_url,
        cover_photo_file_id: result.cover_photo_file_id
      });
      toast.success(member.cover_photo_url ? "Cover image updated" : "Cover image added", { id: loadingId });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Cover upload failed", { id: loadingId });
    } finally {
      setUploadingCover(false);
      setCoverMenuOpen(false);
    }
  }

  function updateCoverMenuPosition() {
    const btn = coverMenuButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuWidth = 220;
    setCoverMenuFixedStyle({
      position: "fixed",
      top: r.bottom + 8,
      left: Math.min(Math.max(8, r.right - menuWidth), window.innerWidth - menuWidth - 8),
      width: menuWidth,
      zIndex: 200
    });
  }

  useLayoutEffect(() => {
    if (!coverMenuOpen) return;
    updateCoverMenuPosition();
  }, [coverMenuOpen]);

  useEffect(() => {
    if (!coverMenuOpen) return undefined;
    const onScrollOrResize = () => {
      updateCoverMenuPosition();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [coverMenuOpen]);

  useEffect(() => {
    if (!coverMenuOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (coverMenuButtonRef.current?.contains(target)) return;
      if (coverMenuPanelRef.current?.contains(target)) return;
      setCoverMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [coverMenuOpen]);

  async function handleDeleteCover() {
    if (!hasCoverPhoto) return;
    const loadingId = toast.loading("Removing cover image...");
    try {
      if (onCoverPhotoDelete) {
        await onCoverPhotoDelete(member.member_id);
      } else {
        await deleteCoverPhoto(member.member_id);
      }
      onProfileUpdated?.({
        ...member,
        cover_photo_url: null,
        cover_photo_file_id: null
      });
      toast.success("Cover image removed", { id: loadingId });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not remove cover image", { id: loadingId });
    } finally {
      setCoverMenuOpen(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border border-[#dde3ea] bg-white p-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div
        className="relative z-0 h-[174px] bg-cover bg-center"
        style={{
          backgroundImage: member.cover_photo_url
            ? `linear-gradient(rgba(15,23,42,0.12), rgba(15,23,42,0.12)), url("${member.cover_photo_url}")`
            : "linear-gradient(to right, #1d4477, #1568bf)"
        }}
      >
        {isOwnProfile && allowMediaEditing ? (
          <div className="absolute right-4 top-4 z-20">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-cover-upload
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file) void handleCover(file);
                event.currentTarget.value = "";
              }}
            />
            <button
              ref={coverMenuButtonRef}
              type="button"
              className="rounded-full bg-white/90 p-3 text-[#1f2937] shadow hover:bg-white"
              aria-label="Manage cover image"
              aria-expanded={coverMenuOpen}
              onClick={() => setCoverMenuOpen((current) => !current)}
            >
              <Camera className="h-5 w-5" />
            </button>
            {coverMenuOpen ? (
              <div
                ref={coverMenuPanelRef}
                className="rounded-xl border border-[#e5e7eb] bg-white p-2 shadow-lg"
                style={coverMenuFixedStyle}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#1f2937] hover:bg-[#f3f4f6]"
                  onClick={() => document.querySelector<HTMLInputElement>("input[data-cover-upload]")?.click()}
                  disabled={uploadingCover}
                >
                  <Camera className="h-4 w-4" />
                  {hasCoverPhoto ? "Edit cover image" : "Add cover image"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#b91c1c] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:text-[#fca5a5]"
                  onClick={() => void handleDeleteCover()}
                  disabled={!hasCoverPhoto}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete cover image
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative z-10 -mt-[62px] px-6 pb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <Avatar
            src={member.profile_photo_url}
            alt={`${member.first_name} ${member.last_name}`}
            name={`${member.first_name} ${member.last_name}`}
            size="2xl"
            editable={isOwnProfile && allowMediaEditing}
            onFileSelected={isOwnProfile && allowMediaEditing ? handlePhoto : undefined}
            uploading={uploading}
          />
          <div className="hidden md:block md:mt-[70px]">
            <AffiliationPills experience={member.experience} education={member.education} />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[2rem] font-semibold leading-tight text-[#1f1f1f]">
              {member.first_name} {member.last_name}
            </h1>
            <div className="mt-1 flex items-start gap-2">
              <p className="line-clamp-2 max-w-[44rem] text-base leading-6 text-text-secondary">
                {member.headline?.trim() || (isOwnProfile ? "Add a headline to describe your profile." : "")}
              </p>
              {isOwnProfile ? (
                <button
                  type="button"
                  className="rounded-full p-1.5 text-[#4b5563] transition hover:bg-[#f3f6f8]"
                  onClick={onEditHeadline}
                  aria-label="Edit headline"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#5f6368]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {[member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ") || "Location not set"}
              </span>
              <span className="text-[#9ca3af]">•</span>
              <button type="button" className="font-semibold text-brand hover:underline" onClick={onOpenContactInfo}>
                Contact info
              </button>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#5f6368]">
              {member.connections_count ?? 0} connections
            </p>
            <div className="mt-3 md:hidden">
              <AffiliationPills experience={member.experience} education={member.education} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isOwnProfile ? (
              <>
                <div className="[&>button]:h-10 [&>button]:rounded-full [&>button]:px-4 [&>button]:text-sm [&>button]:font-semibold [&>button]:shadow-none">
                  <OpenToDropdown
                    value={profileStatus}
                    onSelect={handleOpenToChange}
                    disabled={savingOpenTo}
                  />
                </div>
                <Button
                  variant="secondary"
                  className="h-10 rounded-full border-[1.5px] border-[#0a66c2] px-4 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
                  onClick={() => onAddSection?.()}
                >
                  Add profile section
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-10 rounded-full border-[1.5px] border-[#0a66c2] px-4 text-sm font-semibold"
                  onClick={onConnect}
                  disabled={connectDisabled}
                  onMouseEnter={() => {
                    if (connectLabel === "Pending") setHoveringPendingConnect(true);
                  }}
                  onMouseLeave={() => setHoveringPendingConnect(false)}
                >
                  {connectLabel === "Pending" && hoveringPendingConnect ? "Withdraw" : connectLabel}
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 rounded-full border-[1.5px] border-[#0a66c2] px-4 text-sm font-semibold text-[#0a66c2] hover:bg-[#eef3f8]"
                  onClick={onMessage}
                >
                  Message
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
