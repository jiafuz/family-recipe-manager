import {
  createKitchenInputSchema,
  createKitchenInviteInputSchema,
  idSchema,
  joinKitchenInputSchema,
  loginWithWechatInputSchema,
  refreshSessionInputSchema,
  updateKitchenInputSchema,
} from "@jiayan/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthService } from "./auth-service";
import { KitchenService } from "./kitchen-service";

export interface AccountRoutesOptions {
  auth: AuthService;
  kitchens: KitchenService;
}

const kitchenParamsSchema = z.object({
  kitchenId: idSchema,
});

const kitchenMemberParamsSchema = kitchenParamsSchema.extend({
  memberUserId: idSchema,
});

function getDeviceLabel(request: FastifyRequest): string | null {
  const userAgent = request.headers["user-agent"];
  return typeof userAgent === "string" ? userAgent.slice(0, 120) : null;
}

export function registerAccountRoutes(
  app: FastifyInstance,
  options: AccountRoutesOptions,
): void {
  app.post("/v1/auth/wechat/login", async (request) => {
    const input = loginWithWechatInputSchema.parse(request.body);
    const data = await options.auth.loginWithWechat(
      input.code,
      getDeviceLabel(request),
    );

    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/auth/refresh", async (request) => {
    const input = refreshSessionInputSchema.parse(request.body);
    const data = await options.auth.refreshSession(
      input.refreshToken,
      getDeviceLabel(request),
    );

    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    await options.auth.logout(principal);
    return reply.status(204).send();
  });

  app.get("/v1/me", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const data = await options.auth.getCurrentUser(principal.userId);
    return { data, meta: { requestId: request.id } };
  });

  app.get("/v1/kitchens", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const data = await options.kitchens.listForUser(principal.userId);
    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/kitchens", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const input = createKitchenInputSchema.parse(request.body);
    const data = await options.kitchens.create(principal.userId, input);
    return reply.status(201).send({
      data,
      meta: { requestId: request.id },
    });
  });

  app.get("/v1/kitchens/:kitchenId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const data = await options.kitchens.getDetail(
      params.kitchenId,
      principal.userId,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.patch("/v1/kitchens/:kitchenId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const input = updateKitchenInputSchema.parse(request.body);
    const data = await options.kitchens.update(
      params.kitchenId,
      principal.userId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.delete(
    "/v1/kitchens/:kitchenId/members/:memberUserId",
    async (request) => {
      const principal = await options.auth.authenticate(
        request.headers.authorization,
      );
      const params = kitchenMemberParamsSchema.parse(request.params);
      const data = await options.kitchens.removeMember(
        params.kitchenId,
        principal.userId,
        params.memberUserId,
      );
      return { data, meta: { requestId: request.id } };
    },
  );

  app.delete("/v1/kitchens/:kitchenId/membership", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    await options.kitchens.leave(params.kitchenId, principal.userId);
    return reply.status(204).send();
  });

  app.delete("/v1/kitchens/:kitchenId", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    await options.kitchens.delete(params.kitchenId, principal.userId);
    return reply.status(204).send();
  });

  app.post("/v1/kitchens/:kitchenId/invites", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const input = createKitchenInviteInputSchema.parse(request.body ?? {});
    const data = await options.kitchens.createInvite({
      kitchenId: params.kitchenId,
      actorUserId: principal.userId,
      expiresInDays: input.expiresInDays,
      maxUses: input.maxUses,
    });
    return reply.status(201).send({
      data,
      meta: { requestId: request.id },
    });
  });

  app.post("/v1/kitchen-invites/join", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const input = joinKitchenInputSchema.parse(request.body);
    const data = await options.kitchens.join(
      principal.userId,
      input.inviteCode,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/kitchen-invites/preview", async (request) => {
    await options.auth.authenticate(request.headers.authorization);
    const input = joinKitchenInputSchema.parse(request.body);
    const data = await options.kitchens.previewInvite(input.inviteCode);
    return { data, meta: { requestId: request.id } };
  });
}
