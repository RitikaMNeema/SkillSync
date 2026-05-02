import { Cake, Globe, Mail, MapPin, Phone, Search, X } from "lucide-react";
import { forwardRef, useEffect, useState } from "react";
import type { FormEvent, ReactNode, SelectHTMLAttributes } from "react";
import { useForm } from "react-hook-form";
import type { EducationEntry, ExperienceEntry } from "../../types/member";
import { canonicalizeSkill } from "../../utils/skills";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Input";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const years = Array.from({ length: 60 }, (_, index) => new Date().getFullYear() + 1 - index);

/** January -> 1 .. December -> 12; empty / unknown -> 0. */
function monthIndex(name?: string | null): number {
  if (!name) return 0;
  const idx = months.findIndex((m) => m.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}

/** Compare (startYear, startMonth) vs (endYear, endMonth). Returns a number <0/=0/>0. */
function compareYearMonth(
  startYear: number | null,
  startMonth: string | null,
  endYear: number | null,
  endMonth: string | null
): number {
  if (!startYear || !endYear) return 0; // Need both years to compare.
  if (startYear !== endYear) return startYear - endYear;
  // Same year: only meaningful if both months set.
  const sm = monthIndex(startMonth);
  const em = monthIndex(endMonth);
  if (sm && em) return sm - em;
  return 0;
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
  widthClass = "max-w-[960px]"
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.22)] ${widthClass}`}
      >
        <div className="flex items-center justify-between border-b border-[#e4e7eb] px-8 py-5">
          <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-[#1f1f1f]">{title}</h2>
          <button type="button" aria-label="Close" className="rounded-full p-2 text-[#4d4d4d] transition hover:bg-[#f3f6f8]" onClick={onClose}>
            <X className="h-8 w-8" />
          </button>
        </div>
        <div className="overflow-y-auto px-8 py-8">{children}</div>
        <div className="flex justify-end border-t border-[#e4e7eb] px-8 py-5">{footer}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-[1rem] font-semibold text-[#2f2f2f]">{children}</label>;
}

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      {...props}
      className="linkedin-input h-[50px] w-full rounded-[10px] border-[#b8c0c7] bg-white px-4 text-[1rem] text-[#1f1f1f] focus:shadow-none"
    >
      {children}
    </select>
  );
});

function ModalFooter({
  onDelete,
  deleteText = "Delete",
  submitLabel,
  formId,
  disabled
}: {
  onDelete?: (() => void) | null;
  deleteText?: string;
  submitLabel: string;
  formId: string;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div>
        {onDelete ? (
          <button type="button" className="text-[1.05rem] font-semibold text-[#4b4b4b] transition hover:text-[#1f1f1f]" onClick={onDelete}>
            {deleteText}
          </button>
        ) : null}
      </div>
      <Button type="submit" form={formId} disabled={disabled} className="rounded-full px-7 py-2.5 text-[1.05rem] font-semibold">
        {submitLabel}
      </Button>
    </div>
  );
}

interface SkillFormValues {
  skill: string;
}

interface LanguageFormValues {
  name: string;
  proficiency: string;
}

interface AboutFormValues {
  about: string;
}

interface HeadlineFormValues {
  headline: string;
}

interface ProfileLanguageFormValues {
  profile_language: string;
}

const SUPPORTED_PROFILE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Hindi",
  "Chinese",
  "Japanese",
  "Korean",
  "Portuguese",
  "Arabic"
];

interface PublicProfileUrlFormValues {
  profile_slug: string;
}

export interface ContactInfoValues {
  phone: string;
  birthday: string;
  website: string;
  location_city: string;
  location_state: string;
  location_country: string;
}

export interface ContactInfoSnapshot {
  email?: string | null;
  birthday?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
}

export function EditAboutModal({
  onClose,
  onSave,
  initialValue
}: {
  onClose: () => void;
  onSave: (about: string) => Promise<void>;
  initialValue?: string | null;
}) {
  const { register, handleSubmit, watch, formState } = useForm<AboutFormValues>({
    defaultValues: { about: initialValue ?? "" }
  });
  const length = watch("about")?.length ?? 0;

  return (
    <ModalShell
      title="Edit about"
      widthClass="max-w-[960px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="edit-about-form" disabled={formState.isSubmitting} />}
    >
      <form
        id="edit-about-form"
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => onSave(values.about.trim()))}
      >
        <FieldLabel>About</FieldLabel>
        <Textarea
          {...register("about", { maxLength: 2600 })}
          aria-label="About"
          className="min-h-[260px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] focus:shadow-none"
        />
        <p className="text-right text-sm text-[#777777]">{length}/2600</p>
      </form>
    </ModalShell>
  );
}

export interface SkillFormSavePayload {
  skillName: string;
  experienceIndices: number[];
  educationIndices: number[];
  followThisSkill: boolean;
}

function experienceMapLabel(entry: ExperienceEntry) {
  const title = (entry.title || "").trim() || "Role";
  const company = (entry.company || "").trim() || "Organization";
  return `${title} at ${company}`;
}

function formatSkillNameForLabel(name: string) {
  const t = name.trim();
  return t || "this";
}

export function SkillFormModal({
  mode,
  displaySkillName,
  experience,
  education,
  initialExperienceIndices,
  initialEducationIndices,
  initialFollow,
  suggestions = [],
  onClose,
  onSave,
  onDelete
}: {
  mode: "add" | "edit";
  /** Exact skill on profile in edit mode. Ignored in add. */
  displaySkillName: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  initialExperienceIndices: number[];
  initialEducationIndices: number[];
  initialFollow: boolean;
  suggestions?: string[];
  onClose: () => void;
  onSave: (payload: SkillFormSavePayload) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { register, handleSubmit, setValue, watch, formState } = useForm<SkillFormValues>({
    defaultValues: { skill: "" }
  });
  const [expSelected, setExpSelected] = useState<Set<number>>(() => new Set(initialExperienceIndices));
  const [eduSelected, setEduSelected] = useState<Set<number>>(() => new Set(initialEducationIndices));
  const [follow, setFollow] = useState(initialFollow);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const skillField = watch("skill") ?? "";
  const forLabel = mode === "add" ? formatSkillNameForLabel(canonicalizeSkill(skillField) || skillField) : formatSkillNameForLabel(displaySkillName);

  const formId = mode === "add" ? "add-skill-form" : "edit-skill-form";
  const title = mode === "add" ? "Add skill" : `Edit ${displaySkillName}`;

  const saveDisabled = formState.isSubmitting || saving || deleting;

  async function runSave(skillName: string) {
    const name = mode === "add" ? canonicalizeSkill(skillName) : displaySkillName.trim();
    if (mode === "add" && !name) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        skillName: name,
        experienceIndices: [...expSelected].sort((a, b) => a - b),
        educationIndices: [...eduSelected].sort((a, b) => a - b),
        followThisSkill: follow
      });
    } finally {
      setSaving(false);
    }
  }

  function onFormSubmit(e: FormEvent) {
    if (mode === "add") {
      void handleSubmit((values) => runSave(values.skill))(e);
    } else {
      e.preventDefault();
      void runSave(displaySkillName);
    }
  }

  return (
    <ModalShell
      title={title}
      widthClass="max-w-[1180px]"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <div>
            {mode === "edit" && onDelete ? (
              <button
                type="button"
                className="text-[1.05rem] font-semibold text-[#4b4b4b] transition hover:text-[#1f1f1f] disabled:pointer-events-none disabled:opacity-50"
                disabled={saveDisabled}
                onClick={() => {
                  setDeleting(true);
                  void Promise.resolve(onDelete()).finally(() => setDeleting(false));
                }}
              >
                Delete skill
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            disabled={saveDisabled}
            className="rounded-full px-7 py-2.5 text-[1.05rem] font-semibold"
            onClick={() => {
              const node = typeof document !== "undefined" ? document.getElementById(formId) : null;
              if (node instanceof HTMLFormElement) {
                node.requestSubmit();
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <form id={formId} className="space-y-8" onSubmit={onFormSubmit}>
        {mode === "add" ? <p className="text-sm text-[#5f6b7a]">* Indicates required</p> : null}
        {mode === "add" ? (
          <div>
            <FieldLabel>Skill*</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-[17px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#5f6368]" />
              <Input
                {...register("skill", { required: true })}
                aria-label="Skill name"
                className="h-[50px] rounded-[10px] border-[#b8c0c7] !pl-[3rem] text-[1rem] focus:shadow-none focus:!outline-none"
              />
            </div>
            {showSuggestions && suggestions.length ? (
              <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f5f5f4] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[1.1rem] font-semibold text-[#1f1f1f]">Suggested based on your profile</p>
                  <button type="button" className="rounded-full p-1 text-[#4b5563] hover:bg-[#e5e7eb]" onClick={() => setShowSuggestions(false)}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 12).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded-full border border-[#9ca3af] bg-white px-3 py-1.5 text-sm font-semibold text-[#374151] transition hover:bg-[#f3f4f6]"
                      onClick={() => setValue("skill", suggestion, { shouldValidate: true, shouldDirty: true })}
                    >
                      {suggestion} +
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          {mode === "add" ? (
            <>
              <h3 className="text-[1.1rem] font-semibold text-[#1f1f1f]">Show us where you used this skill</h3>
              <p className="mt-1 text-sm text-[#5f6b7a]">
                75% of hirers value skill context. Search at least one item to show where you used this skill.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-[1.1rem] font-semibold text-[#1f1f1f]">Tell us where you put this skill to use</h3>
              <p className="mt-1 text-sm text-[#5f6b7a]">Select any item where this skill applies</p>
            </>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Experience</p>
            {experience.length ? (
              <div className="space-y-2 pl-0">
                {experience.map((entry, i) => (
                  <label key={`exp-${i}`} className="flex cursor-pointer items-start gap-3 rounded-lg p-1 hover:bg-[#f3f6f8]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-[#9ca3af] text-[#0a66c2] focus:ring-brand"
                      checked={expSelected.has(i)}
                      onChange={() => {
                        setExpSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                    />
                    <span className="text-[0.95rem] text-[#1f1f1f]">{experienceMapLabel(entry)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b7280]">Add an experience to map this skill to a role.</p>
            )}
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Education</p>
            {education.length ? (
              <div className="space-y-2 pl-0">
                {education.map((entry, i) => (
                  <label key={`edu-${i}`} className="flex cursor-pointer items-start gap-3 rounded-lg p-1 hover:bg-[#f3f6f8]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-[#9ca3af] text-[#0a66c2] focus:ring-brand"
                      checked={eduSelected.has(i)}
                      onChange={() => {
                        setEduSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                    />
                    <span className="text-[0.95rem] text-[#1f1f1f]">{(entry.school || "").trim() || "School"}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b7280]">Add education to map this skill to a school.</p>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-[#9ca3af] text-[#0a66c2] focus:ring-brand"
            checked={follow}
            onChange={(ev) => setFollow(ev.target.checked)}
          />
          <span className="text-sm text-[#1f1f1f]">
            Follow the <span className="font-semibold">{forLabel}</span> skill to get job recommendations
          </span>
        </label>
      </form>
    </ModalShell>
  );
}

function formatSkillSources(mappings: string[] | undefined): string {
  if (!mappings?.length) return "Added from profile";
  if (mappings.length === 1) return mappings[0];
  return mappings.join(" · ");
}

export function SkillsListModal({
  onClose,
  skills,
  skillMappings,
  onSelectSkill
}: {
  onClose: () => void;
  skills: string[];
  skillMappings?: Record<string, string[]>;
  /** When set, rows open edit flow for the skill. */
  onSelectSkill?: (skill: string) => void;
}) {
  return (
    <ModalShell
      title={`All skills${skills.length ? ` (${skills.length})` : ""}`}
      widthClass="max-w-[700px]"
      onClose={onClose}
      footer={
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      }
    >
      {skills.length ? (
        <ul className="space-y-0 divide-y divide-[#edf1f4]">
          {skills.map((skill) => {
            const sources = skillMappings?.[skill];
            return (
              <li key={skill} className="py-4 first:pt-0">
                {onSelectSkill ? (
                  <button
                    type="button"
                    className="w-full text-left transition hover:opacity-80"
                    onClick={() => onSelectSkill(skill)}
                  >
                    <p className="text-[1.15rem] font-semibold text-[#1f1f1f]">{skill}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#555555]">{formatSkillSources(sources)}</p>
                  </button>
                ) : (
                  <>
                    <p className="text-[1.15rem] font-semibold text-[#1f1f1f]">{skill}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#555555]">{formatSkillSources(sources)}</p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-[#6b7280]">No skills to show.</p>
      )}
    </ModalShell>
  );
}

export function AddLanguageModal({
  onClose,
  onSave,
  initialValues,
  onDelete
}: {
  onClose: () => void;
  onSave: (language: { name: string; proficiency: string }) => Promise<void>;
  initialValues?: { name: string; proficiency: string } | null;
  onDelete?: (() => Promise<void>) | null;
}) {
  const isEdit = Boolean(initialValues);
  const { register, handleSubmit, formState, reset } = useForm<LanguageFormValues>({
    mode: "onBlur",
    defaultValues: {
      name: initialValues?.name ?? "",
      proficiency: initialValues?.proficiency ?? ""
    }
  });
  useEffect(() => {
    reset({
      name: initialValues?.name ?? "",
      proficiency: initialValues?.proficiency ?? ""
    });
  }, [initialValues, reset]);

  return (
    <ModalShell
      title={isEdit ? "Edit language" : "Add language"}
      widthClass="max-w-[980px]"
      onClose={onClose}
      footer={
        <ModalFooter
          submitLabel="Save"
          formId="add-language-form"
          disabled={formState.isSubmitting}
          onDelete={isEdit && onDelete ? () => void onDelete() : null}
          deleteText="Delete language"
        />
      }
    >
      <form
        id="add-language-form"
        className="space-y-5"
        onSubmit={handleSubmit(async (values) =>
          onSave({
            name: values.name.trim(),
            proficiency: values.proficiency
          })
        )}
      >
        <p className="text-sm text-[#6b7280]">Self identify your language and proficiency.</p>
        <div>
          <FieldLabel>Language*</FieldLabel>
          <Input {...register("name", { required: true })} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          {formState.errors.name ? <p className="mt-1 text-sm font-medium text-red-600">Language name is required.</p> : null}
        </div>
        <div>
          <FieldLabel>Proficiency level</FieldLabel>
          <Select {...register("proficiency", { required: "Choose a proficiency level." })}>
            <option value="">Select proficiency</option>
            <option value="Elementary proficiency">Elementary proficiency</option>
            <option value="Limited working proficiency">Limited working proficiency</option>
            <option value="Professional working proficiency">Professional working proficiency</option>
            <option value="Full professional proficiency">Full professional proficiency</option>
            <option value="Native or bilingual proficiency">Native or bilingual proficiency</option>
          </Select>
          {formState.errors.proficiency ? (
            <p className="mt-1 text-sm font-medium text-red-600">{formState.errors.proficiency.message as string}</p>
          ) : null}
        </div>
      </form>
    </ModalShell>
  );
}

export function EditHeadlineModal({
  onClose,
  onSave,
  initialValue
}: {
  onClose: () => void;
  onSave: (headline: string) => Promise<void>;
  initialValue?: string | null;
}) {
  const { register, handleSubmit, watch, formState } = useForm<HeadlineFormValues>({
    defaultValues: { headline: initialValue ?? "" }
  });
  const length = watch("headline")?.length ?? 0;

  return (
    <ModalShell
      title="Edit intro"
      widthClass="max-w-[1180px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="edit-headline-form" disabled={formState.isSubmitting} />}
    >
      <form
        id="edit-headline-form"
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => onSave(values.headline.trim()))}
      >
        <div>
          <FieldLabel>Headline*</FieldLabel>
          <Textarea
            {...register("headline", {
              required: true,
              maxLength: 220,
              validate: (value) => value.trim().length > 0
            })}
            aria-label="Headline"
            className="min-h-[116px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] leading-7 focus:shadow-none"
          />
          <p className="mt-2 text-sm text-[#6b7280]">Review and edit your headline before saving so it reflects your profile clearly.</p>
          <p className="text-right text-sm text-[#777777]">{length}/220</p>
        </div>
      </form>
    </ModalShell>
  );
}

export function EditProfileLanguageModal({
  onClose,
  onSave,
  initialValue
}: {
  onClose: () => void;
  onSave: (profileLanguage: string) => Promise<void>;
  initialValue?: string | null;
}) {
  const { register, handleSubmit, formState } = useForm<ProfileLanguageFormValues>({
    defaultValues: { profile_language: initialValue?.trim() || "English" }
  });

  return (
    <ModalShell
      title="Edit current profile language"
      widthClass="max-w-[760px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="edit-profile-language-form" disabled={formState.isSubmitting} />}
    >
      <form
        id="edit-profile-language-form"
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => onSave(values.profile_language.trim()))}
      >
        <p className="text-sm text-[#6b7280]">
          Choose the language currently used for your profile. This updates the active profile language shown to others.
        </p>
        <FieldLabel>Current profile language</FieldLabel>
        <Select {...register("profile_language", { required: "Choose a language." })}>
          {SUPPORTED_PROFILE_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </Select>
        {formState.errors.profile_language ? (
          <p className="mt-1 text-sm font-medium text-red-600">{formState.errors.profile_language.message as string}</p>
        ) : null}
      </form>
    </ModalShell>
  );
}

export function EditPublicProfileUrlModal({
  onClose,
  onSave,
  initialValue
}: {
  onClose: () => void;
  onSave: (profileSlug: string) => Promise<void>;
  initialValue?: string | null;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.linkedin.com";
  const { register, handleSubmit, formState, setValue } = useForm<PublicProfileUrlFormValues>({
    defaultValues: { profile_slug: initialValue ?? "" }
  });

  return (
    <ModalShell
      title="Edit public profile URL"
      widthClass="max-w-[760px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="edit-public-url-form" disabled={formState.isSubmitting} />}
    >
      <form
        id="edit-public-url-form"
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => onSave(values.profile_slug.trim()))}
      >
        <FieldLabel>Public profile URL</FieldLabel>
        <div className="flex items-center rounded-[10px] border border-[#b8c0c7] bg-white px-4 py-3">
          <span className="mr-1 shrink-0 text-sm text-[#6b7280]">{origin}/in/</span>
          <Input
            {...register("profile_slug", { required: true, minLength: 3, maxLength: 160 })}
            onChange={(event) => {
              const normalized = event.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/-{2,}/g, "-")
                .replace(/^-+|-+$/g, "");
              setValue("profile_slug", normalized, { shouldDirty: true, shouldValidate: true });
            }}
            className="h-auto min-h-0 flex-1 border-0 px-0 py-0 text-[1rem] focus-visible:ring-0"
          />
        </div>
        <p className="text-sm text-[#6b7280]">Use letters, numbers, and dashes.</p>
      </form>
    </ModalShell>
  );
}

function ContactInfoRow({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof Mail;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 text-[#3f3f46]" />
      <div className="min-w-0">
        <p className="text-lg font-semibold text-[#1f1f1f]">{label}</p>
        <p className="truncate text-[#0a66c2]">{value}</p>
      </div>
    </div>
  );
}

export function ContactInfoModal({
  onClose,
  contact,
  isOwnProfile,
  onEdit
}: {
  onClose: () => void;
  contact: ContactInfoSnapshot;
  isOwnProfile: boolean;
  onEdit: () => void;
}) {
  return (
    <ModalShell
      title="Contact info"
      widthClass="max-w-[920px]"
      onClose={onClose}
      footer={
        <div className="flex w-full justify-end">
          {isOwnProfile ? (
            <Button type="button" variant="secondary" className="rounded-full px-5 py-2 text-base font-semibold" onClick={onEdit}>
              Edit contact info
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        {contact.email ? <ContactInfoRow label="Email" value={contact.email} icon={Mail} /> : null}
        {contact.birthday ? <ContactInfoRow label="Birthday" value={contact.birthday} icon={Cake} /> : null}
        {contact.phone ? <ContactInfoRow label="Phone" value={contact.phone} icon={Phone} /> : null}
        {contact.website ? <ContactInfoRow label="Website" value={contact.website} icon={Globe} /> : null}
        {contact.location ? <ContactInfoRow label="Location" value={contact.location} icon={MapPin} /> : null}
      </div>
    </ModalShell>
  );
}

export function EditContactInfoModal({
  onClose,
  onSave,
  initialValue,
  email
}: {
  onClose: () => void;
  onSave: (values: ContactInfoValues) => Promise<void>;
  initialValue: ContactInfoValues;
  email?: string | null;
}) {
  const { register, handleSubmit, formState } = useForm<ContactInfoValues>({
    defaultValues: initialValue
  });
  return (
    <ModalShell
      title="Edit contact info"
      widthClass="max-w-[1180px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="edit-contact-info-form" disabled={formState.isSubmitting} />}
    >
      <form id="edit-contact-info-form" className="space-y-5" onSubmit={handleSubmit(async (values) => onSave(values))}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Email</FieldLabel>
            <Input
              disabled
              value={email ?? ""}
              readOnly
              aria-label="Account email"
              className="h-[50px] rounded-[10px] border-[#d1d5db] px-4 text-[1rem] text-[#9ca3af] focus:shadow-none"
            />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <Input {...register("phone")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
          <div>
            <FieldLabel>Birthday</FieldLabel>
            <Input {...register("birthday")} type="date" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
          <div>
            <FieldLabel>Website</FieldLabel>
            <Input {...register("website")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
          <div>
            <FieldLabel>City</FieldLabel>
            <Input {...register("location_city")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
          <div>
            <FieldLabel>State</FieldLabel>
            <Input {...register("location_state")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Country</FieldLabel>
            <Input {...register("location_country")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

interface EducationFormValues {
  school: string;
  degree: string;
  field_of_study: string;
  is_current: boolean;
  start_month: string;
  start_year: string;
  end_month: string;
  end_year: string;
  grade: string;
  activities: string;
  skill_ids: string;
}

export function AddEducationModal({
  onClose,
  onSave,
  initialValues,
  onDelete
}: {
  onClose: () => void;
  onSave: (education: EducationEntry) => Promise<void>;
  initialValues?: EducationEntry | null;
  onDelete?: (() => Promise<void>) | null;
}) {
  const { register, handleSubmit, watch, formState, setError, clearErrors } = useForm<EducationFormValues>({
    defaultValues: {
      school: initialValues?.school ?? "",
      degree: initialValues?.degree ?? "",
      field_of_study: initialValues?.field_of_study ?? initialValues?.field ?? "",
      is_current:
        initialValues == null
          ? false
          : !initialValues.end_year && !initialValues.end_month,
      start_month: initialValues?.start_month ?? "",
      start_year: initialValues?.start_year ? String(initialValues.start_year) : "",
      end_month: initialValues?.end_month ?? "",
      end_year: initialValues?.end_year ? String(initialValues.end_year) : "",
      grade: initialValues?.grade ?? "",
      activities: initialValues?.activities ?? "",
      skill_ids: (initialValues?.skill_ids ?? []).join(", ")
    }
  });
  const gradeLength = watch("grade")?.length ?? 0;
  const activitiesLength = watch("activities")?.length ?? 0;
  const isCurrent = watch("is_current");
  const dateError = formState.errors.end_year?.message as string | undefined;

  return (
    <ModalShell
      title={initialValues ? "Edit education" : "Add education"}
      widthClass="max-w-[1180px]"
      onClose={onClose}
      footer={
        <ModalFooter
          submitLabel="Save"
          formId="add-education-form"
          disabled={formState.isSubmitting}
          onDelete={initialValues && onDelete ? () => void onDelete() : null}
          deleteText="Delete education"
        />
      }
    >
      <form
        id="add-education-form"
        className="space-y-7"
        onSubmit={handleSubmit(async (values) => {
          clearErrors("end_year");
          const startYear = values.start_year ? Number(values.start_year) : null;
          const endYear = values.is_current ? null : values.end_year ? Number(values.end_year) : null;
          const endMonth = values.is_current ? null : values.end_month || null;
          const diff = compareYearMonth(startYear, values.start_month || null, endYear, endMonth);
          if (diff > 0) {
            setError("end_year", { type: "validate", message: "End date must be after the start date" });
            return;
          }
          await onSave({
            school: values.school.trim(),
            degree: values.degree.trim() || null,
            field: values.field_of_study.trim() || null,
            field_of_study: values.field_of_study.trim() || null,
            start_month: values.start_month || null,
            start_year: startYear,
            end_month: endMonth,
            end_year: endYear,
            year: endYear,
            grade: values.grade.trim() || null,
            activities: values.activities.trim() || null,
            skill_ids: values.skill_ids.split(",").map((item) => item.trim()).filter(Boolean)
          });
        })}
      >
        <div>
          <FieldLabel>School*</FieldLabel>
          <Input {...register("school", { required: true })} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Degree</FieldLabel>
          <Input {...register("degree")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Field of study</FieldLabel>
          <Input {...register("field_of_study")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[1.1rem] font-semibold text-[#2f2f2f]">Start date</p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <FieldLabel>Month</FieldLabel>
                <Select {...register("start_month")}>
                  <option value="">Month</option>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel>Year</FieldLabel>
                <Select {...register("start_year")}>
                  <option value="">Year</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 text-[1.05rem] font-semibold text-[#454545]">
            <input type="checkbox" {...register("is_current")} className="h-6 w-6 rounded border-[#7b7b7b] accent-[#0c7c59]" />
            <span>I am currently studying here (Present)</span>
          </label>

          {!isCurrent ? (
            <div>
              <p className="mb-3 text-[1.1rem] font-semibold text-[#2f2f2f]">End date (or expected)</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Month</FieldLabel>
                  <Select {...register("end_month")}>
                    <option value="">Month</option>
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Year</FieldLabel>
                  <Select {...register("end_year")}>
                    <option value="">Year</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          ) : null}
          {dateError ? <p className="text-sm text-red-600">{dateError}</p> : null}
        </div>

        <div>
          <FieldLabel>Grade</FieldLabel>
          <Input {...register("grade", { maxLength: 80 })} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
          <p className="mt-2 text-right text-sm text-[#777777]">{gradeLength}/80</p>
        </div>
        <div>
          <FieldLabel>Activities and societies</FieldLabel>
          <Textarea
            {...register("activities", { maxLength: 500 })}
            aria-label="Activities and societies"
            className="min-h-[120px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] focus:shadow-none"
          />
          <p className="mt-2 text-right text-sm text-[#777777]">{activitiesLength}/500</p>
        </div>
        <div>
          <FieldLabel>Linked skills</FieldLabel>
          <Input {...register("skill_ids")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
      </form>
    </ModalShell>
  );
}

interface ExperienceFormValues {
  title: string;
  employment_type: string;
  company: string;
  is_current: boolean;
  start_month: string;
  start_year: string;
  end_month: string;
  end_year: string;
  location: string;
  location_type: string;
  description: string;
  skill_ids: string;
}

export function AddExperienceModal({
  onClose,
  onSave,
  initialValues,
  onDelete
}: {
  onClose: () => void;
  onSave: (experience: ExperienceEntry) => Promise<void>;
  initialValues?: ExperienceEntry | null;
  onDelete?: (() => Promise<void>) | null;
}) {
  const { register, handleSubmit, watch, formState, setError, clearErrors } = useForm<ExperienceFormValues>({
    defaultValues: {
      title: initialValues?.title ?? "",
      employment_type: initialValues?.employment_type ?? "",
      company: initialValues?.company ?? "",
      is_current: initialValues?.is_current ?? true,
      start_month: initialValues?.start_month ?? "",
      start_year: initialValues?.start_year ? String(initialValues.start_year) : "",
      end_month: initialValues?.end_month ?? "",
      end_year: initialValues?.end_year ? String(initialValues.end_year) : "",
      location: initialValues?.location ?? "",
      location_type: initialValues?.location_type ?? "",
      description: initialValues?.description ?? "",
      skill_ids: (initialValues?.skill_ids ?? []).join(", ")
    }
  });
  const isCurrent = watch("is_current");
  const expDateError = formState.errors.end_year?.message as string | undefined;

  return (
    <ModalShell
      title={initialValues ? "Edit experience" : "Add experience"}
      widthClass="max-w-[1220px]"
      onClose={onClose}
      footer={
        <ModalFooter
          submitLabel="Save"
          formId="add-experience-form"
          disabled={formState.isSubmitting}
          onDelete={initialValues && onDelete ? () => void onDelete() : null}
          deleteText="Delete experience"
        />
      }
    >
      <form
        id="add-experience-form"
        className="space-y-7"
        onSubmit={handleSubmit(async (values) => {
          clearErrors("end_year");
          const startYear = values.start_year ? Number(values.start_year) : null;
          const endMonth = values.is_current ? null : values.end_month || null;
          const endYear = values.is_current ? null : values.end_year ? Number(values.end_year) : null;
          const diff = compareYearMonth(startYear, values.start_month || null, endYear, endMonth);
          if (diff > 0) {
            setError("end_year", { type: "validate", message: "End date must be after the start date" });
            return;
          }
          await onSave({
            title: values.title.trim(),
            employment_type: values.employment_type || null,
            company: values.company.trim(),
            is_current: Boolean(values.is_current),
            start_month: values.start_month || null,
            start_year: startYear,
            end_month: endMonth,
            end_year: endYear,
            location: values.location.trim() || null,
            location_type: values.location_type || null,
            description: values.description.trim() || null,
            skill_ids: values.skill_ids.split(",").map((item) => item.trim()).filter(Boolean)
          });
        })}
      >
        <div>
          <FieldLabel>Title*</FieldLabel>
          <Input {...register("title", { required: true })} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Employment type</FieldLabel>
          <Select {...register("employment_type")}>
            <option value="">Please select</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="self-employed">Self-employed</option>
            <option value="freelance">Freelance</option>
          </Select>
        </div>
        <div>
          <FieldLabel>Company or organization*</FieldLabel>
          <Input {...register("company", { required: true })} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
        <label className="flex items-center gap-3 text-[1.05rem] font-semibold text-[#454545]">
          <input type="checkbox" {...register("is_current")} className="h-6 w-6 rounded border-[#7b7b7b] accent-[#0c7c59]" />
          <span>I am currently working in this role</span>
        </label>

        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[1.1rem] font-semibold text-[#2f2f2f]">Start date</p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <FieldLabel>Month</FieldLabel>
                <Select {...register("start_month")}>
                  <option value="">Month</option>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel>Year*</FieldLabel>
                <Select {...register("start_year")}>
                  <option value="">Year</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {!isCurrent ? (
            <div>
              <p className="mb-3 text-[1.1rem] font-semibold text-[#2f2f2f]">End date</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Month</FieldLabel>
                  <Select {...register("end_month")}>
                    <option value="">Month</option>
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Year</FieldLabel>
                  <Select {...register("end_year")}>
                    <option value="">Year</option>
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          ) : null}
          {expDateError ? <p className="text-sm text-red-600">{expDateError}</p> : null}
        </div>

        <div>
          <FieldLabel>Location</FieldLabel>
          <Input {...register("location")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Location type</FieldLabel>
          <Select {...register("location_type")}>
            <option value="">Please select</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </Select>
          <p className="mt-2 text-sm text-[#6f6f6f]">Pick a location type (ex: remote)</p>
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Textarea {...register("description")} className="min-h-[150px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Linked skills</FieldLabel>
          <Input {...register("skill_ids")} className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] focus:shadow-none" />
        </div>
      </form>
    </ModalShell>
  );
}
