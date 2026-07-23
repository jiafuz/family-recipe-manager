import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  RecipeCategory,
  RecipeOrderingState,
  SaveFamilyRecipeInput,
  UpdateFamilyRecipeInput,
} from "@jiayan/contracts";

export interface RecipeListFilters {
  orderingState?: RecipeOrderingState;
  category?: RecipeCategory;
  search?: string;
}

export interface PreparedRecipeEntities {
  recipeId: string;
  versionId: string;
  ingredientIds: string[];
  stepIds: string[];
}

export type UpdateRecipeResult =
  | { status: "updated"; recipe: FamilyRecipeDetail }
  | { status: "not_found" }
  | { status: "version_conflict"; currentVersion: number };

export interface RecipeRepository {
  listFamilyRecipes(
    kitchenId: string,
    filters: RecipeListFilters,
  ): Promise<FamilyRecipeListItem[]>;
  findFamilyRecipe(
    recipeId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null>;
  findFamilyRecipeVersion(
    recipeId: string,
    recipeVersionId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null>;
  createFamilyRecipe(input: {
    kitchenId: string;
    actorUserId: string;
    data: SaveFamilyRecipeInput;
    entities: PreparedRecipeEntities;
  }): Promise<FamilyRecipeDetail>;
  updateFamilyRecipe(input: {
    recipeId: string;
    kitchenId: string;
    actorUserId: string;
    data: UpdateFamilyRecipeInput;
    entities: Omit<PreparedRecipeEntities, "recipeId">;
  }): Promise<UpdateRecipeResult>;
  updateOrderingState(input: {
    recipeId: string;
    kitchenId: string;
    actorUserId: string;
    orderingState: RecipeOrderingState;
  }): Promise<FamilyRecipeDetail | null>;
  archiveFamilyRecipe(recipeId: string, kitchenId: string): Promise<boolean>;
}
