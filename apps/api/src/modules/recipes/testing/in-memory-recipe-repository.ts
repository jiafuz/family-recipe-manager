import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  RecipeIngredient,
  RecipeStep,
} from "@jiayan/contracts";

import type {
  RecipeListFilters,
  RecipeRepository,
  UpdateRecipeResult,
} from "../repository";

interface StoredRecipe {
  kitchenId: string;
  detail: FamilyRecipeDetail;
  versions: Map<string, FamilyRecipeDetail>;
  archived: boolean;
}

export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly records = new Map<string, StoredRecipe>();

  async listFamilyRecipes(
    kitchenId: string,
    filters: RecipeListFilters,
  ): Promise<FamilyRecipeListItem[]> {
    const search = filters.search?.trim().toLocaleLowerCase("zh-CN");

    return [...this.records.values()]
      .filter((record) => record.kitchenId === kitchenId && !record.archived)
      .map((record) => record.detail)
      .filter(
        (recipe) =>
          (!filters.orderingState ||
            recipe.orderingState === filters.orderingState) &&
          (!filters.category || recipe.category === filters.category) &&
          (!search ||
            recipe.name.toLocaleLowerCase("zh-CN").includes(search) ||
            recipe.description?.toLocaleLowerCase("zh-CN").includes(search) ||
            recipe.ingredients.some((ingredient) =>
              ingredient.name.toLocaleLowerCase("zh-CN").includes(search),
            )),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toListItem);
  }

  async findFamilyRecipe(
    recipeId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null> {
    const record = this.records.get(recipeId);
    return record && record.kitchenId === kitchenId && !record.archived
      ? structuredClone(record.detail)
      : null;
  }

  async findFamilyRecipeVersion(
    recipeId: string,
    recipeVersionId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null> {
    const record = this.records.get(recipeId);
    const version = record?.versions.get(recipeVersionId);
    return record && record.kitchenId === kitchenId && version
      ? structuredClone(version)
      : null;
  }

  async createFamilyRecipe(
    input: Parameters<RecipeRepository["createFamilyRecipe"]>[0],
  ): Promise<FamilyRecipeDetail> {
    const now = new Date().toISOString();
    const ingredients: RecipeIngredient[] = input.data.ingredients.map(
      (ingredient, index) => ({
        id: input.entities.ingredientIds[index]!,
        ...ingredient,
        sortOrder: index,
      }),
    );
    const steps: RecipeStep[] = input.data.steps.map((step, index) => ({
      id: input.entities.stepIds[index]!,
      ...step,
      stepNumber: index + 1,
    }));
    const detail: FamilyRecipeDetail = {
      id: input.entities.recipeId,
      currentVersionId: input.entities.versionId,
      version: 1,
      name: input.data.name,
      description: input.data.description,
      category: input.data.category,
      coverEmoji: input.data.coverEmoji,
      cookMinutes: input.data.cookMinutes,
      tips: input.data.tips,
      orderingState: input.data.orderingState,
      ingredientCount: ingredients.length,
      ingredients,
      steps,
      updatedAt: now,
    };

    this.records.set(detail.id, {
      kitchenId: input.kitchenId,
      detail,
      versions: new Map([[detail.currentVersionId, structuredClone(detail)]]),
      archived: false,
    });
    return structuredClone(detail);
  }

  async updateFamilyRecipe(
    input: Parameters<RecipeRepository["updateFamilyRecipe"]>[0],
  ): Promise<UpdateRecipeResult> {
    const record = this.records.get(input.recipeId);
    if (!record || record.kitchenId !== input.kitchenId || record.archived) {
      return { status: "not_found" };
    }
    if (record.detail.version !== input.data.expectedVersion) {
      return {
        status: "version_conflict",
        currentVersion: record.detail.version,
      };
    }

    const ingredients: RecipeIngredient[] = input.data.ingredients.map(
      (ingredient, index) => ({
        id: input.entities.ingredientIds[index]!,
        ...ingredient,
        sortOrder: index,
      }),
    );
    const steps: RecipeStep[] = input.data.steps.map((step, index) => ({
      id: input.entities.stepIds[index]!,
      ...step,
      stepNumber: index + 1,
    }));
    record.detail = {
      ...record.detail,
      currentVersionId: input.entities.versionId,
      version: record.detail.version + 1,
      name: input.data.name,
      description: input.data.description,
      category: input.data.category,
      coverEmoji: input.data.coverEmoji,
      cookMinutes: input.data.cookMinutes,
      tips: input.data.tips,
      orderingState: input.data.orderingState,
      ingredientCount: ingredients.length,
      ingredients,
      steps,
      updatedAt: new Date().toISOString(),
    };
    record.versions.set(
      record.detail.currentVersionId,
      structuredClone(record.detail),
    );

    return { status: "updated", recipe: structuredClone(record.detail) };
  }

  async updateOrderingState(
    input: Parameters<RecipeRepository["updateOrderingState"]>[0],
  ): Promise<FamilyRecipeDetail | null> {
    const record = this.records.get(input.recipeId);
    if (!record || record.kitchenId !== input.kitchenId || record.archived) {
      return null;
    }
    record.detail.orderingState = input.orderingState;
    record.detail.updatedAt = new Date().toISOString();
    return structuredClone(record.detail);
  }

  async archiveFamilyRecipe(
    recipeId: string,
    kitchenId: string,
  ): Promise<boolean> {
    const record = this.records.get(recipeId);
    if (!record || record.kitchenId !== kitchenId || record.archived) {
      return false;
    }
    record.archived = true;
    return true;
  }
}

function toListItem(detail: FamilyRecipeDetail): FamilyRecipeListItem {
  const {
    ingredients: _ingredients,
    steps: _steps,
    tips: _tips,
    ...item
  } = detail;
  return structuredClone(item);
}
