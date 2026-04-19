import { BriefcaseBusiness, GraduationCap, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router-dom";
import { getMember, updateMember } from "../../api/members";
import { RightSidebar, Sidebar } from "../../components/layout/Sidebar";
import { AddEducationModal, AddExperienceModal, AddSkillModal } from "../../components/profile/ProfileEditModals";
import { ProfileCompletionCard } from "../../components/profile/ProfileCompletionCard";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { EducationEntry, ExperienceEntry, MemberProfile } from "../../types/member";
import { ExperienceCard } from "../../components/profile/ExperienceCard";
import { ProfileHeader } from "../../components/profile/ProfileHeader";
import { ResumeUpload } from "../../components/profile/ResumeUpload";
import { SkillTag } from "../../components/profile/SkillTag";

export function ProfilePage() {
  const { member_id } = useParams();
  const currentUserId = authStore((state) => state.userId);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeModal, setActiveModal] = useState<{ type: "experience" | "education" | "skills"; index?: number } | null>(null);
  const [dismissedCards, setDismissedCards] = useState({
    experience: false,
    education: false,
    skills: false
  });

  async function loadMemberProfile() {
    if (!member_id) return;
    setLoading(true);
    setError("");
    try {
      const data = await getMember(Number(member_id));
      setMember(data);
    } catch {
      setError("Could not load member profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMemberProfile();
  }, [member_id]);

  async function saveExperience(experience: ExperienceEntry) {
    if (!member) return;
    const loadingToast = toast.loading("Saving experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      if (activeModal?.type === "experience" && activeModal.index !== undefined) {
        currentItems.splice(activeModal.index, 1, experience);
      } else {
        currentItems.unshift(experience);
      }
      await updateMember({
        member_id: member.member_id,
        experience: currentItems
      });
      await loadMemberProfile();
      setActiveModal(null);
      toast.success(activeModal?.index !== undefined ? "Experience updated" : "Experience added", { id: loadingToast });
    } catch {
      toast.error("Could not save experience", { id: loadingToast });
    }
  }

  async function saveEducation(education: EducationEntry) {
    if (!member) return;
    const loadingToast = toast.loading("Saving education...");
    try {
      const currentItems = [...(member.education ?? [])];
      if (activeModal?.type === "education" && activeModal.index !== undefined) {
        currentItems.splice(activeModal.index, 1, education);
      } else {
        currentItems.unshift(education);
      }
      await updateMember({
        member_id: member.member_id,
        education: currentItems
      });
      await loadMemberProfile();
      setActiveModal(null);
      toast.success(activeModal?.index !== undefined ? "Education updated" : "Education added", { id: loadingToast });
    } catch {
      toast.error("Could not save education", { id: loadingToast });
    }
  }

  async function saveSkill(skill: string) {
    if (!member || !skill) return;
    const existingSkills = member.skills ?? [];
    const nextSkills = [skill, ...existingSkills.filter((item) => item.toLowerCase() !== skill.toLowerCase())];
    const loadingToast = toast.loading("Saving skill...");
    try {
      await updateMember({
        member_id: member.member_id,
        skills: nextSkills
      });
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Skill added", { id: loadingToast });
    } catch {
      toast.error("Could not save skill", { id: loadingToast });
    }
  }

  async function deleteExperience(index: number) {
    if (!member) return;
    const loadingToast = toast.loading("Deleting experience...");
    try {
      const currentItems = [...(member.experience ?? [])];
      currentItems.splice(index, 1);
      await updateMember({
        member_id: member.member_id,
        experience: currentItems
      });
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Experience deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete experience", { id: loadingToast });
    }
  }

  async function deleteEducation(index: number) {
    if (!member) return;
    const loadingToast = toast.loading("Deleting education...");
    try {
      const currentItems = [...(member.education ?? [])];
      currentItems.splice(index, 1);
      await updateMember({
        member_id: member.member_id,
        education: currentItems
      });
      await loadMemberProfile();
      setActiveModal(null);
      toast.success("Education deleted", { id: loadingToast });
    } catch {
      toast.error("Could not delete education", { id: loadingToast });
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,1fr)_300px]">
        <CardSkeleton />
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

  return (
    <div className="grid gap-6 lg:grid-cols-[225px_minmax(0,1fr)_300px]">
      <Sidebar>
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <p className="text-lg font-semibold text-[#1f1f1f]">Profile details</p>
          <p className="mt-3 text-sm leading-6 text-[#555555]">{member.summary || "Add a summary to help visitors understand your experience faster."}</p>
        </Card>
      </Sidebar>
      <div className="space-y-4 animate-fade-in">
        <ProfileHeader member={member} isOwnProfile={isOwnProfile} />
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <h2 className="mb-3 text-[1.5rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">About</h2>
          <p className="text-sm leading-7 text-[#555555]">{member.unstructured?.about || member.summary || "No about section yet."}</p>
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
                  onAction={() => setActiveModal({ type: "experience" })}
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
                  onAction={() => setActiveModal({ type: "education" })}
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
                  onAction={() => setActiveModal({ type: "skills" })}
                  onDismiss={() => setDismissedCards((current) => ({ ...current, skills: true }))}
                  actionLabel="Add skills"
                />
              ) : null}
            </div>
          </section>
        ) : null}
        <ExperienceCard
          title="Experience"
          items={member.experience ?? []}
          onAdd={isOwnProfile ? () => setActiveModal({ type: "experience" }) : undefined}
          onEdit={isOwnProfile ? (index) => setActiveModal({ type: "experience", index }) : undefined}
        />
        <ExperienceCard
          title="Education"
          items={member.education ?? []}
          onAdd={isOwnProfile ? () => setActiveModal({ type: "education" }) : undefined}
          onEdit={isOwnProfile ? (index) => setActiveModal({ type: "education", index }) : undefined}
        />
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-6 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">Skills</h2>
            {isOwnProfile ? (
              <Button variant="secondary" className="rounded-full px-4 py-2 text-sm font-semibold" onClick={() => setActiveModal({ type: "skills" })}>
                Add skills
              </Button>
            ) : null}
          </div>
          {(member.skills ?? []).length ? (
            <div className="flex flex-wrap gap-2.5">
              {(member.skills ?? []).slice(0, 20).map((skill) => (
                <SkillTag key={skill} skill={skill} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6b7280]">No skills added yet.</p>
          )}
        </Card>
        {member.member_id === currentUserId ? <ResumeUpload memberId={member.member_id} /> : null}
      </div>
      <RightSidebar>
        <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
          <h3 className="text-lg font-semibold text-[#1f1f1f]">Activity</h3>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-2xl font-bold text-[#1f1f1f]">{member.profile_views ?? 0}</p>
              <p className="text-sm text-[#666666]">Profile views</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1f1f1f]">{member.connections_count ?? 0}</p>
              <p className="text-sm text-[#666666]">Search appearances</p>
            </div>
          </div>
        </Card>
      </RightSidebar>
      {activeModal?.type === "experience" ? (
        <AddExperienceModal
          onClose={() => setActiveModal(null)}
          onSave={saveExperience}
          initialValues={activeModal.index !== undefined ? member.experience?.[activeModal.index] ?? null : null}
          onDelete={activeModal.index !== undefined ? async () => deleteExperience(activeModal.index as number) : null}
        />
      ) : null}
      {activeModal?.type === "education" ? (
        <AddEducationModal
          onClose={() => setActiveModal(null)}
          onSave={saveEducation}
          initialValues={activeModal.index !== undefined ? member.education?.[activeModal.index] ?? null : null}
          onDelete={activeModal.index !== undefined ? async () => deleteEducation(activeModal.index as number) : null}
        />
      ) : null}
      {activeModal?.type === "skills" ? <AddSkillModal onClose={() => setActiveModal(null)} onSave={saveSkill} /> : null}
    </div>
  );
}
