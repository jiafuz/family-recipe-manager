import type {
  MealPlanDetail,
  MealType,
  ProcurementList,
  SaveMealPlanInput,
  SaveMealPlanResponse,
} from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { KitchenService } from "../accounts/kitchen-service";
import type { MealPlanRepository } from "./repository";

export class MealPlanService {
  constructor(
    private readonly meals: MealPlanRepository,
    private readonly kitchens: KitchenService,
  ) {}

  async list(
    kitchenId: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<MealPlanDetail[]> {
    await this.kitchens.getDetail(kitchenId, userId);
    return this.meals.listMealPlans(kitchenId, from, to);
  }

  async get(
    kitchenId: string,
    userId: string,
    date: string,
    mealType: MealType,
  ): Promise<MealPlanDetail | null> {
    await this.kitchens.getDetail(kitchenId, userId);
    return this.meals.findMealPlan(kitchenId, date, mealType);
  }

  async getById(mealPlanId: string, userId: string): Promise<MealPlanDetail> {
    const mealPlan = await this.meals.findMealPlanById(mealPlanId);
    if (!mealPlan) {
      throw new AppError({
        statusCode: 404,
        code: "MEAL_PLAN_EMPTY",
        message: "没有找到这份菜单",
      });
    }
    await this.kitchens.getDetail(mealPlan.kitchenId, userId);
    return mealPlan;
  }

  async save(
    kitchenId: string,
    userId: string,
    date: string,
    mealType: MealType,
    data: SaveMealPlanInput,
  ): Promise<SaveMealPlanResponse> {
    await this.kitchens.getDetail(kitchenId, userId);
    const result = await this.meals.saveMealPlan({
      kitchenId,
      actorUserId: userId,
      date,
      mealType,
      data,
      mealPlanId: ulid(),
      revisionId: ulid(),
      newItemIds: data.items.map(() => ulid()),
    });

    if (result.status === "version_conflict") {
      throw new AppError({
        statusCode: 409,
        code: "MEAL_PLAN_VERSION_CONFLICT",
        message: "这份菜单刚被家人修改，请刷新后再保存",
        details: { currentVersion: result.currentVersion },
      });
    }
    if (result.status === "completed") {
      throw new AppError({
        statusCode: 409,
        code: "MEAL_PLAN_ALREADY_COMPLETED",
        message: "本餐已经完成，不能再修改菜单",
      });
    }
    if (result.status === "invalid_recipe") {
      throw new AppError({
        statusCode: 400,
        code: "RECIPE_NOT_FOUND",
        message: "菜单中包含已删除或无权使用的菜谱",
      });
    }
    return result.data;
  }

  async complete(
    kitchenId: string,
    userId: string,
    date: string,
    mealType: MealType,
    version: number,
  ): Promise<MealPlanDetail> {
    await this.kitchens.getDetail(kitchenId, userId);
    const result = await this.meals.completeMealPlan({
      kitchenId,
      actorUserId: userId,
      date,
      mealType,
      version,
      revisionId: ulid(),
    });
    if (result.status === "not_found") {
      throw new AppError({
        statusCode: 404,
        code: "MEAL_PLAN_EMPTY",
        message: "这份菜单不存在或已经删除",
      });
    }
    if (result.status === "version_conflict") {
      throw new AppError({
        statusCode: 409,
        code: "MEAL_PLAN_VERSION_CONFLICT",
        message: "这份菜单刚被家人修改，请刷新后再完成",
        details: { currentVersion: result.currentVersion },
      });
    }
    return result.mealPlan;
  }

  async getProcurement(
    kitchenId: string,
    userId: string,
    date: string,
  ): Promise<ProcurementList> {
    await this.kitchens.getDetail(kitchenId, userId);
    return this.meals.getProcurementList(kitchenId, date);
  }

  async setProcurementNeeded(
    kitchenId: string,
    userId: string,
    date: string,
    itemId: string,
    needed: boolean,
  ): Promise<ProcurementList> {
    await this.kitchens.getDetail(kitchenId, userId);
    const list = await this.meals.updateProcurementItem({
      kitchenId,
      date,
      itemId,
      needed,
    });
    if (!list) {
      throw new AppError({
        statusCode: 404,
        code: "MEAL_PLAN_EMPTY",
        message: "没有找到这项采购食材",
      });
    }
    return list;
  }
}
