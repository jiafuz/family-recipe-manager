import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  PERSISTENCE_MODE: z.enum(["memory", "mysql"]).default("memory"),
  DATABASE_HOST: z.string().default("127.0.0.1"),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  DATABASE_NAME: z.string().default("jiayan"),
  DATABASE_USER: z.string().default("jiayan"),
  DATABASE_PASSWORD: z.string().default("jiayan-local-only"),
  DATABASE_CONNECTION_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  WECHAT_LOGIN_MODE: z.enum(["mock", "live"]).default("mock"),
  WECHAT_APP_ID: z.string().default(""),
  WECHAT_APP_SECRET: z.string().default(""),
  MEDIA_STORAGE_MODE: z.enum(["mock", "cos"]).default("mock"),
  TENCENT_CLOUD_SECRET_ID: z.string().default(""),
  TENCENT_CLOUD_SECRET_KEY: z.string().default(""),
  COS_BUCKET: z.string().default(""),
  COS_REGION: z.string().default(""),
  AUTH_ACCESS_TOKEN_SECRET: z
    .string()
    .min(32)
    .default("dev-only-access-token-secret-change-me"),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(180)
    .default(30),
  IDENTITY_HASH_SECRET: z
    .string()
    .min(32)
    .default("dev-only-identity-hash-secret-change-me"),
  INVITE_CODE_SECRET: z
    .string()
    .min(32)
    .default("dev-only-invite-code-secret-change-me"),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const config = environmentSchema.parse(environment);

  if (config.NODE_ENV === "production") {
    if (config.PERSISTENCE_MODE !== "mysql") {
      throw new Error("生产环境必须使用 MySQL 持久化模式");
    }

    if (config.WECHAT_LOGIN_MODE !== "live") {
      throw new Error("生产环境必须使用真实微信登录模式");
    }

    if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
      throw new Error("生产环境必须配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET");
    }

    if (
      config.MEDIA_STORAGE_MODE !== "cos" ||
      !config.TENCENT_CLOUD_SECRET_ID ||
      !config.TENCENT_CLOUD_SECRET_KEY ||
      !config.COS_BUCKET ||
      !config.COS_REGION
    ) {
      throw new Error("生产环境必须配置腾讯云 COS 图片存储");
    }

    const developmentSecrets = [
      config.AUTH_ACCESS_TOKEN_SECRET,
      config.IDENTITY_HASH_SECRET,
      config.INVITE_CODE_SECRET,
    ].some((secret) => secret.startsWith("dev-only-"));

    if (developmentSecrets) {
      throw new Error("生产环境不能使用开发环境默认密钥");
    }
  }

  return config;
}
