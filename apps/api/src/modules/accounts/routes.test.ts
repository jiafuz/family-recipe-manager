import type {
  FamilyRecipeDetail,
  KitchenDetail,
  PublicRecipeDetail,
  PublicRecipeListItem,
  RecipeImport,
  SessionResponse,
  TodayRecommendation,
} from "@jiayan/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app";
import { loadConfig } from "../../config";
import type { AppServices } from "../../services";
import { AuthService } from "./auth-service";
import { KitchenService } from "./kitchen-service";
import { InMemoryAccountKitchenRepository } from "./testing/in-memory-repository";
import { TokenService } from "./token-service";
import { MockWechatSessionClient } from "./wechat-session-client";
import { RecipeService } from "../recipes/service";
import { MockRecipeImportSourceClient } from "../recipes/import-source-client";
import { InMemoryRecipeRepository } from "../recipes/testing/in-memory-recipe-repository";
import { MealPlanService } from "../meals/service";
import { InMemoryMealPlanRepository } from "../meals/testing/in-memory-meal-repository";
import { MediaService } from "../media/service";
import { MediaStorageService } from "../media/storage-service";
import { InMemoryMediaRepository } from "../media/testing/in-memory-media-repository";
import { MockMiniProgramCodeService } from "../meta/mini-program-code-service";

const testConfig = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
});

function createTestServices(): AppServices {
  const repository = new InMemoryAccountKitchenRepository();
  const kitchens = new KitchenService(
    repository,
    "test-invite-secret-at-least-32-characters",
  );
  const recipeRepository = new InMemoryRecipeRepository();
  const mealRepository = new InMemoryMealPlanRepository(recipeRepository);
  const mediaRepository = new InMemoryMediaRepository();
  return {
    auth: new AuthService({
      accounts: repository,
      kitchens: repository,
      wechat: new MockWechatSessionClient(),
      tokens: new TokenService(
        "test-access-token-secret-at-least-32-characters",
        900,
      ),
      identityHashSecret: "test-identity-secret-at-least-32-characters",
      refreshTokenTtlDays: 30,
    }),
    kitchens,
    recipes: new RecipeService(
      recipeRepository,
      kitchens,
      new MockRecipeImportSourceClient(),
      mealRepository,
    ),
    meals: new MealPlanService(mealRepository, kitchens),
    media: new MediaService(
      mediaRepository,
      mealRepository,
      kitchens,
      new MediaStorageService(testConfig),
    ),
    miniProgramCode: new MockMiniProgramCodeService(),
    dispose: async () => undefined,
  };
}

async function login(
  app: FastifyInstance,
  code: string,
): Promise<SessionResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/wechat/login",
    payload: { code },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ data: SessionResponse }>().data;
}

