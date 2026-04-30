import { BriefcaseBusiness, GraduationCap, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { deleteMember } from "../../api/members";
import { RightSidebar } from "../../components/layout/Sidebar";
import {
  AddEducationModal,
  AddExperienceModal,
  AddLanguageModal,
  SkillFormModal,
  SkillsListModal,
  ContactInfoModal,
  EditAboutModal,
  EditContactInfoModal,
  EditHeadlineModal,
  EditProfileLanguageModal,
  EditPublicProfileUrlModal,
  type ContactInfoValues,
  type SkillFormSavePayload
} from "../../components/profile/ProfileEditModals";
import { AddProfileSectionModal, type ProfileSectionKey } from "../../components/profile/AddProfileSectionModal";
import { ProfileCompletionCard } from "../../components/profile/ProfileCompletionCard";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { EducationEntry, ExperienceEntry, LanguageEntry, MemberProfile } from "../../types/member";
import { ExperienceCard } from "../../components/profile/ExperienceCard";
import { ProfileHeader } from "../../components/profile/ProfileHeader";
import { ResumeUpload } from "../../components/profile/ResumeUpload";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { getUnifiedProfile, updateUnifiedProfile } from "../../utils/profileAdapter";
import { getMemberDashboard } from "../../api/analytics";
import { listConnections, listPendingConnections, requestConnection, withdrawConnection } from "../../api/connections";
import { deleteCoverPhoto, deleteMember } from "../../api/members";
import {
  deleteRecruiterCoverPhoto,
  uploadRecruiterCoverPhoto,
  uploadRecruiterProfilePhoto
} from "../../api/recruiters";

type ProfileActiveModal =
  | {
      type:
        | "experience"
        | "education"
        | "about"
        | "headline"
        | "contact_info"
        | "contact_edit"
        | "language"
        | "profile_language"
        | "public_profile_url";
      index?: number;
    }
  | { type: "skills" }
  | { type: "edit_skill"; skillName: string };

function hasSkillInIds(ids: string[] | null | undefined, skill: string) {
  return (ids ?? []).some((s) => s.toLowerCase() === skill.toLowerCase());
}

function experienceIndicesForSkill(experience: ExperienceEntry[] | null | undefined, skill: string): number[] {
  if (!experience?.length) return [];
  return experience.map((e, i) => (hasSkillInIds(e.skill_ids, skill) ? i : -1)).filter((i) => i >= 0);
}

function educationIndicesForSkill(education: EducationEntry[] | null | undefined, skill: string): number[] {
  if (!education?.length) return [];
  return education.map((e, i) => (hasSkillInIds(e.skill_ids, skill) ? i : -1)).filter((i) => i >= 0);
}

/** Add or remove `skill` from a `skill_ids` list; `skill` is the canonical profile string. */
function applySkillToIds(ids: string[] | null | undefined, skill: string, selected: boolean): string[] {
  const base = (ids ?? []).filter((s) => s.toLowerCase() !== skill.toLowerCase());
  if (selected) return [...base, skill];
  return base;
}

function buildDefaultProfileSlug(firstName: string, lastName: string, memberId: number): string {
  const normalized = [firstName, lastName]
    .map((token) =>
      token
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean);
  const prefix = normalized.length ? normalized.join("-") : `user-${memberId}`;
  return `${prefix}-${memberId}`;
}

export function ProfilePage() {
  const { member_id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUserId = authStore((state) => state.userId);
  const currentRole = authStore((state) => state.role);
  const logout = authStore((state) => state.logout);
  const parsedMemberId = Number(member_id);
  const isForcedRecruiterProfile = searchParams.get("type") === "recruiter";
  const isRecruiterViewingOwnProfile =
    currentRole === "recruiter" &&
    Number.isFinite(parsedMemberId) &&
    currentUserId !== null &&
    parsedMemberId === currentUserId;
  const profileApiRole = isRecruiterViewingOwnProfile || isForcedRecruiterProfile ? "recruiter" : "member";
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"none" | "pending" | "connected">("none");
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [pendingIsOutgoing, setPendingIsOutgoing] = useState(false);
  const [sendingConnection, setSendingConnection] = useState(false);
  const [activityStats, setActivityStats] = useState<{ profileViews: number; searchAppearances: number } | null>(null);
  const [activeModal, setActiveModal] = useState<ProfileActiveModal | null>(null);
  const [skillsListModalOpen, setSkillsListModalOpen] = useState(false);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [dismissedCards, setDismissedCards] = useState({
    experience: false,
    education: false,
    skills: false
  });
  const aboutRef = useRef<HTMLDivElement | null>(null);
  const experienceRef = useRef<HTMLDivElement | null>(null);
  const educationRef = useRef<HTMLDivElement | null>(null);
  const skillsRef = useRef<HTMLDivElement | null>(null);
  const resumeRef = useRef<HTMLDivElement | null>(null);

  async function loadMemberProfile() {
    if (!member_id) return;
    if (!Number.isFinite(parsedMemberId) || parsedMemberId <= 0) {
      setError("Could not load member profile.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getUnifiedProfile(parsedMemberId, profileApiRole);
      setMember(data);
    } catch {
      setError("Could not load member profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMemberProfile();
  }, [member_id, profileApiRole]);

  useEffect(() => {
    if (!Number.isFinite(parsedMemberId) || parsedMemberId <= 0) {
      setActivityStats(null);
      return;
    }
    let cancelled = false;
    void getMemberDashboard(parsedMemberId)
      .then((dashboard) => {
        if (cancelled) return;
        setActivityStats({
          profileViews: dashboard.profile_views_30d ?? 0,
          searchAppearances: dashboard.search_appearances_30d ?? 0
        });
      })
      .catch(() => {
        if (cancelled) return;
        setActivityStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [parsedMemberId]);

  useEffect(() => {
    if (!member || !currentUserId || member.member_id === currentUserId) {
      setConnectionStatus("none");
      setPendingRequestId(null);
      setPendingIsOutgoing(false);
      return;
    }
    let cancelled = false;
    void Promise.all([listConnections(currentUserId), listPendingConnections(currentUserId)])
      .then(([connections, pending]) => {
        if (cancelled) return;
        const isConnected = connections.some((entry) => entry.connected_user_id === member.member_id);
        if (isConnected) {
          setConnectionStatus("connected");
          setPendingRequestId(null);
          setPendingIsOutgoing(false);
          return;
        }
        const pendingEntry = pending.find(
          (entry) =>
            (entry.requester_id === currentUserId && entry.receiver_id === member.member_id) ||
            (entry.requester_id === member.member_id && entry.receiver_id === currentUserId)
        );
        if (pendingEntry) {
          setConnectionStatus("pending");
          setPendingRequestId(pendingEntry.id);
          setPendingIsOutgoing(pendingEntry.requester_id === currentUserId);
          return;
        }
        setConnectionStatus("none");
        setPendingRequestId(null);
        setPendingIsOutgoing(false);
      })
      .catch(() => {
        if (cancelled) return;
        setConnectionStatus("none");
        setPendingRequestId(null);
        setPendingIsOutgoing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [member, currentUserId]);

  async function handleConnect() {
    if (!member || !currentUserId || member.member_id === currentUserId) return;

    if (connectionStatus === "connected") return;
    setSendingConnection(true);
    const loadingToast = toast.loading(connectionStatus === "pending" ? "Withdrawing invitation..." : "Sending connection request...");
    try {
      if (connectionStatus === "pending") {
        if (!pendingIsOutgoing || !pendingRequestId) {
          toast.error("Only sent invitations can be withdrawn", { id: loadingToast });
          return;
        }
        await withdrawConnection(pendingRequestId);
        setConnectionStatus("none");
        setPendingRequestId(null);
        setPendingIsOutgoing(false);
        toast.success("Invitation withdrawn", { id: loadingToast });
        return;
      }
      await requestConnection(currentUserId, member.member_id);
      setConnectionStatus("pending");
      setPendingIsOutgoing(true);
      // Refresh to resolve request id for follow-up withdraw action.
      const refreshedPending = await listPendingConnections(currentUserId);
      const outgoingMatch = refreshedPending.find(
        (entry) => entry.requester_id === currentUserId && entry.receiver_id === member.member_id
      );
      setPendingRequestId(outgoingMatch?.id ?? null);
      toast.success("Connection request sent", { id: loadingToast });
    } catch (err) {
      toast.error(
        getApiErrorMessage(err) || (connectionStatus === "pending" ? "Could not withdraw invitation" : "Could not send request"),
        { id: loadingToast }
      );
    } finally {
      setSendingConnection(false);
    }
  }

  function handleMessage() {
    if (!member || !currentUserId || member.member_id === currentUserId) return;
    navigate(`/messages?user=${member.member_id}`);
  }

  async function handleDeleteProfile() {
    if (!member) return;
    setDeleteLoading(true);
    try {
      await deleteMember(member.member_id);
      toast.success("Your account has been deleted.");
      logout();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Could not delete account. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function saveExperience(experience: ExperienceEntry, editIndex?: number) {
    if (!member) return;
    const loadingToast = toast.loading("Saving experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      if (editIndex !== undefined && editIndex >= 0) {
        currentItems.splice(editIndex, 1, experience);
      } else {
        currentItems.unshift(experience);
      }
      await updateUnifiedProfile({
        member_id: member.member_id,
        experience: currentItems
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success(editIndex !== undefined ? "Experience updated" : "Experience added", { id: loadingToast });
    } catch {
      toast.error("Could not save experience", { id: loadingToast });
    }
  }

  async function saveEducation(education: EducationEntry, editIndex?: number) {
    if (!member) return;
    const loadingToast = toast.loading("Saving education...");
    try {
      const currentItems = [...(member.education ?? [])];
      if (editIndex !== undefined && editIndex >= 0) {
        currentItems.splice(editIndex, 1, education);
      } else {
        currentItems.unshift(education);
      }
      await updateUnifiedProfile({
        member_id: member.member_id,
        education: currentItems
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success(editIndex !== undefined ? "Education updated" : "Education added", { id: loadingToast });
    } catch {
      toast.error("Could not save education", { id: loadingToast });
    }
  }

  async function saveAbout(about: string) {
    if (!member) return;
    const loadingToast = toast.loading("Saving about...");
    try {
      await updateUnifiedProfile({
        member_id: member.member_id,
        about,
        summary: about
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("About updated", { id: loadingToast });
    } catch {
      toast.error("Could not save about", { id: loadingToast });
    }
  }

  async function saveLanguage(languageEntry: LanguageEntry, editIndex?: number) {
    if (!member) return;
    const existing = [...(member.unstructured?.languages ?? [])];
    let nextLanguages: LanguageEntry[];
    if (editIndex !== undefined && editIndex >= 0 && editIndex < existing.length) {
      nextLanguages = existing.map((item, i) => (i === editIndex ? languageEntry : item));
    } else {
      const deduped = existing.filter((item) => item.name.toLowerCase() !== languageEntry.name.toLowerCase());
      nextLanguages = [languageEntry, ...deduped];
    }
    const loadingToast = toast.loading("Saving language...");
    try {
      await updateUnifiedProfile({ member_id: member.member_id, languages: nextLanguages }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success(editIndex !== undefined ? "Language updated" : "Language added", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save language", { id: loadingToast });
    }
  }

  async function saveHeadline(headline: string) {
    if (!member) return;
    const trimmed = headline.trim();
    if (!trimmed) {
      toast.error("Headline is required");
      return;
    }
    const loadingToast = toast.loading("Saving headline...");
    try {
      await updateUnifiedProfile({
        member_id: member.member_id,
        headline: trimmed
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Headline updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save headline", { id: loadingToast });
    }
  }

  async function saveContactInfo(values: ContactInfoValues) {
    if (!member) return;
    const loadingToast = toast.loading("Saving contact info...");
    try {
      await updateUnifiedProfile({
        member_id: member.member_id,
        phone: values.phone.trim() || null,
        birthday: values.birthday || null,
        website: values.website.trim() || null,
        location_city: values.location_city.trim() || null,
        location_state: values.location_state.trim() || null,
        location_country: values.location_country.trim() || null
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal({ type: "contact_info" });
      toast.success("Contact info updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save contact info", { id: loadingToast });
    }
  }

  async function saveProfileLanguage(profile_language: string) {
    if (!member) return;
    const value = profile_language.trim();
    if (!value) {
      toast.error("Profile language is required");
      return;
    }
    const loadingToast = toast.loading("Saving profile language...");
    try {
      await updateUnifiedProfile({ member_id: member.member_id, profile_language: value }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Profile language updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save profile language", { id: loadingToast });
    }
  }

  async function savePublicProfileSlug(profile_slug: string) {
    if (!member) return;
    const normalized = profile_slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!normalized) {
      toast.error("Public profile URL is required");
      return;
    }
    const memberSuffix = `-${member.member_id}`;
    const nextSlug = normalized.endsWith(memberSuffix) ? normalized : `${normalized}${memberSuffix}`;
    const loadingToast = toast.loading("Saving profile URL...");
    try {
      await updateUnifiedProfile({ member_id: member.member_id, profile_slug: nextSlug }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Public profile URL updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save profile URL", { id: loadingToast });
    }
  }

  function scrollTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleAddSection(key: ProfileSectionKey) {
    setAddSectionOpen(false);
    switch (key) {
      case "photo":
        document.querySelector<HTMLInputElement>("input[data-avatar-upload]")?.click();
        break;
      case "about":
        setActiveModal({ type: "about" });
        break;
      case "headline":
        setActiveModal({ type: "headline" });
        break;
      case "education":
        if (member_id) navigate(`/profile/${member_id}/details/education`);
        break;
      case "experience":
        if (member_id) navigate(`/profile/${member_id}/details/experience`);
        break;
      case "skills":
        if (member_id) navigate(`/profile/${member_id}/details/skills`);
        break;
      case "resume":
        scrollTo(resumeRef);
        break;
      default:
        toast("This section is coming soon", { icon: "ℹ️" });
    }
  }

  async function saveNewSkillWithMappings(payload: SkillFormSavePayload) {
    if (!member) return;
    const { skillName, experienceIndices, educationIndices, followThisSkill } = payload;
    if ((member.skills ?? []).some((s) => s.toLowerCase() === skillName.toLowerCase())) {
      toast.error("This skill is already on your profile");
      return;
    }
    const loadingToast = toast.loading("Saving skill...");
    try {
      const experience = (member.experience ?? []).map((e, i) => ({
        ...e,
        skill_ids: applySkillToIds(e.skill_ids, skillName, experienceIndices.includes(i))
      }));
      const education = (member.education ?? []).map((e, i) => ({
        ...e,
        skill_ids: applySkillToIds(e.skill_ids, skillName, educationIndices.includes(i))
      }));
      const skills = [skillName, ...(member.skills ?? [])];
      const prevFollowed = member.unstructured?.followed_skills ?? [];
      const nextFollowed = followThisSkill
        ? [...new Set([...prevFollowed, skillName])]
        : undefined;
      await updateUnifiedProfile({
        member_id: member.member_id,
        experience,
        education,
        skills,
        ...(nextFollowed ? { followed_skills: nextFollowed } : {})
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Skill added", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save skill", { id: loadingToast });
    }
  }

  async function updateSkillWithMappings(payload: SkillFormSavePayload) {
    if (!member) return;
    const { skillName, experienceIndices, educationIndices, followThisSkill } = payload;
    const loadingToast = toast.loading("Saving skill...");
    try {
      const experience = (member.experience ?? []).map((e, i) => ({
        ...e,
        skill_ids: applySkillToIds(e.skill_ids, skillName, experienceIndices.includes(i))
      }));
      const education = (member.education ?? []).map((e, i) => ({
        ...e,
        skill_ids: applySkillToIds(e.skill_ids, skillName, educationIndices.includes(i))
      }));
      const prevFollowed = member.unstructured?.followed_skills ?? [];
      const nextFollowed = followThisSkill
        ? [...new Set([...prevFollowed, skillName])]
        : prevFollowed.filter((s) => s.toLowerCase() !== skillName.toLowerCase());
      await updateUnifiedProfile({
        member_id: member.member_id,
        experience,
        education,
        skills: [...(member.skills ?? [])],
        followed_skills: nextFollowed
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Skill updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not update skill", { id: loadingToast });
    }
  }

  async function deleteSkillByName(skillName: string) {
    if (!member) return;
    if (!window.confirm(`Remove "${skillName}" from your profile?`)) {
      return;
    }
    const loadingToast = toast.loading("Removing skill...");
    try {
      const skills = (member.skills ?? []).filter((s) => s.toLowerCase() !== skillName.toLowerCase());
      const experience = (member.experience ?? []).map((e) => ({
        ...e,
        skill_ids: (e.skill_ids ?? []).filter((s) => s.toLowerCase() !== skillName.toLowerCase())
      }));
      const education = (member.education ?? []).map((e) => ({
        ...e,
        skill_ids: (e.skill_ids ?? []).filter((s) => s.toLowerCase() !== skillName.toLowerCase())
      }));
      const followed_skills = (member.unstructured?.followed_skills ?? []).filter(
        (s) => s.toLowerCase() !== skillName.toLowerCase()
      );
      await updateUnifiedProfile({
        member_id: member.member_id,
        skills,
        experience,
        education,
        followed_skills
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Skill removed", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not remove skill", { id: loadingToast });
    }
  }

  async function deleteExperience(index: number) {
    if (!member) return;
    if (!window.confirm("Remove this position from your profile?")) return;
    const loadingToast = toast.loading("Deleting experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      currentItems.splice(index, 1);
      await updateUnifiedProfile({
        member_id: member.member_id,
        experience: currentItems
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Experience deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete experience", { id: loadingToast });
    }
  }

  async function deleteEducation(index: number) {
    if (!member) return;
    if (!window.confirm("Remove this school from your profile?")) return;
    const loadingToast = toast.loading("Deleting education...");
    try {
      const currentItems = [...(member.education ?? [])];
      currentItems.splice(index, 1);
      await updateUnifiedProfile({
        member_id: member.member_id,
        education: currentItems
      }, profileApiRole);
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Education deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete education", { id: loadingToast });
    }
  }

  async function handleDeleteProfile() {
    if (!member) return;
    setDeleteLoading(true);
    try {
      await deleteMember(member.member_id);
      toast.success("Your account has been deleted.");
      logout();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Could not delete account. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (error || !member) return <Alert message={error || "Profile not found"} />;

  const isOwnProfile = member.member_id === currentUserId;
  const showExperiencePrompt = isOwnProfile && !member.experience?.length && !dismissedCards.experience;
  const showEducationPrompt = isOwnProfile && !member.education?.length && !dismissedCards.education;
  const showSkillsPrompt = isOwnProfile && !member.skills?.length && !dismissedCards.skills;

  const aboutText = member.unstructured?.about || member.summary || "";
  const allSkills = member.skills ?? [];
  const visibleSkills = allSkills.slice(0, 8);
  const allLanguages = member.unstructured?.languages ?? [];
  const visibleLanguages = showAllLanguages ? allLanguages : allLanguages.slice(0, 3);
  const suggestionCorpus = [
    member.headline,
    aboutText,
    ...(member.experience ?? []).flatMap((item) => [item.title, item.company, item.description]),
    ...(member.education ?? []).flatMap((item) => [item.degree, item.field_of_study, item.school, item.activities])
  ]
    .filter(Boolean)
    .join(" ");
  const suggestedSkills = Array.from(
    new Set(
      suggestionCorpus
        .split(/[\s,|·/()]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2)
        .filter((token) => /^[A-Za-z0-9+#.-]+$/.test(token))
    )
  )
    .slice(0, 12)
    .filter((token) => !allSkills.some((skill) => skill.toLowerCase() === token.toLowerCase()));
  const contactLocation = [member.location_city, member.location_state, member.location_country].filter(Boolean).join(", ");
  const profileLanguage = member.profile_language?.trim() || "English";
  const profileSlug = member.profile_slug?.trim() || buildDefaultProfileSlug(member.first_name, member.last_name, member.member_id);
  const profileOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const publicProfileUrl = `${profileOrigin}/in/${profileSlug}`;
  const birthdayText = member.birthday
    ? new Date(member.birthday).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4 animate-fade-in">
        <ProfileHeader
          member={member}
          isOwnProfile={isOwnProfile}
          allowMediaEditing
          onProfilePhotoUpload={
            currentRole === "recruiter"
              ? async (memberId, file) => {
                  const result = await uploadRecruiterProfilePhoto(memberId, file);
                  return {
                    profile_photo_url: result.profile_photo_url,
                    profile_photo_file_id: result.profile_photo_file_id
                  };
                }
              : undefined
          }
          onCoverPhotoUpload={
            currentRole === "recruiter"
              ? async (memberId, file) => {
                  const result = await uploadRecruiterCoverPhoto(memberId, file);
                  return {
                    cover_photo_url: result.cover_photo_url,
                    cover_photo_file_id: result.cover_photo_file_id
                  };
                }
              : undefined
          }
          onCoverPhotoDelete={
            currentRole === "recruiter"
              ? async (memberId) => {
                  await deleteRecruiterCoverPhoto(memberId);
                  await loadMemberProfile();
                }
              : async (memberId) => {
                  await deleteCoverPhoto(memberId);
                  await loadMemberProfile();
                }
          }
          onProfileUpdated={(next) => setMember(next)}
          onProfileStatusChange={async (next) => {
            await updateUnifiedProfile(
              {
                member_id: member.member_id,
                profile_status: next,
                open_to: next === "open_to_work" ? "job" : next === "hiring" ? "hiring" : null
              },
              profileApiRole
            );
            await loadMemberProfile();
          }}
          onAddSection={() => setAddSectionOpen(true)}
          onEditHeadline={() => setActiveModal({ type: "headline" })}
          onOpenContactInfo={() => setActiveModal({ type: "contact_info" })}
          connectLabel={
            connectionStatus === "connected"
              ? "Connected"
              : connectionStatus === "pending"
                ? "Pending"
                : "Connect"
          }
          connectDisabled={sendingConnection || connectionStatus === "connected" || (connectionStatus === "pending" && !pendingIsOutgoing)}
          onConnect={() => void handleConnect()}
          onMessage={handleMessage}
        />
        <Card ref={aboutRef} className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">About</h2>
            {isOwnProfile ? (
              <button
                type="button"
                aria-label="Edit about"
                className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                onClick={() => setActiveModal({ type: "about" })}
              >
                <Pencil className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          {aboutText ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-[#555555]">{aboutText}</p>
          ) : (
            <p className="text-sm leading-7 text-[#8a8a8a]">
              {isOwnProfile
                ? "Add a summary so recruiters and connections can understand your background at a glance."
                : "No about section yet."}
            </p>
          )}
        </Card>
        {showExperiencePrompt || showEducationPrompt || showSkillsPrompt ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">Complete your profile</h2>
              <p className="mt-1 text-sm text-[#666666]">Add a few essentials to help recruiters and connections understand your background quickly.</p>
            </div>
            <div className="space-y-4">
              {showExperiencePrompt ? (
                <ProfileCompletionCard
                  title="Experience"
                  helper="Showcase your accomplishments and make it easier for opportunities to match your background."
                  previewTitle="Job title"
                  previewSubtitle="Organization"
                  previewMeta="2023 - Present · 2 yrs"
                  icon={BriefcaseBusiness}
                  onAction={() => navigate(`/profile/${member.member_id}/details/experience`)}
                  onDismiss={() => setDismissedCards((current) => ({ ...current, experience: true }))}
                  actionLabel="Add experience"
                />
              ) : null}
              {showEducationPrompt ? (
                <ProfileCompletionCard
                  title="Education"
                  helper="Add your education history so recruiters can quickly understand your qualifications."
                  previewTitle="School"
                  previewSubtitle="Degree, Field of Study"
                  previewMeta="2023 - Present · 2 yrs"
                  icon={GraduationCap}
                  onAction={() => navigate(`/profile/${member.member_id}/details/education`)}
                  onDismiss={() => setDismissedCards((current) => ({ ...current, education: true }))}
                  actionLabel="Add education"
                />
              ) : null}
              {showSkillsPrompt ? (
                <ProfileCompletionCard
                  title="Skills"
                  helper="Highlight the skills that best describe your strengths so hiring teams can discover you faster."
                  previewTitle="Soft skills"
                  previewSubtitle="Technical skills"
                  icon={Sparkles}
                  onAction={() => navigate(`/profile/${member.member_id}/details/skills`)}
                  onDismiss={() => setDismissedCards((current) => ({ ...current, skills: true }))}
                  actionLabel="Add skills"
                />
              ) : null}
            </div>
          </section>
        ) : null}
        <div ref={experienceRef}>
          <ExperienceCard
            title="Experience"
            items={member.experience ?? []}
            onAdd={isOwnProfile ? () => setActiveModal({ type: "experience" }) : undefined}
            onEdit={isOwnProfile ? (index) => setActiveModal({ type: "experience", index }) : undefined}
            onManageSection={isOwnProfile ? () => navigate(`/profile/${member.member_id}/details/experience`) : undefined}
          />
        </div>
        <div ref={educationRef}>
          <ExperienceCard
            title="Education"
            items={member.education ?? []}
            onAdd={isOwnProfile ? () => setActiveModal({ type: "education" }) : undefined}
            onEdit={isOwnProfile ? (index) => setActiveModal({ type: "education", index }) : undefined}
            onManageSection={isOwnProfile ? () => navigate(`/profile/${member.member_id}/details/education`) : undefined}
          />
        </div>
        <Card ref={skillsRef} className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">Skills</h2>
            {isOwnProfile ? (
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Add skill" className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]" onClick={() => setActiveModal({ type: "skills" })}>
                  <Plus className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Manage skills"
                  className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                  onClick={() => navigate(`/profile/${member.member_id}/details/skills`)}
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </div>
          {allSkills.length ? (
            <div className="space-y-3">
              {visibleSkills.map((skill) => {
                const sources = member.skill_mappings?.[skill];
                const sourceLine = !sources?.length
                  ? "Added from profile"
                  : sources.length === 1
                    ? sources[0]
                    : sources.join(" · ");
                const body = (
                  <div className="border-t border-[#edf1f4] pt-3 first:border-t-0 first:pt-0">
                    <p className="text-[1.2rem] font-semibold text-[#1f1f1f]">{skill}</p>
                    <p className="mt-1 text-sm text-[#555555]">{sourceLine}</p>
                  </div>
                );
                return isOwnProfile ? (
                  <button
                    key={skill}
                    type="button"
                    className="block w-full rounded-lg border border-transparent text-left outline-none hover:border-[#e5e7eb] hover:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => setActiveModal({ type: "edit_skill", skillName: skill })}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={skill}>{body}</div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[#6b7280]">No skills added yet.</p>
          )}
          {allSkills.length > 8 ? (
            <button
              type="button"
              className="mt-4 w-full border-t border-[#e5e7eb] pt-3 text-center text-lg font-semibold text-[#374151] hover:text-brand"
              onClick={() => setSkillsListModalOpen(true)}
            >
              Show all →
            </button>
          ) : null}
        </Card>
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">Languages</h2>
            {isOwnProfile ? (
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Add language" className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]" onClick={() => setActiveModal({ type: "language" })}>
                  <Plus className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Manage languages"
                  className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                  onClick={() => navigate(`/profile/${member.member_id}/details/languages`)}
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </div>
          {visibleLanguages.length ? (
            <div className="space-y-3">
              {visibleLanguages.map((entry, langIndex) => (
                <div
                  key={`${entry.name}-${entry.proficiency}-${langIndex}`}
                  className="border-t border-[#edf1f4] pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-[1.2rem] font-semibold text-[#1f1f1f]">{entry.name}</p>
                  <p className="text-sm text-[#555555]">{entry.proficiency}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6b7280]">No languages added yet.</p>
          )}
          {allLanguages.length > 3 ? (
            <button
              type="button"
              className="mt-4 w-full border-t border-[#e5e7eb] pt-3 text-center text-lg font-semibold text-[#374151] hover:text-brand"
              onClick={() => setShowAllLanguages((current) => !current)}
            >
              {showAllLanguages ? "Show less" : "Show all"} →
            </button>
          ) : null}
        </Card>
        {member.member_id === currentUserId && currentRole === "member" ? (
          <div ref={resumeRef}>
            <ResumeUpload memberId={member.member_id} />
          </div>
        ) : null}
        {isOwnProfile && currentRole === "member" ? (
          <Card className="rounded-[22px] border border-red-100 bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
            <h2 className="mb-1 text-base font-semibold text-red-600">Danger Zone</h2>
            <p className="mb-4 text-sm text-[#666666]">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete my account
            </button>
          </Card>
        ) : null}
      </div>
      <RightSidebar>
        <div className="space-y-4">
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[#1f1f1f]">Profile language</h3>
              <p className="mt-2 text-sm text-[#5b6470]">{profileLanguage}</p>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                className="rounded-full p-2 text-[#4b5563] transition hover:bg-[#f3f6f8]"
                aria-label="Edit profile language"
                onClick={() => setActiveModal({ type: "profile_language" })}
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </Card>
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-[#1f1f1f]">Public profile & URL</h3>
              <p className="mt-2 break-all text-sm text-[#5b6470]">{publicProfileUrl}</p>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                className="rounded-full p-2 text-[#4b5563] transition hover:bg-[#f3f6f8]"
                aria-label="Edit public profile URL"
                onClick={() => setActiveModal({ type: "public_profile_url" })}
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </Card>
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <h3 className="text-lg font-semibold text-[#1f1f1f]">Activity</h3>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-2xl font-bold text-[#1f1f1f]">{activityStats?.profileViews ?? member.profile_views ?? 0}</p>
              <p className="text-sm text-[#666666]">Profile views (last 30 days)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1f1f1f]">{activityStats?.searchAppearances ?? 0}</p>
              <p className="text-sm text-[#666666]">Search appearances (last 30 days)</p>
            </div>
          </div>
        </Card>
        </div>
      </RightSidebar>
      {activeModal?.type === "experience" ? (
        <AddExperienceModal
          onClose={() => setActiveModal(null)}
          onSave={(exp) =>
            saveExperience(
              exp,
              activeModal.index !== undefined && activeModal.type === "experience" ? activeModal.index : undefined
            )
          }
          initialValues={activeModal.index !== undefined ? member.experience?.[activeModal.index] ?? null : null}
          onDelete={activeModal.index !== undefined ? async () => deleteExperience(activeModal.index as number) : null}
        />
      ) : null}
      {activeModal?.type === "education" ? (
        <AddEducationModal
          onClose={() => setActiveModal(null)}
          onSave={(edu) =>
            saveEducation(
              edu,
              activeModal.index !== undefined && activeModal.type === "education" ? activeModal.index : undefined
            )
          }
          initialValues={activeModal.index !== undefined ? member.education?.[activeModal.index] ?? null : null}
          onDelete={activeModal.index !== undefined ? async () => deleteEducation(activeModal.index as number) : null}
        />
      ) : null}
      {activeModal?.type === "skills" && member ? (
        <SkillFormModal
          key="add-skill"
          mode="add"
          displaySkillName=""
          experience={member.experience ?? []}
          education={member.education ?? []}
          initialExperienceIndices={[]}
          initialEducationIndices={[]}
          initialFollow={false}
          suggestions={suggestedSkills}
          onClose={() => setActiveModal(null)}
          onSave={saveNewSkillWithMappings}
        />
      ) : null}
      {activeModal?.type === "edit_skill" && member ? (
        <SkillFormModal
          key={`edit-skill-${activeModal.skillName}`}
          mode="edit"
          displaySkillName={activeModal.skillName}
          experience={member.experience ?? []}
          education={member.education ?? []}
          initialExperienceIndices={experienceIndicesForSkill(member.experience, activeModal.skillName)}
          initialEducationIndices={educationIndicesForSkill(member.education, activeModal.skillName)}
          initialFollow={(member.unstructured?.followed_skills ?? []).some(
            (s) => s.toLowerCase() === activeModal.skillName.toLowerCase()
          )}
          suggestions={[]}
          onClose={() => setActiveModal(null)}
          onSave={updateSkillWithMappings}
          onDelete={() => deleteSkillByName(activeModal.skillName)}
        />
      ) : null}
      {skillsListModalOpen && member ? (
        <SkillsListModal
          onClose={() => setSkillsListModalOpen(false)}
          skills={allSkills}
          skillMappings={member.skill_mappings}
          onSelectSkill={
            isOwnProfile
              ? (s) => {
                  setSkillsListModalOpen(false);
                  setActiveModal({ type: "edit_skill", skillName: s });
                }
              : undefined
          }
        />
      ) : null}
      {activeModal?.type === "language" ? <AddLanguageModal onClose={() => setActiveModal(null)} onSave={saveLanguage} /> : null}
      {activeModal?.type === "about" ? (
        <EditAboutModal
          onClose={() => setActiveModal(null)}
          onSave={saveAbout}
          initialValue={member.unstructured?.about || member.summary || ""}
        />
      ) : null}
      {activeModal?.type === "headline" ? (
        <EditHeadlineModal
          onClose={() => setActiveModal(null)}
          onSave={saveHeadline}
          initialValue={member.headline}
        />
      ) : null}
      {activeModal?.type === "profile_language" ? (
        <EditProfileLanguageModal
          onClose={() => setActiveModal(null)}
          onSave={saveProfileLanguage}
          initialValue={member.profile_language}
        />
      ) : null}
      {activeModal?.type === "public_profile_url" ? (
        <EditPublicProfileUrlModal
          onClose={() => setActiveModal(null)}
          onSave={savePublicProfileSlug}
          initialValue={profileSlug}
        />
      ) : null}
      {activeModal?.type === "contact_info" ? (
        <ContactInfoModal
          onClose={() => setActiveModal(null)}
          isOwnProfile={isOwnProfile}
          onEdit={() => setActiveModal({ type: "contact_edit" })}
            contact={{
            email: member.email,
            birthday: birthdayText,
            phone: member.phone,
            website: member.website,
            location: contactLocation || null
          }}
        />
      ) : null}
      {activeModal?.type === "contact_edit" ? (
        <EditContactInfoModal
          onClose={() => setActiveModal({ type: "contact_info" })}
          onSave={saveContactInfo}
          email={member.email}
          initialValue={{
            phone: member.phone ?? "",
            birthday: member.birthday ?? "",
            website: member.website ?? "",
            location_city: member.location_city ?? "",
            location_state: member.location_state ?? "",
            location_country: member.location_country ?? ""
          }}
        />
      ) : null}
      {addSectionOpen ? (
        <AddProfileSectionModal
          onClose={() => setAddSectionOpen(false)}
          onSelect={handleAddSection}
        />
      ) : null}
      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[22px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <h3 className="text-lg font-bold text-[#1f1f1f]">Delete your account?</h3>
            <p className="mt-2 text-sm text-[#555555]">
              This will permanently delete your profile, applications, connections, and all associated data. You cannot undo this.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-full border border-[#ccc] py-2 text-sm font-semibold text-[#333] hover:bg-[#f3f6f8] transition"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                onClick={() => void handleDeleteProfile()}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
