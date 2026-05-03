import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AddEducationModal,
  AddExperienceModal,
  AddLanguageModal,
  SkillFormModal,
  type SkillFormSavePayload
} from "../../components/profile/ProfileEditModals";
import { ExperienceCard } from "../../components/profile/ExperienceCard";
import { Alert } from "../../components/ui/Alert";
import { Card } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { EducationEntry, ExperienceEntry, LanguageEntry, MemberProfile } from "../../types/member";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { getUnifiedProfile, updateUnifiedProfile } from "../../utils/profileAdapter";

const SECTIONS = new Set(["experience", "education", "skills", "languages"]);
type SectionKey = "experience" | "education" | "skills" | "languages";

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

function applySkillToIds(ids: string[] | null | undefined, skill: string, selected: boolean): string[] {
  const base = (ids ?? []).filter((s) => s.toLowerCase() !== skill.toLowerCase());
  if (selected) return [...base, skill];
  return base;
}

type DetailSheet =
  | null
  | { kind: "experience"; mode: "add" }
  | { kind: "experience"; mode: "edit"; index: number }
  | { kind: "education"; mode: "add" }
  | { kind: "education"; mode: "edit"; index: number }
  | { kind: "skills"; mode: "add" }
  | { kind: "skills"; mode: "edit"; skillName: string }
  | { kind: "languages"; mode: "add" }
  | { kind: "languages"; mode: "edit"; index: number };

function sectionTitle(section: SectionKey): string {
  switch (section) {
    case "experience":
      return "Experience";
    case "education":
      return "Education";
    case "skills":
      return "Skills";
    case "languages":
      return "Languages";
    default:
      return "";
  }
}

