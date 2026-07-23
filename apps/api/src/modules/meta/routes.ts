import type { FastifyInstance } from "fastify";

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get("/v1/meta", async (request) => ({
    data: {
      service: "jiayan-api",
      apiVersion: "v1",
    },
    meta: { requestId: request.id },
  }));
}
