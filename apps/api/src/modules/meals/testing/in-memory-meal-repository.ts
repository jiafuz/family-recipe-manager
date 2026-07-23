import type {
  MealPlanDetail,
  MealPlanItem,
  ProcurementItemResponse,
  ProcurementList,
} from "@jiayan/contracts";
import { deriveProcurementItems, type IngredientSource } from "@jiayan/domain";

import type { RecipeRepository } from "../../recipes/repository";
import type { MealPlanRepository, SaveMealPlanResult } from "../repository";

interface StoredProcurement {
  revision: number;
  items: ProcurementItemResponse[];
}

export class InMemoryMealPlanRepository implements MealPlanRepository {
  private readonly plans = new Map<string, MealPlanDetail>();
  private readonly procurement = new Map<string, StoredProcurement>();
  private sequence = 0;

  constructor(private readonly recipes: RecipeRepository) {}

  async listMealPlans(
    kitchenId: string,
    from: string,
    to: string,
  ): Promise<MealPlanDetail[]> {
    return [...this.plans.values()]
      .filter(
        (plan) =>
          plan.kitchenId === kitchenId &&
          plan.mealDate >= from &&
          plan.mealDate <= to,
      )
      .sort((left, right) =>
        `${left.mealDate}-${left.mealType}`.localeCompare(
          `${right.mealDate}-${right.mealType}`,
        ),
      )
      .map((plan) => structuredClone(plan));
  }

  async findMealPlan(
    kitchenId: string,
    date: string,
    mealType: "breakfast" | "lunch" | "dinner",
  ): Promise<MealPlanDetail | null> {
    const plan = this.plans.get(this.planKey(kitchenId, date, mealType));
    return plan ? structuredClone(plan) : null;
  }

  async findMealPlanById(mealPlanId: string): Promise<MealPlanDetail | null> {
    const plan = [...this.plans.values()].find(
      (item) => item.id === mealPlanId,
    );
    return plan ? structuredClone(plan) : null;
  }

  async saveMealPlan(
    input: Parameters<MealPlanRepository["saveMealPlan"]>[0],
  ): Promise<SaveMealPlanResult> {
    const key = this.planKey(input.kitchenId, input.date, input.mealType);
    const existing = this.plans.get(key);
    if (existing?.status === "completed") return { status: "completed" };
    const currentVersion = existing?.version ?? 0;
    if (currentVersion !== input.data.version) {
      return { status: "version_conflict", currentVersion };
    }

    const oldItems = new Map(existing?.items.map((item) => [item.id, item]));
    const recipeDetails = await Promise.all(
      input.data.items.map(async (item) => {
        const retained = item.itemId ? oldItems.get(item.itemId) : undefined;
        if (
          retained?.recipeId === item.recipeId &&
          retained.recipeVersionId === item.recipeVersionId
        ) {
          return this.recipes.findFamilyRecipeVersion(
            item.recipeId,
            item.recipeVersionId,
            input.kitchenId,
          );
        }
        const recipe = await this.recipes.findFamilyRecipe(
          item.recipeId,
          input.kitchenId,
        );
        return recipe?.currentVersionId === item.recipeVersionId &&
          recipe.orderingState === "available"
          ? recipe
          : null;
      }),
    );
    if (recipeDetails.some((recipe) => !recipe)) {
      return { status: "invalid_recipe" };
    }

    const now = new Date().toISOString();
    const items: MealPlanItem[] = input.data.items.map((item, index) => {
      const retained = item.itemId ? oldItems.get(item.itemId) : undefined;
      const recipe = recipeDetails[index]!;
      return {
        id: retained?.id ?? input.newItemIds[index]!,
        recipeId: item.recipeId,
        recipeVersionId: item.recipeVersionId,
        recipeName: recipe.name,
        coverEmoji: recipe.coverEmoji,
        quantity: item.quantity,
        tasteNote: item.tasteNote,
        orderedBy: retained?.orderedBy ?? {
          id: input.actorUserId,
          displayName: "家庭成员",
          avatarUrl: null,
        },
        orderedAt: retained?.orderedAt ?? now,
      };
    });
    const mealPlan: MealPlanDetail = {
      id: existing?.id ?? input.mealPlanId,
      kitchenId: input.kitchenId,
      mealDate: input.date,
      mealType: input.mealType,
      mealNote: input.data.mealNote,
      status: "planned",
      version: currentVersion + 1,
      items,
      updatedAt: now,
    };
    this.plans.set(key, mealPlan);
    const procurementRevision = await this.recalculateProcurement(
      input.kitchenId,
      input.date,
    );
    return {
      status: "saved",
      data: { mealPlan: structuredClone(mealPlan), procurementRevision },
    };
  }

