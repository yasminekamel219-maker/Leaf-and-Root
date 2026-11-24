import { z } from "zod";

/**
 * Self-service profile update. Only `name` is editable.
 * - `email` changes are deferred until an email-verification decision exists.
 * - `role`, `id`, `passwordHash` etc. are rejected by `.strict()` so users can never self-assign privileges.
 */
export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