export function ProfileSectionDetailsPage() {
  const { member_id, section: sectionParam } = useParams<{ member_id: string; section: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUserId = authStore((state) => state.userId);
  const currentRole = authStore((state) => state.role);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<DetailSheet>(null);
  const openedQueryEdit = useRef(false);

  const section = (sectionParam && SECTIONS.has(sectionParam) ? sectionParam : null) as SectionKey | null;

  const loadMember = useCallback(async () => {
    if (!member_id) return;
    setLoading(true);
    setError("");
    try {
      const { profile: data } = await getUnifiedProfile(Number(member_id), currentRole);
      setMember(data);
    } catch {
      setError("Could not load member profile.");
    } finally {
      setLoading(false);
    }
  }, [member_id, currentRole]);

  useEffect(() => {
    void loadMember();
  }, [loadMember]);

  const suggestedSkills = useMemo(() => {
    if (!member) return [];
    const aboutText = member.unstructured?.about || member.summary || "";
    const allSkills = member.skills ?? [];
    const suggestionCorpus = [
      member.headline,
      aboutText,
      ...(member.experience ?? []).flatMap((item) => [item.title, item.company, item.description]),
      ...(member.education ?? []).flatMap((item) => [item.degree, item.field_of_study, item.school, item.activities])
    ]
      .filter(Boolean)
      .join(" ");
    return Array.from(
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
  }, [member]);

  useEffect(() => {
    if (!member || section !== "languages" || openedQueryEdit.current) return;
    const q = searchParams.get("edit");
    if (q === null) return;
    const idx = parseInt(q, 10);
    const langs = member.unstructured?.languages ?? [];
    if (Number.isNaN(idx) || idx < 0 || idx >= langs.length) return;
    openedQueryEdit.current = true;
    setSheet({ kind: "languages", mode: "edit", index: idx });
    setSearchParams({}, { replace: true });
  }, [member, section, searchParams, setSearchParams]);

  const backToProfile = useCallback(() => {
    navigate(`/profile/${member_id}`);
  }, [navigate, member_id]);

  async function saveExperience(entry: ExperienceEntry, editIndex?: number) {
    if (!member) return;
    const loadingToast = toast.loading("Saving experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      if (editIndex !== undefined && editIndex >= 0) {
        currentItems.splice(editIndex, 1, entry);
      } else {
        currentItems.unshift(entry);
      }
      await updateUnifiedProfile({ member_id: member.member_id, experience: currentItems }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success(editIndex !== undefined ? "Experience updated" : "Experience added", { id: loadingToast });
    } catch {
      toast.error("Could not save experience", { id: loadingToast });
    }
  }

  async function deleteExperience(index: number) {
    if (!member) return;
    if (!window.confirm("Remove this position from your profile?")) return;
    const loadingToast = toast.loading("Deleting experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      currentItems.splice(index, 1);
      await updateUnifiedProfile({ member_id: member.member_id, experience: currentItems }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success("Experience deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete experience", { id: loadingToast });
    }
  }

  async function saveEducation(entry: EducationEntry, editIndex?: number) {
    if (!member) return;
    const loadingToast = toast.loading("Saving education...");
    try {
      const currentItems = [...(member.education ?? [])];
      if (editIndex !== undefined && editIndex >= 0) {
        currentItems.splice(editIndex, 1, entry);
      } else {
        currentItems.unshift(entry);
      }
      await updateUnifiedProfile({ member_id: member.member_id, education: currentItems }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success(editIndex !== undefined ? "Education updated" : "Education added", { id: loadingToast });
    } catch {
      toast.error("Could not save education", { id: loadingToast });
    }
  }

  async function deleteEducation(index: number) {
    if (!member) return;
    if (!window.confirm("Remove this school from your profile?")) return;
    const loadingToast = toast.loading("Deleting education...");
    try {
      const currentItems = [...(member.education ?? [])];
      currentItems.splice(index, 1);
      await updateUnifiedProfile({ member_id: member.member_id, education: currentItems }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success("Education deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete education", { id: loadingToast });
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
      const nextFollowed = followThisSkill ? [...new Set([...prevFollowed, skillName])] : undefined;
      await updateUnifiedProfile({
        member_id: member.member_id,
        experience,
        education,
        skills,
        ...(nextFollowed ? { followed_skills: nextFollowed } : {})
      }, currentRole);
      await loadMember();
      setSheet(null);
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
      }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success("Skill updated", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not update skill", { id: loadingToast });
    }
  }

  async function deleteSkillByName(skillName: string) {
    if (!member) return;
    if (!window.confirm(`Remove "${skillName}" from your profile?`)) return;
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
      }, currentRole);
      await loadMember();
      setSheet(null);
      toast.success("Skill removed", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not remove skill", { id: loadingToast });
    }
  }

  async function saveLanguage(entry: LanguageEntry, editIndex?: number) {
    if (!member) return;
    const existing = [...(member.unstructured?.languages ?? [])];
    const loadingToast = toast.loading("Saving language...");
    try {
      let nextLanguages: LanguageEntry[];
      if (editIndex !== undefined && editIndex >= 0 && editIndex < existing.length) {
        nextLanguages = existing.map((item, i) => (i === editIndex ? entry : item));
      } else {
        const deduped = existing.filter((item) => item.name.toLowerCase() !== entry.name.toLowerCase());
        nextLanguages = [entry, ...deduped];
      }
      try {
        await updateUnifiedProfile({ member_id: member.member_id, languages: nextLanguages }, currentRole);
      } catch (err) {
        if (currentRole !== "recruiter") throw err;
        await updateUnifiedProfile({ member_id: member.member_id, languages: nextLanguages }, "member");
      }
      await loadMember();
      setSheet(null);
      toast.success(editIndex !== undefined ? "Language updated" : "Language added", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not save language", { id: loadingToast });
    }
  }

  async function deleteLanguage(index: number) {
    if (!member) return;
    if (!window.confirm("Remove this language from your profile?")) return;
    const loadingToast = toast.loading("Deleting language...");
    try {
      const next = [...(member.unstructured?.languages ?? [])];
      next.splice(index, 1);
      try {
        await updateUnifiedProfile({ member_id: member.member_id, languages: next }, currentRole);
      } catch (err) {
        if (currentRole !== "recruiter") throw err;
        await updateUnifiedProfile({ member_id: member.member_id, languages: next }, "member");
      }
      await loadMember();
      setSheet(null);
      toast.success("Language removed", { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || "Could not delete language", { id: loadingToast });
    }
  }

  if (!section) {
    return <Navigate to={member_id ? `/profile/${member_id}` : "/feed"} replace />;
  }

  if (loading) {
    return (
      <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "py-8")}>
        <CardSkeleton />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "py-8")}>
        <Alert message={error || "Profile not found"} />
        <Link to={member_id ? `/profile/${member_id}` : "/feed"} className="mt-4 inline-block text-brand hover:underline">
          Back to profile
        </Link>
      </div>
    );
  }

  if (member.member_id !== currentUserId) {
    return <Navigate to={`/profile/${member.member_id}`} replace />;
  }

  const allSkills = member.skills ?? [];
  const allLanguages = member.unstructured?.languages ?? [];

  return (
    <div className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "py-8")}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back to profile"
            onClick={backToProfile}
            className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">{sectionTitle(section)}</h1>
        </div>
        <button
          type="button"
          aria-label={`Add ${sectionTitle(section)}`}
          className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
          onClick={() => {
            if (section === "experience") setSheet({ kind: "experience", mode: "add" });
            else if (section === "education") setSheet({ kind: "education", mode: "add" });
            else if (section === "skills") setSheet({ kind: "skills", mode: "add" });
            else setSheet({ kind: "languages", mode: "add" });
          }}
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      {section === "experience" ? (
        <ExperienceCard
          title="Experience"
          compact
          items={member.experience ?? []}
          onEdit={(index) => setSheet({ kind: "experience", mode: "edit", index })}
        />
      ) : null}

      {section === "education" ? (
        <ExperienceCard
          title="Education"
          compact
          items={member.education ?? []}
          onEdit={(index) => setSheet({ kind: "education", mode: "edit", index })}
        />
      ) : null}

      {section === "skills" ? (
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          {allSkills.length ? (
            <div className="space-y-3">
              {allSkills.map((skill) => {
                const sources = member.skill_mappings?.[skill];
                const sourceLine = !sources?.length
                  ? "Added from profile"
                  : sources.length === 1
                    ? sources[0]
                    : sources.join(" · ");
                return (
                  <div key={skill} className="flex items-start justify-between gap-3 border-t border-[#edf1f4] pt-4 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-[1.15rem] font-semibold text-[#1f1f1f]">{skill}</p>
                      <p className="mt-1 text-sm text-[#555555]">{sourceLine}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${skill}`}
                      className="shrink-0 rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                      onClick={() => setSheet({ kind: "skills", mode: "edit", skillName: skill })}
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[#6b7280]">No skills yet. Use the + button to add one.</p>
          )}
        </Card>
      ) : null}

      {section === "languages" ? (
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          {allLanguages.length ? (
            <div className="space-y-3">
              {allLanguages.map((entry, index) => (
                <div
                  key={`${entry.name}-${entry.proficiency}-${index}`}
                  className="flex items-start justify-between gap-3 border-t border-[#edf1f4] pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-[1.15rem] font-semibold text-[#1f1f1f]">{entry.name}</p>
                    <p className="text-sm text-[#555555]">{entry.proficiency}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Edit ${entry.name}`}
                    className="shrink-0 rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                    onClick={() => setSheet({ kind: "languages", mode: "edit", index })}
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6b7280]">No languages yet. Use the + button to add one.</p>
          )}
        </Card>
      ) : null}

      {sheet?.kind === "experience" ? (
        <AddExperienceModal
          onClose={() => setSheet(null)}
          onSave={(exp) => saveExperience(exp, sheet.mode === "edit" ? sheet.index : undefined)}
          initialValues={sheet.mode === "edit" ? member.experience?.[sheet.index] ?? null : null}
          onDelete={sheet.mode === "edit" ? async () => deleteExperience(sheet.index) : null}
        />
      ) : null}

      {sheet?.kind === "education" ? (
        <AddEducationModal
          onClose={() => setSheet(null)}
          onSave={(edu) => saveEducation(edu, sheet.mode === "edit" ? sheet.index : undefined)}
          initialValues={sheet.mode === "edit" ? member.education?.[sheet.index] ?? null : null}
          onDelete={sheet.mode === "edit" ? async () => deleteEducation(sheet.index) : null}
        />
      ) : null}

      {sheet?.kind === "skills" && sheet.mode === "add" ? (
        <SkillFormModal
          key="add-skill-details"
          mode="add"
          displaySkillName=""
          experience={member.experience ?? []}
          education={member.education ?? []}
          initialExperienceIndices={[]}
          initialEducationIndices={[]}
          initialFollow={false}
          suggestions={suggestedSkills}
          onClose={() => setSheet(null)}
          onSave={saveNewSkillWithMappings}
        />
      ) : null}

      {sheet?.kind === "skills" && sheet.mode === "edit" ? (
        <SkillFormModal
          key={`edit-skill-${sheet.skillName}`}
          mode="edit"
          displaySkillName={sheet.skillName}
          experience={member.experience ?? []}
          education={member.education ?? []}
          initialExperienceIndices={experienceIndicesForSkill(member.experience, sheet.skillName)}
          initialEducationIndices={educationIndicesForSkill(member.education, sheet.skillName)}
          initialFollow={(member.unstructured?.followed_skills ?? []).some(
            (s) => s.toLowerCase() === sheet.skillName.toLowerCase()
          )}
          suggestions={[]}
          onClose={() => setSheet(null)}
          onSave={updateSkillWithMappings}
          onDelete={() => deleteSkillByName(sheet.skillName)}
        />
      ) : null}

      {sheet?.kind === "languages" ? (
        <AddLanguageModal
          onClose={() => setSheet(null)}
          onSave={(lang) => saveLanguage(lang, sheet.mode === "edit" ? sheet.index : undefined)}
          initialValues={sheet.mode === "edit" ? member.unstructured?.languages?.[sheet.index] ?? null : null}
          onDelete={sheet.mode === "edit" ? async () => deleteLanguage(sheet.index) : null}
        />
      ) : null}
    </div>
  );
}
