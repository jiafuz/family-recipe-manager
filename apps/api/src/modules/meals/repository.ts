import type {
  MealPlanDetail,
  MealType,
  ProcurementList,
  SaveMealPlanInput,
  SaveMealPlanResponse,
} from "@jiayan/contracts";

export type SaveMealPlanResult =
  | { status: "saved"; data: SaveMealPlanResponse }
  | { status: "version_conflict"; currentVersion: number }
  | { status: "completed" }
  | { status: "invalid_recipe" };

export type CompleteMealPlanResult =
  | { status: "completed"; mealPlan: MealPlanDetail }
  | { status: "not_found" }
  | { status: "already_completed"; mealPlan: MealPlanDetail }
  | { status: "version_conflict"; currentVersion: number };

export interface MealPlanRepository {
  listMealPlans(
    kitchenId: string,
    from: string,
    to: string,
  ): Promise<MealPlanDetail[]>;
  findMealPlan(
    kitchenId: string,
    date: string,
    mealType: MealType,
  ): Promise<MealPlanDetail | null>;
  findMealPlanById(mealPlanId: string): Promise<MealPlanDetail | null>;
  saveMealPlan(input: {
    kitchenId: string;
    actorUserId: string;
    date: string;
    mealType: MealType;
    data: SaveMealPlanInput;
    mealPlanId: string;
    revisionId: string;
    newItemIds: string[];
  }): Promise<SaveMealPlanResult>;
  completeMealPlan(input: {
    kitchenId: string;
    actorUserId: string;
    date: string;
    mealType: MealType;
    version: number;
    revisionId: string;
  }): Promise<CompleteMealPlanResult>;
  getProcurementList(kitchenId: string, date: string): Promise<ProcurementList>;
  updateProcurementItem(input: {
    kitchenId: string;
    date: string;
    itemId: string;
    needed: boolean;
  }): Promise<ProcurementList | null>;
}
