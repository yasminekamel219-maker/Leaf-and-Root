import type { ApiResponseSchemaHost } from "@nestjs/swagger";
import { z, type ZodType } from "zod";

export type OpenApiSchema = ApiResponseSchemaHost["schema"];

/** Derives an OpenAPI-compatible JSON Schema from a Zod schema so docs cannot drift from validation. */
export function toOpenApiSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return rest;
}

export const userOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["id", "email", "name", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    name: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const userEnvelopeOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["user"],
      properties: { user: userOpenApiSchema },
    },
  },
};

export const plantOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["id", "name", "species", "location", "notes", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", maxLength: 80 },
    species: { type: "string", maxLength: 120, nullable: true },
    location: { type: "string", maxLength: 80, nullable: true },
    notes: { type: "string", maxLength: 1000, nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const plantEnvelopeOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["data"],
  properties: {
    data: { type: "object", required: ["plant"], properties: { plant: plantOpenApiSchema } },
  },
};

export const plantListEnvelopeOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["data", "meta"],
  properties: {
    data: {
      type: "object",
      required: ["plants"],
      properties: { plants: { type: "array", items: plantOpenApiSchema } },
    },
    meta: {
      type: "object",
      required: ["total", "limit", "offset"],
      properties: {
        total: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 },
      },
    },
  },
};

/** Returned instead of a cookie when the client asks for `X-Auth-Transport: bearer`. */
export const bearerEnvelopeOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["user", "token", "expiresAt"],
      properties: {
        user: userOpenApiSchema,
        token: { type: "string", description: "Opaque session token; send as `Authorization: Bearer`." },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
  },
};

export const errorOpenApiSchema: OpenApiSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string" },
        details: {},
      },
    },
  },
};
