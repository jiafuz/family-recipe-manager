import type { UserSummary } from "@jiayan/contracts";

export interface MediaAssetRecord {
  id: string;
  ownerUserId: string;
  kitchenId: string;
  storageKey: string;
  mockPreviewUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  completed: boolean;
}

export interface MealPhotoRecord {
  id: string;
  mealPlanId: string;
  mealItemId: string | null;
  mediaAsset: MediaAssetRecord;
  caption: string | null;
  uploadedBy: UserSummary;
  createdAt: string;
}

export interface MediaRepository {
  createAsset(input: Omit<MediaAssetRecord, "completed">): Promise<void>;
  findAsset(mediaAssetId: string): Promise<MediaAssetRecord | null>;
  completeAsset(input: {
    mediaAssetId: string;
    ownerUserId: string;
    width: number | null;
    height: number | null;
    mockPreviewUrl: string | null;
  }): Promise<MediaAssetRecord | null>;
  listMealPhotos(mealPlanId: string): Promise<MealPhotoRecord[]>;
  addMealPhotos(
    photos: Array<{
      id: string;
      mealPlanId: string;
      mealItemId: string | null;
      mediaAssetId: string;
      caption: string | null;
      uploadedBy: UserSummary;
    }>,
  ): Promise<MealPhotoRecord[]>;
  findMealPhoto(photoId: string): Promise<MealPhotoRecord | null>;
  updateMealPhoto(input: {
    photoId: string;
    mediaAssetId?: string;
    mealItemId?: string | null;
    caption?: string | null;
  }): Promise<MealPhotoRecord | null>;
  deleteMealPhoto(photoId: string): Promise<boolean>;
}
