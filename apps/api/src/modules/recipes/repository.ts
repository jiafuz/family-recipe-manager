import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  PublicRecipeDetail,
  PublicRecipeListItem,
  RecipeImport,
  RecipeImportDraft,
  RecipeImportPlatform,
  RecommendationPreferences,
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

export interface PublicRecipeListFilters {
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

export type ClonePublicRecipeResult =
  | { status: "created" | "already_cloned"; recipe: FamilyRecipeDetail }
  | { status: "not_found" };

export interface RecipeRepository {
  getRecommendationPreferences(
    userId: string,
    kitchenId: string,
  ): Promise<RecommendationPreferences>;
  saveRecommendationPreferences(
    userId: string,
    kitchenId: string,
    preferences: RecommendationPreferences,
  ): Promise<RecommendationPreferences>;
  createRecipeImport(input: {
    id: string;
    kitchenId: string;
    actorUserId: string;
    sourceUrl: string;
    platform: RecipeImportPlatform;
    draft: RecipeImportDraft;
    warnings: string[];
  }): Promise<RecipeImport>;
  findRecipeImport(
    importId: string,
    kitchenId: string,
  ): Promise<RecipeImport | null>;
  completeRecipeImport(input: {
    importId: string;
    kitchenId: string;
    recipeId: string;
  }): Promise<RecipeImport | null>;
  listPublicRecipes(
    filters: PublicRecipeListFilters,
  ): Promise<PublicRecipeListItem[]>;
  findPublicRecipe(recipeId: string): Promise<PublicRecipeDetail | null>;
  clonePublicRecipe(input: {
    publicRecipeId: string;
    kitchenId: string;
    actorUserId: string;
    orderingState: "available" | "want_to_learn";
    entities: PreparedRecipeEntities;
  }): Promise<ClonePublicRecipeResult>;
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
