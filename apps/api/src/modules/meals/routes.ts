import {
  completeMealPlanInputSchema,
  idSchema,
  localDateSchema,
  mealTypeSchema,
  saveMealPlanInputSchema,
  updateProcurementItemInputSchema,
} from "@jiayan/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../accounts/auth-service";
import type { MealPlanService } from "./service";

export interface MealRoutesOptions {
  auth: AuthService;
  meals: MealPlanService;
}

const kitchenParamsSchema = z.object({ kitchenId: idSchema });
const mealSlotParamsSchema = z.object({
  kitchenId: idSchema,
  date: localDateSchema,
  mealType: mealTypeSchema,
});
const mealRangeQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((value) => value.from <= value.to, "开始日期不能晚于结束日期");
const procurementParamsSchema = z.object({
  kitchenId: idSchema,
  date: localDateSchema,
});
const procurementItemParamsSchema = procurementParamsSchema.extend({
  itemId: idSchema,
});
const mealPlanIdParamsSchema = z.object({ mealPlanId: idSchema });

export function registerMealRoutes(
  app: FastifyInstance,
  options: MealRoutesOptions,
): void {
  app.get("/v1/kitchens/:kitchenId/meal-plans", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = kitchenParamsSchema.parse(request.params);
    const query = mealRangeQuerySchema.parse(request.query);
    const data = await options.meals.list(
      params.kitchenId,
      principal.userId,
      query.from,
      query.to,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.get(
    "/v1/kitchens/:kitchenId/meal-plans/:date/:mealType",
    async (request) => {
      const principal = await options.auth.authenticate(
        request.headers.authorization,
      );
      const params = mealSlotParamsSchema.parse(request.params);
      const data = await options.meals.get(
        params.kitchenId,
        principal.userId,
        params.date,
        params.mealType,
      );
      return { data, meta: { requestId: request.id } };
    },
  );

  app.get("/v1/meal-plans/:mealPlanId", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = mealPlanIdParamsSchema.parse(request.params);
    const data = await options.meals.getById(
      params.mealPlanId,
      principal.userId,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.put(
    "/v1/kitchens/:kitchenId/meal-plans/:date/:mealType",
    async (request) => {
      const principal = await options.auth.authenticate(
        request.headers.authorization,
      );
      const params = mealSlotParamsSchema.parse(request.params);
      const input = saveMealPlanInputSchema.parse(request.body);
      const data = await options.meals.save(
        params.kitchenId,
        principal.userId,
        params.date,
        params.mealType,
        input,
      );
      return { data, meta: { requestId: request.id } };
    },
  );

  app.post(
    "/v1/kitchens/:kitchenId/meal-plans/:date/:mealType/complete",
    async (request) => {
      const principal = await options.auth.authenticate(
        request.headers.authorization,
      );
      const params = mealSlotParamsSchema.parse(request.params);
      const input = completeMealPlanInputSchema.parse(request.body);
      const data = await options.meals.complete(
        params.kitchenId,
        principal.userId,
        params.date,
        params.mealType,
        input.version,
      );
      return { data, meta: { requestId: request.id } };
    },
  );

  app.get("/v1/kitchens/:kitchenId/procurement/:date", async (request) => {
    const principal = await options.auth.authenticate(
      request.headers.authorization,
    );
    const params = procurementParamsSchema.parse(request.params);
    const data = await options.meals.getProcurement(
      params.kitchenId,
      principal.userId,
      params.date,
    );
    return { data, meta: { requestId: request.id } };
  });

  app.patch(
    "/v1/kitchens/:kitchenId/procurement/:date/items/:itemId",
    async (request) => {
      const principal = await options.auth.authenticate(
        request.headers.authorization,
      );
      const params = procurementItemParamsSchema.parse(request.params);
      const input = updateProcurementItemInputSchema.parse(request.body);
      const data = await options.meals.setProcurementNeeded(
        params.kitchenId,
        principal.userId,
        params.date,
        params.itemId,
        input.needed,
      );
      return { data, meta: { requestId: request.id } };
    },
  );
}
