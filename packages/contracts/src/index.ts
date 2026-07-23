import { z } from "zod";

export const idSchema = z.string().min(8).max(64);

export const localDateSchema = z.iso.date();

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner"]);

export type MealType = z.infer<typeof mealTypeSchema>;

export const mealPlanStatusSchema = z.enum(["planned", "completed"]);

export type MealPlanStatus = z.infer<typeof mealPlanStatusSchema>;

export const kitchenRoleSchema = z.enum(["owner", "member"]);

export type KitchenRole = z.infer<typeof kitchenRoleSchema>;

export const userSummarySchema = z.object({
  id: idSchema,
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().nullable(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;

export const kitchenSummarySchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  icon: z.string().min(1).max(20),
  memberCount: z.number().int().min(1),
  role: kitchenRoleSchema,
});

export type KitchenSummary = z.infer<typeof kitchenSummarySchema>;

export const kitchenMemberSchema = z.object({
  userId: idSchema,
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().nullable(),
  nickname: z.string().max(80).nullable(),
  role: kitchenRoleSchema,
  joinedAt: z.string(),
});

export type KitchenMember = z.infer<typeof kitchenMemberSchema>;

export const kitchenDetailSchema = kitchenSummarySchema.extend({
  members: z.array(kitchenMemberSchema),
});

export type KitchenDetail = z.infer<typeof kitchenDetailSchema>;

export const loginWithWechatInputSchema = z.object({
  code: z.string().trim().min(1).max(256),
});

export type LoginWithWechatInput = z.infer<typeof loginWithWechatInputSchema>;

export const refreshSessionInputSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});

export type RefreshSessionInput = z.infer<typeof refreshSessionInputSchema>;

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  user: userSummarySchema,
  kitchens: z.array(kitchenSummarySchema),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const currentUserResponseSchema = z.object({
  user: userSummarySchema,
  kitchens: z.array(kitchenSummarySchema),
  currentKitchen: kitchenSummarySchema.nullable(),
});

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;

export const createKitchenInputSchema = z.object({
  name: z.string().trim().min(1, "请输入厨房名称").max(20),
  icon: z.string().trim().min(1).max(20).default("🏠"),
});

export type CreateKitchenInput = z.infer<typeof createKitchenInputSchema>;

export const updateKitchenInputSchema = createKitchenInputSchema;

export type UpdateKitchenInput = z.infer<typeof updateKitchenInputSchema>;

export const joinKitchenInputSchema = z.object({
  inviteCode: z.string().regex(/^\d{6}$/, "请输入 6 位邀请码"),
});

export type JoinKitchenInput = z.infer<typeof joinKitchenInputSchema>;

export const createKitchenInviteInputSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(50).default(10),
});

export type CreateKitchenInviteInput = z.infer<
  typeof createKitchenInviteInputSchema
>;

export const kitchenInviteResponseSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.string(),
  maxUses: z.number().int().positive(),
});

export type KitchenInviteResponse = z.infer<typeof kitchenInviteResponseSchema>;

export const kitchenInvitePreviewSchema = z.object({
  kitchenName: z.string().min(1).max(80),
  kitchenIcon: z.string().min(1).max(20),
  memberCount: z.number().int().min(1),
  expiresAt: z.string(),
});

export type KitchenInvitePreview = z.infer<typeof kitchenInvitePreviewSchema>;

export const recipeOrderingStateSchema = z.enum([
  "available",
  "want_to_learn",
  "hidden",
]);

export type RecipeOrderingState = z.infer<typeof recipeOrderingStateSchema>;

export const recipeCategorySchema = z.enum([
  "vegetable",
  "meat",
  "fish",
  "soup",
  "egg",
  "staple",
  "other",
]);

export type RecipeCategory = z.infer<typeof recipeCategorySchema>;

export const recipeIngredientInputSchema = z.object({
  name: z.string().trim().min(1, "请填写食材名称").max(120),
  quantity: z.number().min(0).max(999_999).nullable().default(null),
  unit: z.string().trim().max(30).nullable().default(null),
  category: z.string().trim().min(1).max(40).default("other"),
});

export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;

export const recipeStepInputSchema = z.object({
  instruction: z.string().trim().min(1, "请填写步骤内容").max(2_000),
});

export type RecipeStepInput = z.infer<typeof recipeStepInputSchema>;

