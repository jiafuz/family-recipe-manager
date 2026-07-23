import type {
  AddMealPhotosInput,
  CompleteMediaUploadInput,
  MealPhoto,
  MediaAsset,
  MediaUploadSession,
  MediaUploadSessionInput,
  UpdateMealPhotoInput,
  UserSummary,
} from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { KitchenService } from "../accounts/kitchen-service";
import type { MealPlanRepository } from "../meals/repository";
import type {
  MealPhotoRecord,
  MediaAssetRecord,
  MediaRepository,
} from "./repository";
import { MediaStorageService } from "./storage-service";

export class MediaService {
  constructor(
    private readonly media: MediaRepository,
    private readonly meals: MealPlanRepository,
    private readonly kitchens: KitchenService,
    private readonly storage: MediaStorageService,
  ) {}

  async createUploadSession(
    userId: string,
    input: MediaUploadSessionInput,
  ): Promise<MediaUploadSession> {
    await this.kitchens.getDetail(input.kitchenId, userId);
    const mediaAssetId = ulid();
    const session = await this.storage.createUploadSession({
      mediaAssetId,
      kitchenId: input.kitchenId,
      userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    await this.media.createAsset({
      id: mediaAssetId,
      ownerUserId: userId,
      kitchenId: input.kitchenId,
      storageKey: session.storageKey,
      mockPreviewUrl: null,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: null,
      height: null,
    });
    return session;
  }

  async completeUpload(
    userId: string,
    mediaAssetId: string,
    input: CompleteMediaUploadInput,
  ): Promise<MediaAsset> {
    const pending = await this.media.findAsset(mediaAssetId);
    if (!pending || pending.ownerUserId !== userId) throw mediaNotFound();
    await this.kitchens.getDetail(pending.kitchenId, userId);
    if (this.storage.isMock && !input.mockPreviewUrl) {
      throw new AppError({
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "本地联调上传缺少图片预览地址",
      });
    }
    await this.storage.verifyUploaded(pending.storageKey);
    const completed = await this.media.completeAsset({
      mediaAssetId,
      ownerUserId: userId,
      width: input.width,
      height: input.height,
      mockPreviewUrl: this.storage.isMock ? input.mockPreviewUrl : null,
    });
    if (!completed) throw mediaNotFound();
    return this.toMediaAsset(completed);
  }

  async listMealPhotos(
    userId: string,
    mealPlanId: string,
  ): Promise<MealPhoto[]> {
    await this.getAccessibleCompletedMeal(userId, mealPlanId);
    return Promise.all(
      (await this.media.listMealPhotos(mealPlanId)).map((photo) =>
        this.toMealPhoto(photo),
      ),
    );
  }

  async addMealPhotos(
    userId: string,
    mealPlanId: string,
    input: AddMealPhotosInput,
  ): Promise<MealPhoto[]> {
    const { mealPlan, user } = await this.getAccessibleCompletedMeal(
      userId,
      mealPlanId,
    );
    const itemIds = new Set(mealPlan.items.map((item) => item.id));
    const assets = await Promise.all(
      input.photos.map((photo) => this.media.findAsset(photo.mediaAssetId)),
    );
    for (const [index, photo] of input.photos.entries()) {
      if (photo.mealItemId && !itemIds.has(photo.mealItemId)) {
        throw new AppError({
          statusCode: 400,
          code: "VALIDATION_FAILED",
          message: "照片关联的菜品不属于本餐",
        });
      }
      const asset = assets[index];
      if (!asset?.completed || asset.kitchenId !== mealPlan.kitchenId) {
        throw new AppError({
          statusCode: 409,
          code: "MEDIA_NOT_READY",
          message: "图片尚未上传完成",
        });
      }
    }
    const photos = await this.media.addMealPhotos(
      input.photos.map((photo) => ({
        id: ulid(),
        mealPlanId,
        mealItemId: photo.mealItemId,
        mediaAssetId: photo.mediaAssetId,
        caption: photo.caption,
        uploadedBy: user,
      })),
    );
    return Promise.all(photos.map((photo) => this.toMealPhoto(photo)));
  }

  async updateMealPhoto(
    userId: string,
    photoId: string,
    input: UpdateMealPhotoInput,
  ): Promise<MealPhoto> {
    const current = await this.media.findMealPhoto(photoId);
    if (!current) throw mediaNotFound();
    const { mealPlan } = await this.getAccessibleCompletedMeal(
      userId,
      current.mealPlanId,
    );
    if (
      input.mealItemId !== undefined &&
      input.mealItemId !== null &&
      !mealPlan.items.some((item) => item.id === input.mealItemId)
    ) {
      throw new AppError({
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "照片关联的菜品不属于本餐",
      });
    }
    if (input.mediaAssetId) {
      const asset = await this.media.findAsset(input.mediaAssetId);
      if (!asset?.completed || asset.kitchenId !== mealPlan.kitchenId) {
        throw new AppError({
          statusCode: 409,
          code: "MEDIA_NOT_READY",
          message: "替换图片尚未上传完成",
        });
      }
    }
    const updated = await this.media.updateMealPhoto({
      photoId,
      ...(input.mediaAssetId !== undefined
        ? { mediaAssetId: input.mediaAssetId }
        : {}),
      ...(input.mealItemId !== undefined
        ? { mealItemId: input.mealItemId }
        : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
    });
    if (!updated) throw mediaNotFound();
    return this.toMealPhoto(updated);
  }

  async deleteMealPhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.media.findMealPhoto(photoId);
    if (!photo) throw mediaNotFound();
    await this.getAccessibleCompletedMeal(userId, photo.mealPlanId);
    if (!(await this.media.deleteMealPhoto(photoId))) throw mediaNotFound();
  }

  private async getAccessibleCompletedMeal(userId: string, mealPlanId: string) {
    const mealPlan = await this.meals.findMealPlanById(mealPlanId);
    if (!mealPlan) {
      throw new AppError({
        statusCode: 404,
        code: "MEAL_PLAN_EMPTY",
        message: "没有找到这份菜单",
      });
    }
    const kitchen = await this.kitchens.getDetail(mealPlan.kitchenId, userId);
    if (mealPlan.status !== "completed") {
      throw new AppError({
        statusCode: 409,
        code: "MEAL_PLAN_NOT_COMPLETED",
        message: "完成本餐后才能添加成品照",
      });
    }
    const member = kitchen.members.find((item) => item.userId === userId);
    const user: UserSummary = {
      id: userId,
      displayName: member?.nickname || member?.displayName || "家庭成员",
      avatarUrl: null,
    };
    return { mealPlan, user };
  }

  private async toMediaAsset(asset: MediaAssetRecord): Promise<MediaAsset> {
    return {
      id: asset.id,
      url: await this.storage.getReadUrl(
        asset.storageKey,
        asset.mockPreviewUrl ?? undefined,
      ),
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    };
  }

  private async toMealPhoto(photo: MealPhotoRecord): Promise<MealPhoto> {
    return {
      id: photo.id,
      mealPlanId: photo.mealPlanId,
      mealItemId: photo.mealItemId,
      media: await this.toMediaAsset(photo.mediaAsset),
      caption: photo.caption,
      uploadedBy: photo.uploadedBy,
      createdAt: photo.createdAt,
    };
  }
}

function mediaNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: "MEDIA_NOT_READY",
    message: "没有找到这张图片",
  });
}
