import { getMember, updateMember } from "../api/members";
import { getRecruiter, updateRecruiter } from "../api/recruiters";
import type { UserRole } from "../types/common";
import type { MemberProfile, MemberProfileUpdateInput } from "../types/member";
import type { RecruiterProfile } from "../types/recruiter";

function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const text = (name ?? "").trim();
  if (!text) return { firstName: "Recruiter", lastName: "" };
  const parts = text.split(/\s+/);
  return {
    firstName: parts[0] || "Recruiter",
    lastName: parts.slice(1).join(" ")
  };
}

function buildDefaultSlug(firstName: string, lastName: string, id: number): string {
  const normalized = [firstName, lastName]
    .map((token) =>
      token
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean);
  const prefix = normalized.length ? normalized.join("-") : `user-${id}`;
  return `${prefix}-${id}`;
}

export function mapRecruiterToMemberProfile(recruiter: RecruiterProfile): MemberProfile {
  const names = splitName(recruiter.name);
  const firstName = (recruiter.first_name || names.firstName || "Recruiter").trim();
  const lastName = (recruiter.last_name || names.lastName || "").trim();
  const memberId = recruiter.recruiter_id;
  const defaultHeadline = [recruiter.role, recruiter.company_name].filter(Boolean).join(" at ");
  const resolvedHeadline = recruiter.headline ?? (defaultHeadline || null);
  const defaultSlug = buildDefaultSlug(firstName, lastName, memberId);
  const location = recruiter.company_location ?? null;
  const locationPieces = (location || "").split(",").map((piece) => piece.trim()).filter(Boolean);

  return {
    member_id: memberId,
    first_name: firstName,
    last_name: lastName,
    phone: recruiter.phone,
    email: recruiter.email,
    birthday: recruiter.birthday ?? null,
    website: recruiter.website ?? null,
    location_city: recruiter.location_city ?? locationPieces[0] ?? null,
    location_state: recruiter.location_state ?? locationPieces[1] ?? null,
    location_country: recruiter.location_country ?? locationPieces[2] ?? null,
    headline: resolvedHeadline,
    summary: recruiter.summary ?? null,
    experience: recruiter.experience ?? [],
    education: recruiter.education ?? [],
    skills: recruiter.skills ?? [],
    profile_photo_url: recruiter.profile_photo_url ?? null,
    cover_photo_url: recruiter.cover_photo_url ?? null,
    open_to: (recruiter.open_to as MemberProfile["open_to"]) ?? null,
    profile_status: recruiter.profile_status ?? null,
    profile_language: recruiter.profile_language ?? "English",
    profile_slug: recruiter.profile_slug ?? defaultSlug,
    connections_count: recruiter.connections_count ?? 0,
    profile_views: recruiter.profile_views ?? 0,
    skill_mappings: recruiter.skill_mappings ?? {},
    unstructured: {
      about: recruiter.about ?? "",
      languages: recruiter.languages ?? [],
      followed_skills: recruiter.followed_skills ?? []
    }
  };
}

function mapMemberPatchToRecruiterPatch(patch: MemberProfileUpdateInput) {
  return {
    recruiter_id: patch.member_id,
    first_name: patch.first_name,
    last_name: patch.last_name,
    phone: patch.phone,
    headline: patch.headline,
    summary: patch.summary,
    location_city: patch.location_city,
    location_state: patch.location_state,
    location_country: patch.location_country,
    birthday: patch.birthday,
    website: patch.website,
    open_to: patch.open_to,
    profile_status: patch.profile_status,
    profile_language: patch.profile_language,
    profile_slug: patch.profile_slug,
    experience: patch.experience,
    education: patch.education,
    skills: patch.skills,
    about: patch.about,
    languages: patch.languages ?? patch.unstructured?.languages,
    followed_skills: patch.followed_skills ?? patch.unstructured?.followed_skills
  };
}

export type UnifiedProfileResolution = "recruiter" | "member";

export type UnifiedProfileLoadResult = {
  profile: MemberProfile;
  resolvedAs: UnifiedProfileResolution;
};

/** Loads recruiter row first when appropriate; reports whether this id is a recruiter or member profile. */
export async function getUnifiedProfile(id: number, role: UserRole | null): Promise<UnifiedProfileLoadResult> {
  if (role === "recruiter") {
    const recruiter = await getRecruiter(id);
    return { profile: mapRecruiterToMemberProfile(recruiter), resolvedAs: "recruiter" };
  }
  // Recruiters share the same numeric id as auth user_id but live under /recruiters/get, not /members/get.
  try {
    const recruiter = await getRecruiter(id);
    return { profile: mapRecruiterToMemberProfile(recruiter), resolvedAs: "recruiter" };
  } catch {
    const member = await getMember(id);
    return { profile: member, resolvedAs: "member" };
  }
}

export async function updateUnifiedProfile(patch: MemberProfileUpdateInput, role: UserRole | null): Promise<void> {
  if (role === "recruiter") {
    await updateRecruiter(mapMemberPatchToRecruiterPatch(patch));
    return;
  }
  await updateMember(patch);
}