export const saveFamilyRecipeInputSchema = z.object({
  name: z.string().trim().min(1, "请填写菜谱名称").max(120),
  description: z.string().trim().max(2_000).nullable().default(null),
  category: recipeCategorySchema,
  coverEmoji: z.string().trim().min(1).max(20).default("🍲"),
  cookMinutes: z.number().int().min(1).max(1_440).nullable().default(null),
  tips: z.string().trim().max(2_000).nullable().default(null),
  orderingState: recipeOrderingStateSchema,
  ingredients: z
    .array(recipeIngredientInputSchema)
    .min(1, "至少填写一种食材")
    .max(100),
  steps: z.array(recipeStepInputSchema).min(1, "至少填写一个步骤").max(100),
});

export type SaveFamilyRecipeInput = z.infer<typeof saveFamilyRecipeInputSchema>;

export const updateFamilyRecipeInputSchema = saveFamilyRecipeInputSchema.extend(
  {
    expectedVersion: z.number().int().min(1),
    changeNote: z.string().trim().max(255).nullable().default(null),
  },
);

export type UpdateFamilyRecipeInput = z.infer<
  typeof updateFamilyRecipeInputSchema
>;

export const updateRecipeOrderingStateInputSchema = z.object({
  orderingState: recipeOrderingStateSchema,
});

export type UpdateRecipeOrderingStateInput = z.infer<
  typeof updateRecipeOrderingStateInputSchema
>;

export const recipeIngredientSchema = recipeIngredientInputSchema.extend({
  id: idSchema,
  sortOrder: z.number().int().min(0),
});

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeStepSchema = recipeStepInputSchema.extend({
  id: idSchema,
  stepNumber: z.number().int().min(1),
});

export type RecipeStep = z.infer<typeof recipeStepSchema>;

export const familyRecipeListItemSchema = z.object({
  id: idSchema,
  currentVersionId: idSchema,
  version: z.number().int().min(1),
  name: z.string(),
  description: z.string().nullable(),
  category: recipeCategorySchema,
  coverEmoji: z.string(),
  cookMinutes: z.number().int().positive().nullable(),
  orderingState: recipeOrderingStateSchema,
  firstIntroducedUntil: z.string().nullable(),
  ingredientCount: z.number().int().min(0),
  updatedAt: z.string(),
});

export type FamilyRecipeListItem = z.infer<typeof familyRecipeListItemSchema>;

export const familyRecipeDetailSchema = familyRecipeListItemSchema.extend({
  tips: z.string().nullable(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema),
});

export type FamilyRecipeDetail = z.infer<typeof familyRecipeDetailSchema>;

export const publicRecipeListItemSchema = familyRecipeListItemSchema
  .omit({ orderingState: true, firstIntroducedUntil: true })
  .extend({
    authorName: z.string().min(1).max(80),
  });

export type PublicRecipeListItem = z.infer<typeof publicRecipeListItemSchema>;

export const publicRecipeDetailSchema = publicRecipeListItemSchema.extend({
  tips: z.string().nullable(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(recipeStepSchema),
});

export type PublicRecipeDetail = z.infer<typeof publicRecipeDetailSchema>;

export const clonePublicRecipeInputSchema = z.object({
  kitchenId: idSchema,
  orderingState: z.enum(["available", "want_to_learn"]),
});

export type ClonePublicRecipeInput = z.infer<
  typeof clonePublicRecipeInputSchema
>;

export const clonePublicRecipeResponseSchema = z.object({
  recipe: familyRecipeDetailSchema,
  created: z.boolean(),
});

export type ClonePublicRecipeResponse = z.infer<
  typeof clonePublicRecipeResponseSchema
>;

export const recipeImportPlatformSchema = z.enum(["xiaohongshu", "xiachufang"]);

export type RecipeImportPlatform = z.infer<typeof recipeImportPlatformSchema>;

export const recipeImportDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable(),
  category: recipeCategorySchema,
  coverEmoji: z.string().trim().min(1).max(20),
  cookMinutes: z.number().int().min(1).max(1_440).nullable(),
  tips: z.string().trim().max(2_000).nullable(),
  ingredients: z.array(recipeIngredientInputSchema).max(100),
  steps: z.array(recipeStepInputSchema).max(100),
});

export type RecipeImportDraft = z.infer<typeof recipeImportDraftSchema>;

export const createRecipeImportInputSchema = z.object({
  kitchenId: idSchema,
  url: z.string().trim().url().max(2_048),
});

export type CreateRecipeImportInput = z.infer<
  typeof createRecipeImportInputSchema
>;

