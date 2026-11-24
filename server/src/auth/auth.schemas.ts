import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(10).max(128);

export const registerSchema = z
  .object({
    email,
    password,
    name: z.string().trim().min(2).max(80),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
