import {
  idSchema,
  recipeCategorySchema,
  recipeOrderingStateSchema,
  saveFamilyRecipeInputSchema,
  updateFamilyRecipeInputSchema,
  updateRecipeOrderingStateInputSchema,
} from "@jiayan/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../accounts/auth-service";
import type { RecipeService } from "./service";

export interface RecipeRoutesOptions {
  auth: AuthService;
  recipes: RecipeService;
}

const kitchenParamsSchema = z.object({ kitchenId: idSchema });
const recipeParamsSchema = z.object({ recipeId: idSchema });
const recipeQuerySchema = z.object({
  orderingState: recipeOrderingStateSchema.optional(),
  category: recipeCategorySchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export function registerRecipeRoutes(
  app: FastifyInstance,
  options: RecipeRoutesOptions,
): void {
  app.get("/v1/kitchens/:kitchenId/recipes", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const query = recipeQuerySchema.parse(request.query);
    const data = await options.recipes.list(
      params.kitchenId,
      principal.userId,
      {
        ...(query.orderingState ? { orderingState: query.orderingState } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
    );
    return { data, meta: { requestId: request.id } };
  });

  app.post("/v1/kitchens/:kitchenId/recipes", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const input = saveFamilyRecipeInputSchema.parse(request.body);
    const data = await options.recipes.create(
      params.kitchenId,
      principal.userId,
      input,
    );
    return reply.status(201).send({
      data,
      meta: { requestId: request.id },
    });
  });

  app.get("/v1/recipes/:recipeId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = recipeParamsSchema.parse(request.params);
    const query = kitchenParamsSchema.parse(request.query);
    const data = await options.recipes.get(
      params.recipeId,
      query.kitchenId,
      principal.userId,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.patch("/v1/recipes/:recipeId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = recipeParamsSchema.parse(request.params);
    const query = kitchenParamsSchema.parse(request.query);
    const input = updateFamilyRecipeInputSchema.parse(request.body);
    const data = await options.recipes.update(
      params.recipeId,
      query.kitchenId,
      principal.userId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.patch("/v1/recipes/:recipeId/ordering-state", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = recipeParamsSchema.parse(request.params);
    const query = kitchenParamsSchema.parse(request.query);
    const input = updateRecipeOrderingStateInputSchema.parse(request.body);
    const data = await options.recipes.setOrderingState(
      params.recipeId,
      query.kitchenId,
      principal.userId,
      input,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.delete("/v1/recipes/:recipeId", async (request, reply) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = recipeParamsSchema.parse(request.params);
    const query = kitchenParamsSchema.parse(request.query);
    await options.recipes.archive(
      params.recipeId,
      query.kitchenId,
      principal.userId,
    );
    return reply.status(204).send();
  });
}
