import { z } from "zod";

/**
 * Provisional limits (engineering assumptions, not approved requirements): name 80, species 120,
 * location 80, notes 1000. `.strict()` rejects every client-controlled field such as `userId`,
 * `id`, `status` or timestamps, so ownership can only come from the session.
 *
 * Optional text fields: surrounding whitespace is trimmed, an empty string is invalid (send `null`
 * to leave the value empty or to clear it).
 */
const name = z.string().trim().min(1).max(80);
const species = z.string().trim().min(1).max(120).nullable();
const location = z.string().trim().min(1).max(80).nullable();
const notes = z.string().trim().min(1).max(1000).nullable();

export const createPlantSchema = z
  .object({
    name,
    species: species.optional(),
    location: location.optional(),
    notes: notes.optional(),
  })
  .strict();

export const updatePlantSchema = z
  .object({
    name: name.optional(),
    species: species.optional(),
    location: location.optional(),
    notes: notes.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const listPlantsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();

export const plantIdSchema = z.uuid();

export type CreatePlantInput = z.infer<typeof createPlantSchema>;
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;
export type ListPlantsQuery = z.infer<typeof listPlantsQuerySchema>;
