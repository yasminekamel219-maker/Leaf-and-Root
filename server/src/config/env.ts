import { z } from "zod";

const origin = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
    } catch {
      return false;
    }
  },
  { message: "must be an origin such as https://app.example.com (no path, no trailing slash)" },
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: "must be a postgresql:// connection string",
    }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Register/login attempts per client IP per 15 minutes (any email). Caps credential stuffing. */
  AUTH_RATE_LIMIT_IP: z.coerce.number().int().min(1).max(10_000).default(20),
  /** Register/login attempts per email per 15 minutes across all IPs. Caps distributed guessing. */
  AUTH_RATE_LIMIT_ACCOUNT: z.coerce.number().int().min(1).max(10_000).default(30),
  /** Comma-separated list of allowed browser origins. Empty disables CORS. */
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(origin)),
  /** Defaults to enabled outside production. */
  SWAGGER_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type Env = Omit<z.infer<typeof envSchema>, "SWAGGER_ENABLED"> & {
  SWAGGER_ENABLED: boolean;
};

/** Validates configuration and fails fast. Error text names keys only, never values. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const { SWAGGER_ENABLED, ...rest } = result.data;
  return { ...rest, SWAGGER_ENABLED: SWAGGER_ENABLED ?? rest.NODE_ENV !== "production" };
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test helper: forget the cached configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}
