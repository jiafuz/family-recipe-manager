import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config";
import { registerErrorHandler } from "./lib/error-handler";
import { registerAccountRoutes } from "./modules/accounts/routes";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerMetaRoutes } from "./modules/meta/routes";
import { registerMealRoutes } from "./modules/meals/routes";
import { registerMediaRoutes } from "./modules/media/routes";
import { registerRecipeRoutes } from "./modules/recipes/routes";
import type { AppServices } from "./services";

export interface BuildAppOptions {
  config: AppConfig;
  services?: AppServices;
}

export function buildApp({
  config,
  services,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "body.code",
          "body.inviteCode",
          "body.accessToken",
          "body.refreshToken",
        ],
        censor: "[REDACTED]",
      },
    },
    requestIdHeader: "x-request-id",
  });

  registerErrorHandler(app);
  registerHealthRoutes(app);
  registerMetaRoutes(app);

  if (services) {
    registerAccountRoutes(app, services);
    registerRecipeRoutes(app, services);
    registerMealRoutes(app, services);
    registerMediaRoutes(app, services);
    app.addHook("onClose", async () => services.dispose());
  }

  return app;
}
