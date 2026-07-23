import type { Pool } from "mysql2/promise";

import type { AppConfig } from "./config";
import { createDatabasePool } from "./database/pool";
import { AuthService } from "./modules/accounts/auth-service";
import { KitchenService } from "./modules/accounts/kitchen-service";
import { MysqlAccountKitchenRepository } from "./modules/accounts/mysql-repository";
import type {
  AccountRepository,
  KitchenRepository,
} from "./modules/accounts/repository";
import { InMemoryAccountKitchenRepository } from "./modules/accounts/testing/in-memory-repository";
import { TokenService } from "./modules/accounts/token-service";
import {
  LiveWechatSessionClient,
  MockWechatSessionClient,
  type WechatSessionClient,
} from "./modules/accounts/wechat-session-client";
import { MealPlanService } from "./modules/meals/service";
import { MysqlMealPlanRepository } from "./modules/meals/mysql-repository";
import type { MealPlanRepository } from "./modules/meals/repository";
import { InMemoryMealPlanRepository } from "./modules/meals/testing/in-memory-meal-repository";
import { MediaService } from "./modules/media/service";
import { MediaStorageService } from "./modules/media/storage-service";
import { MysqlMediaRepository } from "./modules/media/mysql-repository";
import type { MediaRepository } from "./modules/media/repository";
import { InMemoryMediaRepository } from "./modules/media/testing/in-memory-media-repository";
import { MysqlRecipeRepository } from "./modules/recipes/mysql-repository";
import type { RecipeRepository } from "./modules/recipes/repository";
import { RecipeService } from "./modules/recipes/service";
import { InMemoryRecipeRepository } from "./modules/recipes/testing/in-memory-recipe-repository";

export interface AppServices {
  auth: AuthService;
  kitchens: KitchenService;
  recipes: RecipeService;
  meals: MealPlanService;
  media: MediaService;
  dispose(): Promise<void>;
}

export function createAppServices(config: AppConfig): AppServices {
  let accounts: AccountRepository;
  let kitchens: KitchenRepository;
  let recipeRepository: RecipeRepository;
  let mealRepository: MealPlanRepository;
  let mediaRepository: MediaRepository;
  let dispose: () => Promise<void>;

  if (config.PERSISTENCE_MODE === "mysql") {
    const pool = createDatabasePool(config);
    const repository = new MysqlAccountKitchenRepository(pool);
    accounts = repository;
    kitchens = repository;
    recipeRepository = new MysqlRecipeRepository(pool);
    mealRepository = new MysqlMealPlanRepository(pool);
    mediaRepository = new MysqlMediaRepository(pool);
    dispose = () => closePool(pool);
  } else {
    const repository = new InMemoryAccountKitchenRepository();
    accounts = repository;
    kitchens = repository;
    recipeRepository = new InMemoryRecipeRepository();
    mealRepository = new InMemoryMealPlanRepository(recipeRepository);
    mediaRepository = new InMemoryMediaRepository();
    dispose = async () => undefined;
  }

  const tokens = new TokenService(
    config.AUTH_ACCESS_TOKEN_SECRET,
    config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  );
  const wechat: WechatSessionClient =
    config.WECHAT_LOGIN_MODE === "live"
      ? new LiveWechatSessionClient(
          config.WECHAT_APP_ID,
          config.WECHAT_APP_SECRET,
        )
      : new MockWechatSessionClient();

  const kitchenService = new KitchenService(
    kitchens,
    config.INVITE_CODE_SECRET,
  );
  const mediaStorage = new MediaStorageService(config);

  return {
    auth: new AuthService({
      accounts,
      kitchens,
      wechat,
      tokens,
      identityHashSecret: config.IDENTITY_HASH_SECRET,
      refreshTokenTtlDays: config.AUTH_REFRESH_TOKEN_TTL_DAYS,
    }),
    kitchens: kitchenService,
    recipes: new RecipeService(recipeRepository, kitchenService),
    meals: new MealPlanService(mealRepository, kitchenService),
    media: new MediaService(
      mediaRepository,
      mealRepository,
      kitchenService,
      mediaStorage,
    ),
    dispose,
  };
}

async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}
