import type {
  ApiErrorResponse,
  AddMealPhotosInput,
  CompleteMediaUploadInput,
  CreateKitchenInput,
  CurrentUserResponse,
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  JoinKitchenInput,
  KitchenDetail,
  KitchenInviteResponse,
  MealPlanDetail,
  MealPhoto,
  MealType,
  ProcurementList,
  MediaAsset,
  MediaUploadSession,
  MediaUploadSessionInput,
  RecipeCategory,
  RecipeOrderingState,
  SaveFamilyRecipeInput,
  SaveMealPlanInput,
  SaveMealPlanResponse,
  SessionResponse,
  UpdateFamilyRecipeInput,
  UpdateMealPhotoInput,
} from "@jiayan/contracts";
import Taro from "@tarojs/taro";

const SESSION_STORAGE_KEY = "jiayan.session.v1";
const CURRENT_KITCHEN_STORAGE_KEY = "jiayan.current-kitchen.v1";

interface ApiEnvelope<T> {
  data: T;
  meta: { requestId: string };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  authenticated?: boolean;
  retryAuthentication?: boolean;
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function getStoredSession(): SessionResponse | null {
  try {
    const session = Taro.getStorageSync<SessionResponse>(SESSION_STORAGE_KEY);
    return session?.accessToken ? session : null;
  } catch {
    return null;
  }
}

export function storeCurrentKitchen(kitchenId: string): void {
  Taro.setStorageSync(CURRENT_KITCHEN_STORAGE_KEY, kitchenId);
}

export function getStoredCurrentKitchenId(): string | null {
  try {
    return Taro.getStorageSync<string>(CURRENT_KITCHEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export async function ensureSignedIn(): Promise<CurrentUserResponse> {
  if (!getStoredSession()) {
    await loginWithWechat();
  }

  try {
    return await request<CurrentUserResponse>("/v1/me");
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 401) {
      clearSession();
      await loginWithWechat();
      return request<CurrentUserResponse>("/v1/me");
    }
    throw error;
  }
}

export async function loginWithWechat(): Promise<SessionResponse> {
  const loginResult = await Taro.login();
  const session = await request<SessionResponse>("/v1/auth/wechat/login", {
    method: "POST",
    body: { code: loginResult.code },
    authenticated: false,
    retryAuthentication: false,
  });
  saveSession(session);
  return session;
}

export async function createKitchen(
  input: CreateKitchenInput,
): Promise<KitchenDetail> {
  const kitchen = await request<KitchenDetail>("/v1/kitchens", {
    method: "POST",
    body: input,
  });
  storeCurrentKitchen(kitchen.id);
  return kitchen;
}

export async function joinKitchen(
  input: JoinKitchenInput,
): Promise<KitchenDetail> {
  const kitchen = await request<KitchenDetail>("/v1/kitchen-invites/join", {
    method: "POST",
    body: input,
  });
  storeCurrentKitchen(kitchen.id);
  return kitchen;
}

export async function getKitchenDetail(
  kitchenId: string,
): Promise<KitchenDetail> {
  return request<KitchenDetail>(`/v1/kitchens/${kitchenId}`);
}

export async function createKitchenInvite(
  kitchenId: string,
): Promise<KitchenInviteResponse> {
  return request<KitchenInviteResponse>(`/v1/kitchens/${kitchenId}/invites`, {
    method: "POST",
    body: {},
  });
}

export async function listFamilyRecipes(
  kitchenId: string,
  filters: {
    orderingState?: RecipeOrderingState;
    category?: RecipeCategory;
    search?: string;
  } = {},
): Promise<FamilyRecipeListItem[]> {
  const query = [
    filters.orderingState
      ? `orderingState=${encodeURIComponent(filters.orderingState)}`
      : "",
    filters.category ? `category=${encodeURIComponent(filters.category)}` : "",
    filters.search ? `search=${encodeURIComponent(filters.search)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  return request<FamilyRecipeListItem[]>(
    `/v1/kitchens/${kitchenId}/recipes${query ? `?${query}` : ""}`,
  );
}

export async function getFamilyRecipe(
  kitchenId: string,
  recipeId: string,
): Promise<FamilyRecipeDetail> {
  return request<FamilyRecipeDetail>(
    `/v1/recipes/${recipeId}?kitchenId=${encodeURIComponent(kitchenId)}`,
  );
}

export async function createFamilyRecipe(
  kitchenId: string,
  input: SaveFamilyRecipeInput,
): Promise<FamilyRecipeDetail> {
  return request<FamilyRecipeDetail>(`/v1/kitchens/${kitchenId}/recipes`, {
    method: "POST",
    body: input,
  });
}

export async function updateFamilyRecipe(
  kitchenId: string,
  recipeId: string,
  input: UpdateFamilyRecipeInput,
): Promise<FamilyRecipeDetail> {
  return request<FamilyRecipeDetail>(
    `/v1/recipes/${recipeId}?kitchenId=${encodeURIComponent(kitchenId)}`,
    { method: "PATCH", body: input },
  );
}

export async function updateRecipeOrderingState(
  kitchenId: string,
  recipeId: string,
  orderingState: RecipeOrderingState,
): Promise<FamilyRecipeDetail> {
  return request<FamilyRecipeDetail>(
    `/v1/recipes/${recipeId}/ordering-state?kitchenId=${encodeURIComponent(kitchenId)}`,
    { method: "PATCH", body: { orderingState } },
  );
}

export async function archiveFamilyRecipe(
  kitchenId: string,
  recipeId: string,
): Promise<void> {
  await request<void>(
    `/v1/recipes/${recipeId}?kitchenId=${encodeURIComponent(kitchenId)}`,
    { method: "DELETE" },
  );
}

export async function listMealPlans(
  kitchenId: string,
  from: string,
  to: string,
): Promise<MealPlanDetail[]> {
  return request<MealPlanDetail[]>(
    `/v1/kitchens/${kitchenId}/meal-plans?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function getMealPlan(
  kitchenId: string,
  date: string,
  mealType: MealType,
): Promise<MealPlanDetail | null> {
  return request<MealPlanDetail | null>(
    `/v1/kitchens/${kitchenId}/meal-plans/${encodeURIComponent(date)}/${mealType}`,
  );
}

export async function getMealPlanById(
  mealPlanId: string,
): Promise<MealPlanDetail> {
  return request<MealPlanDetail>(`/v1/meal-plans/${mealPlanId}`);
}

export async function saveMealPlan(
  kitchenId: string,
  date: string,
  mealType: MealType,
  input: SaveMealPlanInput,
): Promise<SaveMealPlanResponse> {
  return request<SaveMealPlanResponse>(
    `/v1/kitchens/${kitchenId}/meal-plans/${encodeURIComponent(date)}/${mealType}`,
    { method: "PUT", body: input },
  );
}

export async function completeMealPlan(
  kitchenId: string,
  date: string,
  mealType: MealType,
  version: number,
): Promise<MealPlanDetail> {
  return request<MealPlanDetail>(
    `/v1/kitchens/${kitchenId}/meal-plans/${encodeURIComponent(date)}/${mealType}/complete`,
    { method: "POST", body: { version } },
  );
}

export async function createMediaUploadSession(
  input: MediaUploadSessionInput,
): Promise<MediaUploadSession> {
  return request<MediaUploadSession>("/v1/media/upload-sessions", {
    method: "POST",
    body: input,
  });
}

export async function completeMediaUpload(
  mediaAssetId: string,
  input: CompleteMediaUploadInput,
): Promise<MediaAsset> {
  return request<MediaAsset>(`/v1/media/${mediaAssetId}/complete`, {
    method: "POST",
    body: input,
  });
}

export async function listMealPhotos(mealPlanId: string): Promise<MealPhoto[]> {
  return request<MealPhoto[]>(`/v1/meal-plans/${mealPlanId}/photos`);
}

export async function addMealPhotos(
  mealPlanId: string,
  input: AddMealPhotosInput,
): Promise<MealPhoto[]> {
  return request<MealPhoto[]>(`/v1/meal-plans/${mealPlanId}/photos`, {
    method: "POST",
    body: input,
  });
}

export async function updateMealPhoto(
  photoId: string,
  input: UpdateMealPhotoInput,
): Promise<MealPhoto> {
  return request<MealPhoto>(`/v1/meal-photos/${photoId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteMealPhoto(photoId: string): Promise<void> {
  await request<void>(`/v1/meal-photos/${photoId}`, { method: "DELETE" });
}

export async function getProcurementList(
  kitchenId: string,
  date: string,
): Promise<ProcurementList> {
  return request<ProcurementList>(
    `/v1/kitchens/${kitchenId}/procurement/${encodeURIComponent(date)}`,
  );
}

export async function updateProcurementNeeded(
  kitchenId: string,
  date: string,
  itemId: string,
  needed: boolean,
): Promise<ProcurementList> {
  return request<ProcurementList>(
    `/v1/kitchens/${kitchenId}/procurement/${encodeURIComponent(date)}/items/${itemId}`,
    { method: "PATCH", body: { needed } },
  );
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const authenticated = options.authenticated ?? true;
  const session = getStoredSession();
  const header: Record<string, string> = {
    "content-type": "application/json",
  };

  if (authenticated && session) {
    header.authorization = `Bearer ${session.accessToken}`;
  }

  let response;

  try {
    response = await Taro.request<ApiEnvelope<T> | ApiErrorResponse>({
      url: `${__API_BASE_URL__}${path}`,
      method: options.method ?? "GET",
      data: options.body,
      header,
      timeout: 10_000,
    });
  } catch {
    throw new ApiClientError(
      "NETWORK_ERROR",
      "暂时无法连接服务，请检查网络后重试",
      0,
    );
  }

  if (response.statusCode >= 200 && response.statusCode < 300) {
    if (response.statusCode === 204) return undefined as T;
    return (response.data as ApiEnvelope<T>).data;
  }

  if (
    response.statusCode === 401 &&
    authenticated &&
    (options.retryAuthentication ?? true) &&
    session?.refreshToken
  ) {
    const refreshed = await refreshStoredSession(session.refreshToken);
    if (refreshed) {
      return request<T>(path, { ...options, retryAuthentication: false });
    }
  }

  const failure = response.data as ApiErrorResponse;
  throw new ApiClientError(
    failure.error?.code ?? "REQUEST_FAILED",
    failure.error?.message ?? "操作失败，请稍后重试",
    response.statusCode,
  );
}

async function refreshStoredSession(refreshToken: string): Promise<boolean> {
  try {
    const session = await request<SessionResponse>("/v1/auth/refresh", {
      method: "POST",
      body: { refreshToken },
      authenticated: false,
      retryAuthentication: false,
    });
    saveSession(session);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function saveSession(session: SessionResponse): void {
  Taro.setStorageSync(SESSION_STORAGE_KEY, session);
}

function clearSession(): void {
  Taro.removeStorageSync(SESSION_STORAGE_KEY);
  Taro.removeStorageSync(CURRENT_KITCHEN_STORAGE_KEY);
}
