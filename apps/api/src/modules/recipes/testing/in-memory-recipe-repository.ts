import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  PublicRecipeDetail,
  PublicRecipeListItem,
  RecipeImport,
  RecommendationPreferences,
  RecipeIngredient,
  RecipeStep,
} from "@jiayan/contracts";

import type {
  ClonePublicRecipeResult,
  PublicRecipeListFilters,
  RecipeListFilters,
  RecipeRepository,
  UpdateRecipeResult,
} from "../repository";
import { publicRecipeCatalog } from "../public-catalog";

interface StoredRecipe {
  kitchenId: string;
  sourceRecipeId: string | null;
  detail: FamilyRecipeDetail;
  versions: Map<string, FamilyRecipeDetail>;
  archived: boolean;
}

export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly records = new Map<string, StoredRecipe>();
  private readonly imports = new Map<string, RecipeImport>();
  private readonly recommendationPreferences = new Map<
    string,
    RecommendationPreferences
  >();
  private readonly publicRecords = new Map(
    publicRecipeCatalog.map((recipe) => [recipe.id, structuredClone(recipe)]),
  );

  async getRecommendationPreferences(
    userId: string,
    kitchenId: string,
  ): Promise<RecommendationPreferences> {
    return structuredClone(
      this.recommendationPreferences.get(`${userId}:${kitchenId}`) ?? {
        strategy: "long_time_no_eat",
        sourceScope: "family_only",
        itemCount: 3,
        collapsed: false,
      },
    );
  }

  async saveRecommendationPreferences(
    userId: string,
    kitchenId: string,
    preferences: RecommendationPreferences,
  ): Promise<RecommendationPreferences> {
    this.recommendationPreferences.set(
      `${userId}:${kitchenId}`,
      structuredClone(preferences),
    );
    return structuredClone(preferences);
  }

  async createRecipeImport(
    input: Parameters<RecipeRepository["createRecipeImport"]>[0],
  ): Promise<RecipeImport> {
    const timestamp = new Date().toISOString();
    const recipeImport: RecipeImport = {
      id: input.id,
      kitchenId: input.kitchenId,
      sourceUrl: input.sourceUrl,
      platform: input.platform,
      status: "needs_review",
      draft: structuredClone(input.draft),
      warnings: [...input.warnings],
      savedRecipeId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.imports.set(recipeImport.id, recipeImport);
    return structuredClone(recipeImport);
  }

  async findRecipeImport(
    importId: string,
    kitchenId: string,
  ): Promise<RecipeImport | null> {
    const recipeImport = this.imports.get(importId);
    return recipeImport?.kitchenId === kitchenId
      ? structuredClone(recipeImport)
      : null;
  }

  async completeRecipeImport(
    input: Parameters<RecipeRepository["completeRecipeImport"]>[0],
  ): Promise<RecipeImport | null> {
    const recipeImport = this.imports.get(input.importId);
    if (!recipeImport || recipeImport.kitchenId !== input.kitchenId)
      return null;
    recipeImport.status = "completed";
    recipeImport.savedRecipeId = input.recipeId;
    recipeImport.updatedAt = new Date().toISOString();
    return structuredClone(recipeImport);
  }

  async listPublicRecipes(
    filters: PublicRecipeListFilters,
  ): Promise<PublicRecipeListItem[]> {
    const search = filters.search?.trim().toLocaleLowerCase("zh-CN");
    return [...this.publicRecords.values()]
      .filter(
        (recipe) =>
          (!filters.category || recipe.category === filters.category) &&
          (!search ||
            recipe.name.toLocaleLowerCase("zh-CN").includes(search) ||
            recipe.description?.toLocaleLowerCase("zh-CN").includes(search) ||
            recipe.ingredients.some((ingredient) =>
              ingredient.name.toLocaleLowerCase("zh-CN").includes(search),
            )),
      )
      .map(toPublicListItem);
  }

  async findPublicRecipe(recipeId: string): Promise<PublicRecipeDetail | null> {
    const recipe = this.publicRecords.get(recipeId);
    return recipe ? structuredClone(recipe) : null;
  }

  async clonePublicRecipe(
    input: Parameters<RecipeRepository["clonePublicRecipe"]>[0],
  ): Promise<ClonePublicRecipeResult> {
    const source = this.publicRecords.get(input.publicRecipeId);
    if (!source) return { status: "not_found" };

    const existing = [...this.records.values()].find(
      (record) =>
        record.kitchenId === input.kitchenId &&
        record.sourceRecipeId === input.publicRecipeId &&
        !record.archived,
    );
    if (existing) {
      return {
        status: "already_cloned",
        recipe: structuredClone(existing.detail),
      };
    }

    const recipe = await this.createFamilyRecipe({
      kitchenId: input.kitchenId,
      actorUserId: input.actorUserId,
      entities: input.entities,
      data: {
        name: source.name,
        description: source.description,
        category: source.category,
        coverEmoji: source.coverEmoji,
        cookMinutes: source.cookMinutes,
        tips: source.tips,
        orderingState: input.orderingState,
        ingredients: source.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          category: ingredient.category,
        })),
        steps: source.steps.map((step) => ({
          instruction: step.instruction,
        })),
      },
    });
    const record = this.records.get(recipe.id)!;
    const firstIntroducedUntil = new Date(
      Date.now() + 24 * 60 * 60 * 1_000,
    ).toISOString();
    recipe.firstIntroducedUntil = firstIntroducedUntil;
    record.detail.firstIntroducedUntil = firstIntroducedUntil;
    record.versions.set(
      recipe.currentVersionId,
      structuredClone(record.detail),
    );
    record.sourceRecipeId = input.publicRecipeId;
    return { status: "created", recipe };
  }

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
      firstIntroducedUntil: null,
      ingredientCount: ingredients.length,
      ingredients,
      steps,
      updatedAt: now,
    };

    this.records.set(detail.id, {
      kitchenId: input.kitchenId,
      sourceRecipeId: null,
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

function toPublicListItem(detail: PublicRecipeDetail): PublicRecipeListItem {
  const {
    ingredients: _ingredients,
    steps: _steps,
    tips: _tips,
    ...item
  } = detail;
  return structuredClone(item);
}