describe("account and kitchen onboarding", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ config: testConfig, services: createTestServices() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("logs in idempotently and returns an empty kitchen list", async () => {
    const first = await login(app, "same-wechat-user");
    const second = await login(app, "same-wechat-user");

    expect(second.user.id).toBe(first.user.id);
    expect(first.kitchens).toEqual([]);

    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().data.currentKitchen).toBeNull();
  });

  it("protects the product mini program code and degrades cleanly in mock mode", async () => {
    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/meta/product-mini-program-code",
    });
    expect(unauthorized.statusCode).toBe(401);

    const session = await login(app, "mini-program-code-user");
    const response = await app.inject({
      method: "GET",
      url: "/v1/meta/product-mini-program-code",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(response.statusCode).toBe(204);
  });

  it("creates a kitchen and exposes the owner as its first member", async () => {
    const session = await login(app, "kitchen-owner");
    const response = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "周末小厨房", icon: "🍲" },
    });

    expect(response.statusCode).toBe(201);
    const kitchen = response.json<{ data: KitchenDetail }>().data;
    expect(kitchen).toMatchObject({
      name: "周末小厨房",
      icon: "🍲",
      memberCount: 1,
      role: "owner",
    });
    expect(kitchen.members[0]).toMatchObject({
      userId: session.user.id,
      role: "owner",
    });
  });

  it("allows a second user to join with a six digit invite code", async () => {
    const owner = await login(app, "invite-owner");
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "一家人的厨房", icon: "🏠" },
    });
    const kitchen = createResponse.json<{ data: KitchenDetail }>().data;

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/invites`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {},
    });
    expect(inviteResponse.statusCode).toBe(201);
    const inviteCode = inviteResponse.json().data.code as string;
    expect(inviteCode).toMatch(/^\d{6}$/);

    const member = await login(app, "invited-member");
    const previewResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchen-invites/preview",
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { inviteCode },
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json().data).toMatchObject({
      kitchenName: "一家人的厨房",
      kitchenIcon: "🏠",
      memberCount: 1,
    });

    const joinResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchen-invites/join",
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { inviteCode },
    });

    expect(joinResponse.statusCode).toBe(200);
    const joined = joinResponse.json<{ data: KitchenDetail }>().data;
    expect(joined.memberCount).toBe(2);
    expect(joined.members.map((item) => item.userId)).toEqual(
      expect.arrayContaining([owner.user.id, member.user.id]),
    );
  });

  it("supports owner management, member exit and kitchen dissolution", async () => {
    const owner = await login(app, "lifecycle-owner");
    const member = await login(app, "lifecycle-member");
    const created = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "原来的厨房", icon: "🏠" },
    });
    const kitchen = created.json<{ data: KitchenDetail }>().data;
    const invite = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/invites`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {},
    });
    const inviteCode = invite.json().data.code as string;
    await app.inject({
      method: "POST",
      url: "/v1/kitchen-invites/join",
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { inviteCode },
    });

    const forbiddenEdit = await app.inject({
      method: "PATCH",
      url: `/v1/kitchens/${kitchen.id}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { name: "不能修改", icon: "🌟" },
    });
    expect(forbiddenEdit.statusCode).toBe(403);
    expect(forbiddenEdit.json().error.code).toBe("KITCHEN_OWNER_REQUIRED");

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/kitchens/${kitchen.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "周末团圆厨房", icon: "🍲" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      name: "周末团圆厨房",
      icon: "🍲",
    });

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/kitchens/${kitchen.id}/members/${member.user.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.memberCount).toBe(1);

    const removedMemberRead = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(removedMemberRead.statusCode).toBe(404);

    const rejoined = await app.inject({
      method: "POST",
      url: "/v1/kitchen-invites/join",
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { inviteCode },
    });
    expect(rejoined.statusCode).toBe(200);

    const leave = await app.inject({
      method: "DELETE",
      url: `/v1/kitchens/${kitchen.id}/membership`,
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(leave.statusCode).toBe(204);

    const ownerCannotLeave = await app.inject({
      method: "DELETE",
      url: `/v1/kitchens/${kitchen.id}/membership`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(ownerCannotLeave.statusCode).toBe(409);
    expect(ownerCannotLeave.json().error.code).toBe(
      "KITCHEN_OWNER_CANNOT_LEAVE",
    );

    const dissolved = await app.inject({
      method: "DELETE",
      url: `/v1/kitchens/${kitchen.id}`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(dissolved.statusCode).toBe(204);

    const ownerKitchens = await app.inject({
      method: "GET",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(ownerKitchens.json().data).toEqual([]);
  });

  it("rotates refresh tokens and invalidates a logged out access token", async () => {
    const initial = await login(app, "refresh-user");
    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: initial.refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(200);
    const refreshed = refreshResponse.json<{ data: SessionResponse }>().data;
    expect(refreshed.refreshToken).not.toBe(initial.refreshToken);

    const reusedRefresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: initial.refreshToken },
    });
    expect(reusedRefresh.statusCode).toBe(401);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${refreshed.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${refreshed.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("creates, versions, filters and archives a family recipe", async () => {
    const session = await login(app, "recipe-editor");
    const kitchenResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "菜谱测试厨房", icon: "🍳" },
    });
    const kitchen = kitchenResponse.json<{ data: KitchenDetail }>().data;
    const recipePayload = {
      name: "番茄炒蛋",
      description: "家里的快手菜",
      category: "egg",
      coverEmoji: "🍳",
      cookMinutes: 12,
      tips: "鸡蛋先炒至刚凝固",
      orderingState: "available",
      ingredients: [
        { name: "番茄", quantity: 2, unit: "个", category: "vegetable" },
        { name: "鸡蛋", quantity: 3, unit: "个", category: "egg" },
      ],
      steps: [
        { instruction: "番茄切块，鸡蛋打散。" },
        { instruction: "先炒鸡蛋，再加入番茄翻炒。" },
      ],
    };

    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/recipes`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: recipePayload,
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<{ data: FamilyRecipeDetail }>().data;
    expect(created).toMatchObject({
      name: "番茄炒蛋",
      version: 1,
      orderingState: "available",
      ingredientCount: 2,
    });

    const availableList = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/recipes?orderingState=available`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(availableList.statusCode).toBe(200);
    expect(availableList.json().data).toHaveLength(1);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/recipes/${created.id}?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        ...recipePayload,
        name: "家常番茄炒蛋",
        expectedVersion: 1,
        changeNote: "补充家庭做法",
      },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data).toMatchObject({
      name: "家常番茄炒蛋",
      version: 2,
    });

    const staleUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/recipes/${created.id}?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        ...recipePayload,
        expectedVersion: 1,
        changeNote: null,
      },
    });
    expect(staleUpdate.statusCode).toBe(409);
    expect(staleUpdate.json().error).toMatchObject({
      code: "RECIPE_VERSION_CONFLICT",
      details: { currentVersion: 2 },
    });

    const pauseResponse = await app.inject({
      method: "PATCH",
      url: `/v1/recipes/${created.id}/ordering-state?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { orderingState: "want_to_learn" },
    });
    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.json().data.orderingState).toBe("want_to_learn");

    const emptyAvailableList = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/recipes?orderingState=available`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(emptyAvailableList.json().data).toEqual([]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/recipes/${created.id}?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it("searches public recipes and clones one independent family version", async () => {
    const session = await login(app, "public-recipe-collector");
    const kitchenResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "收录菜谱的家", icon: "📖" },
    });
    const kitchen = kitchenResponse.json<{ data: KitchenDetail }>().data;

    const publicList = await app.inject({
      method: "GET",
      url: "/v1/discovery/recipes?search=番茄&category=egg",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(publicList.statusCode).toBe(200);
    const recipes = publicList.json<{ data: PublicRecipeListItem[] }>().data;
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toMatchObject({
      name: "番茄炒蛋",
      authorName: "家宴菜谱编辑部",
    });

    const publicDetail = await app.inject({
      method: "GET",
      url: `/v1/discovery/recipes/${recipes[0]!.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(publicDetail.statusCode).toBe(200);
    expect(
      publicDetail.json<{ data: PublicRecipeDetail }>().data.ingredients,
    ).toHaveLength(3);

    const cloned = await app.inject({
      method: "POST",
      url: `/v1/discovery/recipes/${recipes[0]!.id}/clone`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { kitchenId: kitchen.id, orderingState: "available" },
    });
    expect(cloned.statusCode).toBe(201);
    expect(cloned.json().data).toMatchObject({
      created: true,
      recipe: {
        name: "番茄炒蛋",
        orderingState: "available",
        version: 1,
      },
    });

    const repeatedClone = await app.inject({
      method: "POST",
      url: `/v1/discovery/recipes/${recipes[0]!.id}/clone`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { kitchenId: kitchen.id, orderingState: "want_to_learn" },
    });
    expect(repeatedClone.statusCode).toBe(200);
    expect(repeatedClone.json().data.created).toBe(false);

    const familyList = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/recipes`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(familyList.json().data).toHaveLength(1);

    const outsider = await login(app, "public-recipe-outsider");
    const forbiddenClone = await app.inject({
      method: "POST",
      url: `/v1/discovery/recipes/${recipes[0]!.id}/clone`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { kitchenId: kitchen.id, orderingState: "available" },
    });
    expect(forbiddenClone.statusCode).toBe(404);
    expect(forbiddenClone.json().error.code).toBe("KITCHEN_NOT_FOUND");
  });

  it("creates a link import draft and completes it after user review", async () => {
    const session = await login(app, "recipe-link-importer");
    const kitchenResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "链接导入厨房", icon: "🔗" },
    });
    const kitchen = kitchenResponse.json<{ data: KitchenDetail }>().data;

    const unsupported = await app.inject({
      method: "POST",
      url: "/v1/recipe-imports",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { kitchenId: kitchen.id, url: "https://example.com/recipe" },
    });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().error.code).toBe(
      "RECIPE_IMPORT_SOURCE_UNSUPPORTED",
    );

    const startImport = await app.inject({
      method: "POST",
      url: "/v1/recipe-imports",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        kitchenId: kitchen.id,
        url: "https://www.xiachufang.com/recipe/123456/",
      },
    });
    expect(startImport.statusCode).toBe(201);
    const recipeImport = startImport.json<{ data: RecipeImport }>().data;
    expect(recipeImport).toMatchObject({
      kitchenId: kitchen.id,
      platform: "xiachufang",
      status: "needs_review",
      savedRecipeId: null,
      draft: { name: "待核对的下厨房菜谱", ingredients: [], steps: [] },
    });

    const recipeResponse = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/recipes`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        name: "核对后的家常豆腐",
        description: "用户核对完成",
        category: "vegetable",
        coverEmoji: "🍲",
        cookMinutes: 25,
        tips: null,
        orderingState: "available",
        ingredients: [
          { name: "豆腐", quantity: 1, unit: "块", category: "vegetable" },
        ],
        steps: [{ instruction: "煎香后调味。" }],
      },
    });
    const recipe = recipeResponse.json<{ data: FamilyRecipeDetail }>().data;

    const complete = await app.inject({
      method: "POST",
      url: `/v1/recipe-imports/${recipeImport.id}/complete`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { kitchenId: kitchen.id, recipeId: recipe.id },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data).toMatchObject({
      status: "completed",
      savedRecipeId: recipe.id,
    });

    const outsider = await login(app, "recipe-link-import-outsider");
    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/recipe-imports/${recipeImport.id}?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(forbidden.statusCode).toBe(404);
    expect(forbidden.json().error.code).toBe("KITCHEN_NOT_FOUND");
  });

  it("persists recommendation preferences and refreshes an explainable group", async () => {
    const session = await login(app, "recommendation-user");
    const kitchenResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "推荐测试厨房", icon: "✨" },
    });
    const kitchen = kitchenResponse.json<{ data: KitchenDetail }>().data;

    for (const [index, name] of [
      "清炒时蔬",
      "萝卜炖肉",
      "香煎小鱼",
      "鸡蛋羹",
    ].entries()) {
      const created = await app.inject({
        method: "POST",
        url: `/v1/kitchens/${kitchen.id}/recipes`,
        headers: { authorization: `Bearer ${session.accessToken}` },
        payload: {
          name,
          description: "推荐测试菜谱",
          category: ["vegetable", "meat", "fish", "egg"][index],
          coverEmoji: "🍲",
          cookMinutes: 15 + index * 5,
          tips: null,
          orderingState: "available",
          ingredients: [
            {
              name: `食材${index}`,
              quantity: 1,
              unit: "份",
              category: "other",
            },
          ],
          steps: [{ instruction: "按家庭做法完成。" }],
        },
      });
      expect(created.statusCode).toBe(201);
    }

    const initial = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/recommendations/today`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(initial.statusCode).toBe(200);
    const firstGroup = initial.json<{ data: TodayRecommendation }>().data;
    expect(firstGroup.preferences).toEqual({
      strategy: "long_time_no_eat",
      sourceScope: "family_only",
      itemCount: 3,
      collapsed: false,
    });
    expect(firstGroup.items).toHaveLength(3);
    expect(firstGroup.items.every((item) => item.source === "family")).toBe(
      true,
    );

    const updated = await app.inject({
      method: "PUT",
      url: `/v1/kitchens/${kitchen.id}/recommendation-preferences`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        strategy: "quick",
        sourceScope: "mixed",
        itemCount: 4,
        collapsed: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    const updatedGroup = updated.json<{ data: TodayRecommendation }>().data;
    expect(updatedGroup.preferences).toMatchObject({
      strategy: "quick",
      sourceScope: "mixed",
      itemCount: 4,
      collapsed: true,
    });
    expect(updatedGroup.items).toHaveLength(4);

    const refreshed = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/recommendations/refresh`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { excludeRecipeIds: updatedGroup.items.map((item) => item.id) },
    });
    expect(refreshed.statusCode).toBe(200);
    const refreshedGroup = refreshed.json<{ data: TodayRecommendation }>().data;
    expect(refreshedGroup.items).toHaveLength(4);
    expect(
      refreshedGroup.items.some(
        (item) => !updatedGroup.items.some((current) => current.id === item.id),
      ),
    ).toBe(true);

    const outsider = await login(app, "recommendation-outsider");
    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/recommendations/today`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(forbidden.statusCode).toBe(404);
  });

  it("saves a meal and recalculates procurement while preserving selections", async () => {
    const session = await login(app, "meal-planner");
    const kitchenResponse = await app.inject({
      method: "POST",
      url: "/v1/kitchens",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: "晚餐厨房", icon: "🥘" },
    });
    const kitchen = kitchenResponse.json<{ data: KitchenDetail }>().data;
    const recipeResponse = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/recipes`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        name: "青椒肉丝",
        description: "今晚就吃这个",
        category: "meat",
        coverEmoji: "🥩",
        cookMinutes: 20,
        tips: null,
        orderingState: "available",
        ingredients: [
          { name: "青椒", quantity: 2, unit: "个", category: "vegetable" },
          { name: "猪肉", quantity: 250, unit: "克", category: "meat" },
        ],
        steps: [{ instruction: "切丝后大火快炒。" }],
      },
    });
    const recipe = recipeResponse.json<{ data: FamilyRecipeDetail }>().data;
    const slotUrl = `/v1/kitchens/${kitchen.id}/meal-plans/2026-07-23/dinner`;

    const firstSave = await app.inject({
      method: "PUT",
      url: slotUrl,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        version: 0,
        mealNote: "少油",
        items: [
          {
            recipeId: recipe.id,
            recipeVersionId: recipe.currentVersionId,
            quantity: 1,
            tasteNote: "微辣",
          },
        ],
      },
    });
    expect(firstSave.statusCode).toBe(200);
    expect(firstSave.json().data.mealPlan).toMatchObject({
      version: 1,
      mealType: "dinner",
      mealNote: "少油",
    });

    const procurementResponse = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(procurementResponse.statusCode).toBe(200);
    expect(procurementResponse.json().data.items).toHaveLength(2);
    const pepper = procurementResponse
      .json()
      .data.items.find(
        (item: { displayName: string }) => item.displayName === "青椒",
      );
    expect(pepper).toMatchObject({ totalQuantity: 2, needed: true });

    const uncheckResponse = await app.inject({
      method: "PATCH",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23/items/${pepper.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { needed: false },
    });
    expect(uncheckResponse.statusCode).toBe(200);

    const meal = firstSave.json().data.mealPlan;
    const secondSave = await app.inject({
      method: "PUT",
      url: slotUrl,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        version: 1,
        mealNote: "两份",
        items: [
          {
            itemId: meal.items[0].id,
            recipeId: recipe.id,
            recipeVersionId: recipe.currentVersionId,
            quantity: 2,
            tasteNote: "微辣",
          },
        ],
      },
    });
    expect(secondSave.statusCode).toBe(200);
    expect(secondSave.json().data.mealPlan.version).toBe(2);

    const updatedProcurement = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const updatedPepper = updatedProcurement
      .json()
      .data.items.find(
        (item: { displayName: string }) => item.displayName === "青椒",
      );
    expect(updatedPepper).toMatchObject({ totalQuantity: 4, needed: false });

    const sharePreview = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23/share-previews`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { mealTypes: ["breakfast", "dinner"] },
    });
    expect(sharePreview.statusCode).toBe(200);
    expect(sharePreview.json().data).toMatchObject({
      date: "2026-07-23",
      mealTypes: ["breakfast", "dinner"],
    });
    expect(sharePreview.json().data.items).toHaveLength(2);
    expect(sharePreview.json().data.meals).toEqual([
      { mealType: "breakfast", items: [] },
      expect.objectContaining({ mealType: "dinner" }),
    ]);
    expect(
      sharePreview
        .json()
        .data.items.find(
          (item: { displayName: string }) => item.displayName === "青椒",
        ),
    ).toMatchObject({ totalQuantity: 4, needed: false });

    const emptyShareScope = await app.inject({
      method: "POST",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23/share-previews`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { mealTypes: [] },
    });
    expect(emptyShareScope.statusCode).toBe(400);

    const recipeUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/recipes/${recipe.id}?kitchenId=${kitchen.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        expectedVersion: 1,
        name: "青椒肉丝新版",
        description: "新版用料不能覆盖已经点下的旧版",
        category: "meat",
        coverEmoji: "🥩",
        cookMinutes: 20,
        tips: null,
        orderingState: "available",
        ingredients: [
          { name: "青椒", quantity: 99, unit: "个", category: "vegetable" },
          { name: "猪肉", quantity: 250, unit: "克", category: "meat" },
        ],
        steps: [{ instruction: "按新版制作。" }],
        changeNote: "测试历史版本稳定性",
      },
    });
    expect(recipeUpdate.statusCode).toBe(200);

    const retainedOldVersion = await app.inject({
      method: "PUT",
      url: slotUrl,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        version: 2,
        mealNote: "仍按下单时的版本采购",
        items: [
          {
            itemId: meal.items[0].id,
            recipeId: recipe.id,
            recipeVersionId: recipe.currentVersionId,
            quantity: 3,
            tasteNote: "微辣",
          },
        ],
      },
    });
    expect(retainedOldVersion.statusCode).toBe(200);
    const oldVersionProcurement = await app.inject({
      method: "GET",
      url: `/v1/kitchens/${kitchen.id}/procurement/2026-07-23`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const retainedPepper = oldVersionProcurement
      .json()
      .data.items.find(
        (item: { displayName: string }) => item.displayName === "青椒",
      );
    expect(retainedPepper).toMatchObject({ totalQuantity: 6, needed: false });

    const staleSave = await app.inject({
      method: "PUT",
      url: slotUrl,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        version: 1,
        mealNote: null,
        items: [
          {
            recipeId: recipe.id,
            recipeVersionId: recipe.currentVersionId,
            quantity: 1,
            tasteNote: null,
          },
        ],
      },
    });
    expect(staleSave.statusCode).toBe(409);
    expect(staleSave.json().error.code).toBe("MEAL_PLAN_VERSION_CONFLICT");

    const completeResponse = await app.inject({
      method: "POST",
      url: `${slotUrl}/complete`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { version: 3 },
    });
    expect(completeResponse.statusCode).toBe(200);
    expect(completeResponse.json().data).toMatchObject({
      status: "completed",
      version: 4,
    });

    const editCompletedMeal = await app.inject({
      method: "PUT",
      url: slotUrl,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        version: 4,
        mealNote: null,
        items: [
          {
            itemId: meal.items[0].id,
            recipeId: recipe.id,
            recipeVersionId: recipe.currentVersionId,
            quantity: 1,
            tasteNote: null,
          },
        ],
      },
    });
    expect(editCompletedMeal.statusCode).toBe(409);
    expect(editCompletedMeal.json().error.code).toBe(
      "MEAL_PLAN_ALREADY_COMPLETED",
    );

    const uploadSession = await app.inject({
      method: "POST",
      url: "/v1/media/upload-sessions",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        kitchenId: kitchen.id,
        fileName: "dinner.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      },
    });
    expect(uploadSession.statusCode).toBe(200);
    expect(uploadSession.json().data.mode).toBe("mock");
    const mediaAssetId = uploadSession.json().data.mediaAssetId;

    const uploadComplete = await app.inject({
      method: "POST",
      url: `/v1/media/${mediaAssetId}/complete`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        width: 1200,
        height: 900,
        mockPreviewUrl: "wxfile://meal-photo.jpg",
      },
    });
    expect(uploadComplete.statusCode).toBe(200);

    const addPhoto = await app.inject({
      method: "POST",
      url: `/v1/meal-plans/${meal.id}/photos`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        photos: [
          {
            mediaAssetId,
            mealItemId: meal.items[0].id,
            caption: "第一次做得很成功",
          },
        ],
      },
    });
    expect(addPhoto.statusCode).toBe(200);
    expect(addPhoto.json().data).toHaveLength(1);
    expect(addPhoto.json().data[0]).toMatchObject({
      mealItemId: meal.items[0].id,
      caption: "第一次做得很成功",
      media: { url: "wxfile://meal-photo.jpg" },
    });
    const photoId = addPhoto.json().data[0].id;

    const outsider = await login(app, "meal-photo-outsider");
    const outsiderPhotoList = await app.inject({
      method: "GET",
      url: `/v1/meal-plans/${meal.id}/photos`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(outsiderPhotoList.statusCode).toBe(404);
    expect(outsiderPhotoList.json().error.code).toBe("KITCHEN_NOT_FOUND");

    const updatePhoto = await app.inject({
      method: "PATCH",
      url: `/v1/meal-photos/${photoId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { mealItemId: null, caption: "全家一起吃晚餐" },
    });
    expect(updatePhoto.statusCode).toBe(200);
    expect(updatePhoto.json().data).toMatchObject({
      mealItemId: null,
      caption: "全家一起吃晚餐",
    });

    const deletePhoto = await app.inject({
      method: "DELETE",
      url: `/v1/meal-photos/${photoId}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(deletePhoto.statusCode).toBe(204);
    const photoList = await app.inject({
      method: "GET",
      url: `/v1/meal-plans/${meal.id}/photos`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(photoList.statusCode).toBe(200);
    expect(photoList.json().data).toEqual([]);
  });
});
