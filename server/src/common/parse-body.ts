import { UnprocessableEntityException } from "@nestjs/common";
import type { ZodType } from "zod";

function parseWith<T>(schema: ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new UnprocessableEntityException({
    code: "VALIDATION_ERROR",
    message,
    details: result.error.issues,
  });
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  return parseWith(schema, body, "Invalid request body");
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  return parseWith(schema, query, "Invalid query parameters");
}
