import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health/live", async () => ({
    data: { status: "ok" },
  }));

  app.get("/health/ready", async () => ({
    data: { status: "ready" },
  }));
}
