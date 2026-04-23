import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { useForm } from "react-hook-form";
import type { EducationEntry, ExperienceEntry } from "../../types/member";
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
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-4 py-8">
      <div className={`flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.22)] ${widthClass}`}>
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
  submitLabel,
  formId,
  disabled
}: {
  onDelete?: (() => void) | null;
  submitLabel: string;
  formId: string;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div>
        {onDelete ? (
          <button type="button" className="text-[1.05rem] font-semibold text-[#4b4b4b] transition hover:text-[#1f1f1f]" onClick={onDelete}>
            Delete
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

interface AboutFormValues {
  about: string;
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
          placeholder="You can write about your years of experience, industry, or skills. People also talk about their achievements or previous job experiences."
          className="min-h-[260px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none"
        />
        <p className="text-right text-sm text-[#777777]">{length}/2600</p>
      </form>
    </ModalShell>
  );
}

export function AddSkillModal({ onClose, onSave }: { onClose: () => void; onSave: (skill: string) => Promise<void> }) {
  const { register, handleSubmit, formState } = useForm<SkillFormValues>();

  return (
    <ModalShell
      title="Add skill"
      widthClass="max-w-[1180px]"
      onClose={onClose}
      footer={<ModalFooter submitLabel="Save" formId="add-skill-form" disabled={formState.isSubmitting} />}
    >
      <form id="add-skill-form" className="space-y-8" onSubmit={handleSubmit(async (values) => onSave(values.skill.trim()))}>
        <div>
          <FieldLabel>Skill*</FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1f1f1f]" />
            <Input
              {...register("skill", { required: true })}
              placeholder="Skill (ex: Project Management)"
              className="h-[50px] rounded-[10px] border-[#b8c0c7] pl-14 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none"
            />
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
      activities: initialValues?.activities ?? ""
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
            activities: values.activities.trim() || null
          });
        })}
      >
        <div>
          <FieldLabel>School*</FieldLabel>
          <Input {...register("school", { required: true })} placeholder="Ex: Boston University" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Degree</FieldLabel>
          <Input {...register("degree")} placeholder="Ex: Bachelor of Science" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
        </div>
        <div>
          <FieldLabel>Field of study</FieldLabel>
          <Input {...register("field_of_study")} placeholder="Ex: Business" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
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
            placeholder="Ex: Alpha Phi Omega, Marching Band, Volleyball"
            className="min-h-[120px] rounded-[10px] border-[#b8c0c7] px-4 py-3 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none"
          />
          <p className="mt-2 text-right text-sm text-[#777777]">{activitiesLength}/500</p>
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
      description: initialValues?.description ?? ""
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
            description: values.description.trim() || null
          });
        })}
      >
        <div>
          <FieldLabel>Title*</FieldLabel>
          <Input {...register("title", { required: true })} placeholder="Ex: Retail Sales Manager" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
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
          <Input {...register("company", { required: true })} placeholder="Ex: Microsoft" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
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
          <Input {...register("location")} placeholder="Ex: London, United Kingdom" className="h-[50px] rounded-[10px] border-[#b8c0c7] px-4 text-[1rem] placeholder:text-[#8b8b8b] focus:shadow-none" />
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
      </form>
    </ModalShell>
  );
}
