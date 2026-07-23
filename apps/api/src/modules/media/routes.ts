import {
  addMealPhotosInputSchema,
  completeMediaUploadInputSchema,
  idSchema,
  mediaUploadSessionInputSchema,
  updateMealPhotoInputSchema,
} from "@jiayan/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../accounts/auth-service";
import type { MediaService } from "./service";

export interface MediaRoutesOptions {
  auth: AuthService;
  media: MediaService;
}

const mediaParamsSchema = z.object({ mediaId: idSchema });
const mealPlanParamsSchema = z.object({ mealPlanId: idSchema });
const photoParamsSchema = z.object({ photoId: idSchema });

export function registerMediaRoutes(
  app: FastifyInstance,
  options: MediaRoutesOptions,
): void {
  app.post("/v1/media/upload-sessions", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const input = mediaUploadSessionInputSchema.parse(request.body);
    const data = await options.media.createUploadSession(
      principal.userId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/media/:mediaId/complete", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = mediaParamsSchema.parse(request.params);
    const input = completeMediaUploadInputSchema.parse(request.body);
    const data = await options.media.completeUpload(
      principal.userId,
      params.mediaId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.get("/v1/meal-plans/:mealPlanId/photos", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = mealPlanParamsSchema.parse(request.params);
    const data = await options.media.listMealPhotos(
      principal.userId,
      params.mealPlanId,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/meal-plans/:mealPlanId/photos", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = mealPlanParamsSchema.parse(request.params);
    const input = addMealPhotosInputSchema.parse(request.body);
    const data = await options.media.addMealPhotos(
      principal.userId,
      params.mealPlanId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.patch("/v1/meal-photos/:photoId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = photoParamsSchema.parse(request.params);
    const input = updateMealPhotoInputSchema.parse(request.body);
    const data = await options.media.updateMealPhoto(
      principal.userId,
      params.photoId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.delete("/v1/meal-photos/:photoId", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = photoParamsSchema.parse(request.params);
    await options.media.deleteMealPhoto(principal.userId, params.photoId);
    return reply.status(204).send();
  });
}
