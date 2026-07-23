import type { FastifyInstance } from "fastify";

import type { AuthService } from "../accounts/auth-service";
import type { MiniProgramCodeService } from "./mini-program-code-service";

interface MetaRoutesOptions {
  auth: AuthService;
  miniProgramCode: MiniProgramCodeService;
}

export function registerMetaRoutes(
  app: FastifyInstance,
  options?: MetaRoutesOptions,
): void {
  app.get("/v1/meta", async (request) => ({
    data: {
      service: "jiayan-api",
      apiVersion: "v1",
    },
    meta: { requestId: request.id },
  }));

  if (!options) return;

  app.get("/v1/meta/product-mini-program-code", async (request, reply) => {
    await options.auth.authenticate(request.headers.authorization);
    const code = await options.miniProgramCode.getProductCode();
    if (!code) return reply.status(204).send();
    return reply
      .header("cache-control", "private, max-age=86400")
      .type(code.contentType)
      .send(code.data);
  });
}
