import { z } from "zod";

/** Shared rules — keep in sync with backend `RegisterRequest` password validation. */
export const PASSWORD_MIN_LENGTH = 8;

export const passwordRuleCopy = {
  minLength: `At least ${PASSWORD_MIN_LENGTH} characters`,
  uppercase: "At least one uppercase letter",
  lowercase: "At least one lowercase letter",
  number: "At least one number",
  special: "At least one special character"
} as const;

const UPPER = /[A-Z]/;
const LOWER = /[a-z]/;
const DIGIT = /\d/;
/** Any non-alphanumeric counts as “special” (matches backend check). */
const SPECIAL = /[^A-Za-z0-9]/;

export type PasswordRuleId = keyof typeof passwordRuleCopy;

export function getPasswordRuleStatus(password: string): Record<PasswordRuleId, boolean> {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: UPPER.test(password),
    lowercase: LOWER.test(password),
    number: DIGIT.test(password),
    special: SPECIAL.test(password)
  };
}

export const strongPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .min(PASSWORD_MIN_LENGTH, passwordRuleCopy.minLength)
  .regex(UPPER, passwordRuleCopy.uppercase)
  .regex(LOWER, passwordRuleCopy.lowercase)
  .regex(DIGIT, passwordRuleCopy.number)
  .regex(SPECIAL, passwordRuleCopy.special);

export const loginEmailSchema = z
  .string()
  .min(1, "Enter your email address")
  .email("Enter a valid email address");

export const loginPasswordSchema = z.string().min(1, "Enter your password");

export const loginFormSchema = z.object({
  email: loginEmailSchema,
  password: loginPasswordSchema
});
