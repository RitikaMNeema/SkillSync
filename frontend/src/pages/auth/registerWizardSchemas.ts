import { z } from "zod";
import { strongPasswordSchema } from "../../utils/authValidation";

export const joinStepSchema = z
  .object({
    email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"]
  });

export const nameStepSchema = z.object({
  firstName: z.string().min(1, "Enter your first name"),
  lastName: z.string().min(1, "Enter your last name")
});

export const memberExperienceStepSchema = z
  .object({
    isStudent: z.boolean(),
    jobTitle: z.string().optional(),
    company: z.string().optional(),
    school: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    startYear: z.string().optional(),
    ageConfirmed: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.isStudent) {
      if (!data.jobTitle?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Job title is required", path: ["jobTitle"] });
      }
      if (!data.company?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company or employer is required", path: ["company"] });
      }
    } else {
      if (!data.school?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "School or university is required", path: ["school"] });
      }
      if (!data.fieldOfStudy?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Field of study is required", path: ["fieldOfStudy"] });
      }
      if (!data.startYear?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Start year is required", path: ["startYear"] });
      }
      if (!data.ageConfirmed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please confirm you are over 16 years of age",
          path: ["ageConfirmed"]
        });
      }
    }
  });

/** Job seeker or recruiter: location (required) + optional phone, same max length as DB `VARCHAR(30)` */
export const locationWithOptionalPhoneStepSchema = z.object({
  location: z.string().min(1, "Enter your location"),
  phone: z.string().max(30, "Phone must be 30 characters or fewer").optional()
});

export const headlineStepSchema = z.object({
  headline: z
    .string()
    .refine((s) => s.trim().length >= 1, "Headline is required")
    .refine((s) => s.trim().length <= 220, "Headline must be 220 characters or fewer")
});

export const organizationStepSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyIndustry: z.string().optional(),
  companySize: z.string().optional()
});

export const phoneOptionalSchema = z.object({
  phone: z.string().optional()
});

