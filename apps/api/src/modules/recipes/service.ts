import type {
  ClonePublicRecipeInput,
  ClonePublicRecipeResponse,
  CompleteRecipeImportInput,
  CreateRecipeImportInput,
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  MealPlanDetail,
  PublicRecipeDetail,
  PublicRecipeListItem,
  RecommendationItem,
  RecommendationPreferences,
  RefreshRecommendationInput,
  RecipeImport,
  TodayRecommendation,
  SaveFamilyRecipeInput,
  UpdateFamilyRecipeInput,
  UpdateRecipeOrderingStateInput,
} from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { KitchenService } from "../accounts/kitchen-service";
import type { MealPlanRepository } from "../meals/repository";
import {
  detectRecipeImportPlatform,
  type RecipeImportSourceClient,
} from "./import-source-client";
import type {
  PublicRecipeListFilters,
  RecipeListFilters,
  RecipeRepository,
} from "./repository";

export class RecipeService {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly kitchens: KitchenService,
    private readonly importSources: RecipeImportSourceClient,
    private readonly meals: MealPlanRepository,
  ) {}

  async getTodayRecommendation(
    kitchenId: string,
    userId: string,
    excludedRecipeIds: string[] = [],
  ): Promise<TodayRecommendation> {
    await this.kitchens.getDetail(kitchenId, userId);
    const preferences = await this.recipes.getRecommendationPreferences(
      userId,
      kitchenId,
    );
    const [familyRecipes, publicRecipes, recentMeals] = await Promise.all([
      this.recipes.listFamilyRecipes(kitchenId, {
        orderingState: "available",
      }),
      preferences.sourceScope === "family_only"
        ? Promise.resolve([])
        : this.recipes.listPublicRecipes({}),
      this.meals.listMealPlans(kitchenId, daysAgo(365), today()),
    ]);
    const candidates = buildRecommendationCandidates(
      familyRecipes,
      publicRecipes,
      preferences,
    );
    const excluded = new Set(excludedRecipeIds);
    const ranked = rankRecommendationCandidates(
      candidates,
      preferences,
      recentMeals,
    );
    const fresh = ranked.filter((candidate) => !excluded.has(candidate.id));
    const fallback = ranked.filter((candidate) => excluded.has(candidate.id));
    const selected = [...fresh, ...fallback].slice(0, preferences.itemCount);

    return {
      preferences,
      items: selected.map((candidate) => ({
        id: candidate.id,
        currentVersionId: candidate.currentVersionId,
        name: candidate.name,
        description: candidate.description,
        category: candidate.category,
        coverEmoji: candidate.coverEmoji,
        cookMinutes: candidate.cookMinutes,
        ingredientCount: candidate.ingredientCount,
        source: candidate.source,
        reason: recommendationReason(candidate, preferences, recentMeals),
      })),
      shortageMessage:
        ranked.length < preferences.itemCount
          ? preferences.sourceScope === "family_only"
            ? `我家目前只有 ${ranked.length} 道可点菜谱，可在偏好中扩大推荐范围。`
            : `当前范围内只有 ${ranked.length} 道可推荐菜谱。`
          : null,
    };
  }

  refreshTodayRecommendation(
    kitchenId: string,
    userId: string,
    input: RefreshRecommendationInput,
  ): Promise<TodayRecommendation> {
    return this.getTodayRecommendation(
      kitchenId,
      userId,
      input.excludeRecipeIds,
    );
  }

  async saveRecommendationPreferences(
    kitchenId: string,
    userId: string,
    preferences: RecommendationPreferences,
  ): Promise<TodayRecommendation> {
    await this.kitchens.getDetail(kitchenId, userId);
    await this.recipes.saveRecommendationPreferences(
      userId,
      kitchenId,
      preferences,
    );
    return this.getTodayRecommendation(kitchenId, userId);
  }

  async createImport(
    userId: string,
    input: CreateRecipeImportInput,
  ): Promise<RecipeImport> {
    await this.kitchens.getDetail(input.kitchenId, userId);
    const platform = detectRecipeImportPlatform(input.url);
    if (!platform) {
      throw new AppError({
        statusCode: 400,
        code: "RECIPE_IMPORT_SOURCE_UNSUPPORTED",
        message: "目前仅支持小红书和下厨房的 HTTPS 链接",
      });
    }

    let extracted;
    try {
      extracted = await this.importSources.extract(input.url, platform);
    } catch (error) {
      throw new AppError({
        statusCode: 422,
        code: "RECIPE_IMPORT_FETCH_FAILED",
        message: "暂时无法读取这个链接，请确认链接可公开访问后重试",
        details: {
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
    }

    return this.recipes.createRecipeImport({
      id: ulid(),
      kitchenId: input.kitchenId,
      actorUserId: userId,
      sourceUrl: extracted.sourceUrl,
      platform,
      draft: extracted.draft,
      warnings: extracted.warnings,
    });
  }

  async getImport(
    importId: string,
    kitchenId: string,
    userId: string,
  ): Promise<RecipeImport> {
    await this.kitchens.getDetail(kitchenId, userId);
    const recipeImport = await this.recipes.findRecipeImport(
      importId,
      kitchenId,
    );
    if (!recipeImport) throw this.importNotFound();
    return recipeImport;
  }

  async completeImport(
    importId: string,
    userId: string,
    input: CompleteRecipeImportInput,
  ): Promise<RecipeImport> {
    await this.kitchens.getDetail(input.kitchenId, userId);
    const recipe = await this.recipes.findFamilyRecipe(
      input.recipeId,
      input.kitchenId,
    );
    if (!recipe) throw this.notFound();
    const recipeImport = await this.recipes.completeRecipeImport({
      importId,
      kitchenId: input.kitchenId,
      recipeId: input.recipeId,
    });
    if (!recipeImport) throw this.importNotFound();
    return recipeImport;
  }

  listPublic(
    filters: PublicRecipeListFilters,
  ): Promise<PublicRecipeListItem[]> {
    return this.recipes.listPublicRecipes(filters);
  }

  async getPublic(recipeId: string): Promise<PublicRecipeDetail> {
    const recipe = await this.recipes.findPublicRecipe(recipeId);
    if (!recipe) throw this.notFound();
    return recipe;
  }

  async clonePublic(
    recipeId: string,
    userId: string,
    input: ClonePublicRecipeInput,
  ): Promise<ClonePublicRecipeResponse> {
    await this.kitchens.getDetail(input.kitchenId, userId);
    const source = await this.recipes.findPublicRecipe(recipeId);
    if (!source) throw this.notFound();
    const result = await this.recipes.clonePublicRecipe({
      publicRecipeId: recipeId,
      kitchenId: input.kitchenId,
      actorUserId: userId,
      orderingState: input.orderingState,
      entities: {
        recipeId: ulid(),
        versionId: ulid(),
        ingredientIds: source.ingredients.map(() => ulid()),
        stepIds: source.steps.map(() => ulid()),
      },
    });
    if (result.status === "not_found") throw this.notFound();
    return {
      recipe: result.recipe,
      created: result.status === "created",
    };
  }

  async list(
    kitchenId: string,
    userId: string,
    filters: RecipeListFilters,
  ): Promise<FamilyRecipeListItem[]> {
    await this.kitchens.getDetail(kitchenId, userId);
    return this.recipes.listFamilyRecipes(kitchenId, filters);
  }

  async get(
    recipeId: string,
    kitchenId: string,
    userId: string,
  ): Promise<FamilyRecipeDetail> {
    await this.kitchens.getDetail(kitchenId, userId);
    const recipe = await this.recipes.findFamilyRecipe(recipeId, kitchenId);
    if (!recipe) throw this.notFound();
    return recipe;
  }

  async create(
    kitchenId: string,
    userId: string,
    data: SaveFamilyRecipeInput,
  ): Promise<FamilyRecipeDetail> {
    await this.kitchens.getDetail(kitchenId, userId);
    return this.recipes.createFamilyRecipe({
      kitchenId,
      actorUserId: userId,
      data,
      entities: this.createEntities(data),
    });
  }

  async update(
    recipeId: string,
    kitchenId: string,
    userId: string,
    data: UpdateFamilyRecipeInput,
  ): Promise<FamilyRecipeDetail> {
    await this.kitchens.getDetail(kitchenId, userId);
    const entities = this.createEntities(data);
    const result = await this.recipes.updateFamilyRecipe({
      recipeId,
      kitchenId,
      actorUserId: userId,
      data,
      entities: {
        versionId: entities.versionId,
        ingredientIds: entities.ingredientIds,
        stepIds: entities.stepIds,
      },
    });

    if (result.status === "not_found") throw this.notFound();
    if (result.status === "version_conflict") {
      throw new AppError({
        statusCode: 409,
        code: "RECIPE_VERSION_CONFLICT",
        message: "菜谱已被其他家庭成员更新，请刷新后再编辑",
        details: { currentVersion: result.currentVersion },
      });
    }
    return result.recipe;
  }

  async setOrderingState(
    recipeId: string,
    kitchenId: string,
    userId: string,
    input: UpdateRecipeOrderingStateInput,
  ): Promise<FamilyRecipeDetail> {
    await this.kitchens.getDetail(kitchenId, userId);
    const recipe = await this.recipes.updateOrderingState({
      recipeId,
      kitchenId,
      actorUserId: userId,
      orderingState: input.orderingState,
    });
    if (!recipe) throw this.notFound();
    return recipe;
  }

  async archive(
    recipeId: string,
    kitchenId: string,
    userId: string,
  ): Promise<void> {
    await this.kitchens.getDetail(kitchenId, userId);
    if (!(await this.recipes.archiveFamilyRecipe(recipeId, kitchenId))) {
      throw this.notFound();
    }
  }

  private createEntities(data: SaveFamilyRecipeInput): {
    recipeId: string;
    versionId: string;
    ingredientIds: string[];
    stepIds: string[];
  } {
    return {
      recipeId: ulid(),
      versionId: ulid(),
      ingredientIds: data.ingredients.map(() => ulid()),
      stepIds: data.steps.map(() => ulid()),
    };
  }

  private notFound(): AppError {
    return new AppError({
      statusCode: 404,
      code: "RECIPE_NOT_FOUND",
      message: "没有找到这份家庭菜谱",
    });
  }

  private importNotFound(): AppError {
    return new AppError({
      statusCode: 404,
      code: "RECIPE_IMPORT_NOT_FOUND",
      message: "没有找到这份链接导入草稿",
    });
  }
}

type RecommendationCandidate = RecommendationItem & { updatedAt: string };

function buildRecommendationCandidates(
  familyRecipes: FamilyRecipeListItem[],
  publicRecipes: PublicRecipeListItem[],
  preferences: RecommendationPreferences,
): RecommendationCandidate[] {
  const family = familyRecipes.map((recipe) => ({
    ...recipe,
    source: "family" as const,
    reason: "",
  }));
  const publicCandidates = publicRecipes.map((recipe) => ({
    id: recipe.id,
    currentVersionId: recipe.currentVersionId,
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    coverEmoji: recipe.coverEmoji,
    cookMinutes: recipe.cookMinutes,
    ingredientCount: recipe.ingredientCount,
    updatedAt: recipe.updatedAt,
    source: "public" as const,
    reason: "",
  }));

  if (preferences.sourceScope === "family_only") return family;
  if (preferences.sourceScope === "public_only") return publicCandidates;
  const familyNames = new Set(family.map((recipe) => recipe.name));
  return [
    ...family,
    ...publicCandidates.filter((recipe) => !familyNames.has(recipe.name)),
  ];
}

function rankRecommendationCandidates(
  candidates: RecommendationCandidate[],
  preferences: RecommendationPreferences,
  recentMeals: MealPlanDetail[],
): RecommendationCandidate[] {
  const lastEaten = new Map<string, string>();
  const categoryFrequency = new Map<string, number>();
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  for (const meal of recentMeals) {
    for (const item of meal.items) {
      const previous = lastEaten.get(item.recipeId);
      if (!previous || previous < meal.mealDate) {
        lastEaten.set(item.recipeId, meal.mealDate);
      }
      const category = candidateById.get(item.recipeId)?.category;
      if (category) {
        categoryFrequency.set(
          category,
          (categoryFrequency.get(category) ?? 0) + item.quantity,
        );
      }
    }
  }

  return [...candidates].sort((left, right) => {
    let difference = 0;
    if (preferences.strategy === "long_time_no_eat") {
      difference = (lastEaten.get(left.id) ?? "").localeCompare(
        lastEaten.get(right.id) ?? "",
      );
    } else if (preferences.strategy === "balanced") {
      difference =
        (categoryFrequency.get(left.category) ?? 0) -
        (categoryFrequency.get(right.category) ?? 0);
    } else if (preferences.strategy === "light") {
      difference =
        lightCategoryScore(left.category) - lightCategoryScore(right.category);
    } else if (preferences.strategy === "spicy") {
      difference = Number(!isSpicy(left)) - Number(!isSpicy(right));
    } else if (preferences.strategy === "quick") {
      difference = (left.cookMinutes ?? 10_000) - (right.cookMinutes ?? 10_000);
    }
    return (
      difference ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.name.localeCompare(right.name, "zh-CN")
    );
  });
}

function recommendationReason(
  candidate: RecommendationCandidate,
  preferences: RecommendationPreferences,
  recentMeals: MealPlanDetail[],
): string {
  let reason: string;
  if (preferences.strategy === "long_time_no_eat") {
    const meals = recentMeals.filter((meal) =>
      meal.items.some((item) => item.recipeId === candidate.id),
    );
    const lastDate = meals
      .map((meal) => meal.mealDate)
      .sort()
      .at(-1);
    reason = lastDate
      ? `上次吃是 ${lastDate.slice(5).replace("-", "月")}日`
      : "最近一年还没点过";
  } else if (preferences.strategy === "balanced") {
    reason = `补充近期较少的${categoryLabel(candidate.category)}`;
  } else if (preferences.strategy === "light") {
    reason = "清爽少负担，适合日常搭配";
  } else if (preferences.strategy === "spicy") {
    reason = isSpicy(candidate) ? "香辣过瘾，换换口味" : "搭配一份下饭家常菜";
  } else {
    reason = candidate.cookMinutes
      ? `${candidate.cookMinutes} 分钟左右可以完成`
      : "步骤相对简单，适合忙碌的一天";
  }
  return candidate.source === "public" ? `来自菜谱广场 · ${reason}` : reason;
}

function isSpicy(candidate: RecommendationCandidate): boolean {
  return /辣|椒|香锅|水煮|麻婆/.test(
    `${candidate.name}${candidate.description ?? ""}`,
  );
}

function lightCategoryScore(
  category: RecommendationCandidate["category"],
): number {
  return {
    vegetable: 0,
    fish: 1,
    soup: 2,
    egg: 3,
    staple: 4,
    meat: 5,
    other: 6,
  }[category];
}

function categoryLabel(category: RecommendationCandidate["category"]): string {
  return {
    vegetable: "蔬菜",
    meat: "肉禽",
    fish: "水产",
    soup: "汤羹",
    egg: "蛋奶",
    staple: "主食",
    other: "家常菜",
  }[category];
}

function today(): string {
  return formatChinaDate(new Date());
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return formatChinaDate(date);
}

function formatChinaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
