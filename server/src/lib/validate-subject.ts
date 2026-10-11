import { z } from "zod";

export const subjectInputSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  middleName: z.string().max(100).optional(),
  email: z
    .string()
    .max(254)
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Invalid email format" }),
  phone: z.string().max(30).optional(),
  username: z.string().max(64).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  employer: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  mode: z.enum(["full", "fast", "validation"]).optional(),
  referencePhoto: z.string().max(7_000_000).optional(),
});

export type ValidatedSubjectInput = z.infer<typeof subjectInputSchema>;

export function parseInvestigateBody(body: unknown): { ok: true; data: ValidatedSubjectInput } | { ok: false; error: string } {
  const result = subjectInputSchema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, error: msg };
  }
  const hasIdentifier =
    result.data.firstName?.trim() ||
    result.data.lastName?.trim() ||
    result.data.email?.trim() ||
    result.data.username?.trim();
  if (!hasIdentifier) {
    return { ok: false, error: "At least one of firstName, lastName, email, or username is required" };
  }
  return { ok: true, data: result.data };
}