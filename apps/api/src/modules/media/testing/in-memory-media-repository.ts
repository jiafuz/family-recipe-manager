import type {
  MealPhotoRecord,
  MediaAssetRecord,
  MediaRepository,
} from "../repository";

export class InMemoryMediaRepository implements MediaRepository {
  private readonly assets = new Map<string, MediaAssetRecord>();
  private readonly photos = new Map<string, MealPhotoRecord>();

  async createAsset(input: Omit<MediaAssetRecord, "completed">): Promise<void> {
    this.assets.set(input.id, { ...structuredClone(input), completed: false });
  }

  async findAsset(mediaAssetId: string): Promise<MediaAssetRecord | null> {
    const asset = this.assets.get(mediaAssetId);
    return asset ? structuredClone(asset) : null;
  }

  async completeAsset(
    input: Parameters<MediaRepository["completeAsset"]>[0],
  ): Promise<MediaAssetRecord | null> {
    const asset = this.assets.get(input.mediaAssetId);
    if (!asset || asset.ownerUserId !== input.ownerUserId) return null;
    asset.width = input.width;
    asset.height = input.height;
    asset.mockPreviewUrl = input.mockPreviewUrl;
    asset.completed = true;
    return structuredClone(asset);
  }

  async listMealPhotos(mealPlanId: string): Promise<MealPhotoRecord[]> {
    return [...this.photos.values()]
      .filter((photo) => photo.mealPlanId === mealPlanId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((photo) => structuredClone(photo));
  }

  async addMealPhotos(
    inputs: Parameters<MediaRepository["addMealPhotos"]>[0],
  ): Promise<MealPhotoRecord[]> {
    const now = new Date().toISOString();
    for (const input of inputs) {
      const asset = this.assets.get(input.mediaAssetId);
      if (!asset?.completed) throw new Error("MEDIA_NOT_READY");
      this.photos.set(input.id, {
        id: input.id,
        mealPlanId: input.mealPlanId,
        mealItemId: input.mealItemId,
        mediaAsset: structuredClone(asset),
        caption: input.caption,
        uploadedBy: structuredClone(input.uploadedBy),
        createdAt: now,
      });
    }
    return this.listMealPhotos(inputs[0]!.mealPlanId);
  }

  async findMealPhoto(photoId: string): Promise<MealPhotoRecord | null> {
    const photo = this.photos.get(photoId);
    return photo ? structuredClone(photo) : null;
  }

  async updateMealPhoto(
    input: Parameters<MediaRepository["updateMealPhoto"]>[0],
  ): Promise<MealPhotoRecord | null> {
    const photo = this.photos.get(input.photoId);
    if (!photo) return null;
    if (input.mediaAssetId !== undefined) {
      const asset = this.assets.get(input.mediaAssetId);
      if (!asset?.completed) return null;
      photo.mediaAsset = structuredClone(asset);
    }
    if (input.mealItemId !== undefined) photo.mealItemId = input.mealItemId;
    if (input.caption !== undefined) photo.caption = input.caption;
    return structuredClone(photo);
  }

  async deleteMealPhoto(photoId: string): Promise<boolean> {
    return this.photos.delete(photoId);
  }
}
