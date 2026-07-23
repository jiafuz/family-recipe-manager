import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  SaveFamilyRecipeInput,
  UpdateFamilyRecipeInput,
  UpdateRecipeOrderingStateInput,
} from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { KitchenService } from "../accounts/kitchen-service";
import type { RecipeListFilters, RecipeRepository } from "./repository";

export class RecipeService {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly kitchens: KitchenService,
  ) {}

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
}