export const recipeImportSchema = z.object({
  id: idSchema,
  kitchenId: idSchema,
  sourceUrl: z.string().url(),
  platform: recipeImportPlatformSchema,
  status: z.enum(["needs_review", "completed"]),
  draft: recipeImportDraftSchema,
  warnings: z.array(z.string()),
  savedRecipeId: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RecipeImport = z.infer<typeof recipeImportSchema>;

export const completeRecipeImportInputSchema = z.object({
  kitchenId: idSchema,
  recipeId: idSchema,
});

export type CompleteRecipeImportInput = z.infer<
  typeof completeRecipeImportInputSchema
>;

export const recommendationStrategySchema = z.enum([
  "long_time_no_eat",
  "balanced",
  "light",
  "spicy",
  "quick",
]);

export type RecommendationStrategy = z.infer<
  typeof recommendationStrategySchema
>;

export const recommendationSourceScopeSchema = z.enum([
  "family_only",
  "mixed",
  "public_only",
]);

export type RecommendationSourceScope = z.infer<
  typeof recommendationSourceScopeSchema
>;

export const recommendationPreferencesSchema = z.object({
  strategy: recommendationStrategySchema,
  sourceScope: recommendationSourceScopeSchema,
  itemCount: z.number().int().min(3).max(6),
  collapsed: z.boolean(),
});

export type RecommendationPreferences = z.infer<
  typeof recommendationPreferencesSchema
>;

export const recommendationItemSchema = z.object({
  id: idSchema,
  currentVersionId: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  category: recipeCategorySchema,
  coverEmoji: z.string(),
  cookMinutes: z.number().int().positive().nullable(),
  ingredientCount: z.number().int().min(0),
  source: z.enum(["family", "public"]),
  reason: z.string().min(1).max(120),
});

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;

export const todayRecommendationSchema = z.object({
  preferences: recommendationPreferencesSchema,
  items: z.array(recommendationItemSchema),
  shortageMessage: z.string().nullable(),
});

export type TodayRecommendation = z.infer<typeof todayRecommendationSchema>;

export const refreshRecommendationInputSchema = z.object({
  excludeRecipeIds: z.array(idSchema).max(12).default([]),
});

export type RefreshRecommendationInput = z.infer<
  typeof refreshRecommendationInputSchema
>;

export const saveMealItemSchema = z.object({
  itemId: idSchema.optional(),
  recipeId: idSchema,
  recipeVersionId: idSchema,
  quantity: z.number().int().min(1).max(20),
  tasteNote: z.string().trim().max(200).nullable().default(null),
});

export const saveMealPlanInputSchema = z.object({
  version: z.number().int().min(0),
  mealNote: z.string().trim().max(500).nullable().default(null),
  items: z.array(saveMealItemSchema).min(1, "至少选择一道菜").max(50),
});

export type SaveMealPlanInput = z.infer<typeof saveMealPlanInputSchema>;

export const mealPlanItemSchema = z.object({
  id: idSchema,
  recipeId: idSchema,
  recipeVersionId: idSchema,
  recipeName: z.string(),
  coverEmoji: z.string(),
  quantity: z.number().int().min(1),
  tasteNote: z.string().nullable(),
  orderedBy: userSummarySchema,
  orderedAt: z.string(),
});

export type MealPlanItem = z.infer<typeof mealPlanItemSchema>;

export const mealPlanDetailSchema = z.object({
  id: idSchema,
  kitchenId: idSchema,
  mealDate: localDateSchema,
  mealType: mealTypeSchema,
  mealNote: z.string().nullable(),
  status: mealPlanStatusSchema,
  version: z.number().int().min(1),
  items: z.array(mealPlanItemSchema),
  updatedAt: z.string(),
});

export type MealPlanDetail = z.infer<typeof mealPlanDetailSchema>;

export const procurementSourceSchema = z.object({
  mealPlanId: idSchema,
  mealItemId: idSchema,
  mealType: mealTypeSchema,
  recipeName: z.string(),
  ingredientName: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
});

export type ProcurementSource = z.infer<typeof procurementSourceSchema>;

export const procurementItemSchema = z.object({
  id: idSchema,
  ingredientKey: z.string(),
  displayName: z.string(),
  category: z.string(),
  totalQuantity: z.number().nullable(),
  unit: z.string().nullable(),
  needed: z.boolean(),
  sources: z.array(procurementSourceSchema),
});

export type ProcurementItemResponse = z.infer<typeof procurementItemSchema>;

export const procurementListSchema = z.object({
  kitchenId: idSchema,
  date: localDateSchema,
  revision: z.number().int().min(0),
  items: z.array(procurementItemSchema),
});

export type ProcurementList = z.infer<typeof procurementListSchema>;

export const procurementSharePreviewInputSchema = z.object({
  mealTypes: z
    .array(mealTypeSchema)
    .min(1, "至少选择一个餐次")
    .max(3)
    .refine((items) => new Set(items).size === items.length, "餐次不能重复"),
});

export type ProcurementSharePreviewInput = z.infer<
  typeof procurementSharePreviewInputSchema
>;

export const procurementShareMealSchema = z.object({
  mealType: mealTypeSchema,
  items: z.array(procurementItemSchema),
});

export type ProcurementShareMeal = z.infer<typeof procurementShareMealSchema>;

export const procurementSharePreviewSchema = procurementListSchema.extend({
  mealTypes: z.array(mealTypeSchema).min(1).max(3),
  meals: z.array(procurementShareMealSchema),
  generatedAt: z.string(),
});

export type ProcurementSharePreview = z.infer<
  typeof procurementSharePreviewSchema
>;

export const saveMealPlanResponseSchema = z.object({
  mealPlan: mealPlanDetailSchema,
  procurementRevision: z.number().int().min(1),
});

export type SaveMealPlanResponse = z.infer<typeof saveMealPlanResponseSchema>;

export const completeMealPlanInputSchema = z.object({
  version: z.number().int().min(1),
});

export type CompleteMealPlanInput = z.infer<typeof completeMealPlanInputSchema>;

export const updateProcurementItemInputSchema = z.object({
  needed: z.boolean(),
});

export type UpdateProcurementItemInput = z.infer<
  typeof updateProcurementItemInputSchema
>;

export const mediaUploadSessionInputSchema = z.object({
  kitchenId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

export type MediaUploadSessionInput = z.infer<
  typeof mediaUploadSessionInputSchema
>;

export const mediaUploadSessionSchema = z.object({
  mediaAssetId: idSchema,
  mode: z.enum(["mock", "cos"]),
  storageKey: z.string(),
  bucket: z.string().nullable(),
  region: z.string().nullable(),
  uploadUrl: z.string().nullable(),
  authorization: z.string().nullable(),
});

export type MediaUploadSession = z.infer<typeof mediaUploadSessionSchema>;

export const completeMediaUploadInputSchema = z.object({
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  mockPreviewUrl: z.string().max(2048).nullable().default(null),
});

export type CompleteMediaUploadInput = z.infer<
  typeof completeMediaUploadInputSchema
>;

export const mediaAssetSchema = z.object({
  id: idSchema,
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mealPhotoSchema = z.object({
  id: idSchema,
  mealPlanId: idSchema,
  mealItemId: idSchema.nullable(),
  media: mediaAssetSchema,
  caption: z.string().nullable(),
  uploadedBy: userSummarySchema,
  createdAt: z.string(),
});

export type MealPhoto = z.infer<typeof mealPhotoSchema>;

export const addMealPhotosInputSchema = z.object({
  photos: z
    .array(
      z.object({
        mediaAssetId: idSchema,
        mealItemId: idSchema.nullable().default(null),
        caption: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .min(1)
    .max(9),
});

export type AddMealPhotosInput = z.infer<typeof addMealPhotosInputSchema>;

export const updateMealPhotoInputSchema = z
  .object({
    mediaAssetId: idSchema.optional(),
    mealItemId: idSchema.nullable().optional(),
    caption: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少修改一个字段");

export type UpdateMealPhotoInput = z.infer<typeof updateMealPhotoInputSchema>;

export const errorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "SESSION_EXPIRED",
  "WECHAT_LOGIN_FAILED",
  "MINI_PROGRAM_CODE_UNAVAILABLE",
  "KITCHEN_ACCESS_DENIED",
  "KITCHEN_NOT_FOUND",
  "KITCHEN_OWNER_REQUIRED",
  "KITCHEN_OWNER_CANNOT_LEAVE",
  "KITCHEN_MEMBER_NOT_FOUND",
  "KITCHEN_MEMBER_LIMIT_REACHED",
  "INVITE_INVALID_OR_EXPIRED",
  "RECIPE_NOT_FOUND",
  "RECIPE_VERSION_CONFLICT",
  "RECIPE_IMPORT_SOURCE_UNSUPPORTED",
  "RECIPE_IMPORT_FETCH_FAILED",
  "RECIPE_IMPORT_NOT_FOUND",
  "MEAL_PLAN_VERSION_CONFLICT",
  "MEAL_PLAN_ALREADY_COMPLETED",
  "MEAL_PLAN_NOT_COMPLETED",
  "MEAL_PLAN_EMPTY",
  "MEDIA_NOT_READY",
  "CONTENT_MODERATION_REJECTED",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  meta: z.object({
    requestId: z.string(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