  async getProcurementList(
    kitchenId: string,
    date: string,
  ): Promise<ProcurementList> {
    const stored = this.procurement.get(this.procurementKey(kitchenId, date));
    return {
      kitchenId,
      date,
      revision: stored?.revision ?? 0,
      items: structuredClone(stored?.items ?? []),
    };
  }

  async completeMealPlan(
    input: Parameters<MealPlanRepository["completeMealPlan"]>[0],
  ): Promise<Awaited<ReturnType<MealPlanRepository["completeMealPlan"]>>> {
    const key = this.planKey(input.kitchenId, input.date, input.mealType);
    const plan = this.plans.get(key);
    if (!plan) return { status: "not_found" };
    if (plan.status === "completed") {
      return { status: "already_completed", mealPlan: structuredClone(plan) };
    }
    if (plan.version !== input.version) {
      return { status: "version_conflict", currentVersion: plan.version };
    }
    plan.status = "completed";
    plan.version += 1;
    plan.updatedAt = new Date().toISOString();
    return { status: "completed", mealPlan: structuredClone(plan) };
  }

  async updateProcurementItem(
    input: Parameters<MealPlanRepository["updateProcurementItem"]>[0],
  ): Promise<ProcurementList | null> {
    const key = this.procurementKey(input.kitchenId, input.date);
    const stored = this.procurement.get(key);
    const item = stored?.items.find((entry) => entry.id === input.itemId);
    if (!stored || !item) return null;
    item.needed = input.needed;
    return this.getProcurementList(input.kitchenId, input.date);
  }

  private async recalculateProcurement(
    kitchenId: string,
    date: string,
  ): Promise<number> {
    const key = this.procurementKey(kitchenId, date);
    const previous = this.procurement.get(key);
    const selections = new Map(
      previous?.items.map((item) => [item.ingredientKey, item.needed]) ?? [],
    );
    const sources: IngredientSource[] = [];

    for (const plan of this.plans.values()) {
      if (plan.kitchenId !== kitchenId || plan.mealDate !== date) continue;
      for (const item of plan.items) {
        const recipe = await this.recipes.findFamilyRecipeVersion(
          item.recipeId,
          item.recipeVersionId,
          kitchenId,
        );
        if (!recipe) continue;
        for (const ingredient of recipe.ingredients) {
          sources.push({
            mealPlanId: plan.id,
            mealItemId: item.id,
            recipeIngredientId: ingredient.id,
            mealType: plan.mealType,
            recipeName: item.recipeName,
            ingredientName: ingredient.name,
            category: ingredient.category,
            quantity:
              ingredient.quantity === null
                ? null
                : ingredient.quantity * item.quantity,
            unit: ingredient.unit,
          });
        }
      }
    }

    const items: ProcurementItemResponse[] = deriveProcurementItems(
      sources,
      selections,
    ).map((item) => ({
      id: this.nextId("procurement"),
      ingredientKey: item.ingredientKey,
      displayName: item.displayName,
      category: item.category,
      totalQuantity: item.totalQuantity,
      unit: item.unit,
      needed: item.needed,
      sources: item.sources.map((source) => ({
        mealPlanId: source.mealPlanId!,
        mealItemId: source.mealItemId,
        mealType: source.mealType,
        recipeName: source.recipeName,
        ingredientName: source.ingredientName,
        quantity: source.quantity,
        unit: source.unit,
      })),
    }));
    const revision = (previous?.revision ?? 0) + 1;
    this.procurement.set(key, { revision, items });
    return revision;
  }

  private planKey(kitchenId: string, date: string, mealType: string): string {
    return `${kitchenId}:${date}:${mealType}`;
  }

  private procurementKey(kitchenId: string, date: string): string {
    return `${kitchenId}:${date}`;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString().padStart(8, "0")}`;
  }
}
