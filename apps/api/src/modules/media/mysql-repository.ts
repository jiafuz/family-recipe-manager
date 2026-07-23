import type { UserSummary } from "@jiayan/contracts";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type {
  MealPhotoRecord,
  MediaAssetRecord,
  MediaRepository,
} from "./repository";

interface AssetRow extends RowDataPacket {
  id: string;
  owner_user_id: string;
  kitchen_id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string | number;
  width: number | null;
  height: number | null;
  upload_status: "pending" | "ready" | "failed";
}

interface PhotoRow extends AssetRow {
  photo_id: string;
  meal_plan_id: string;
  meal_item_id: string | null;
  media_asset_id: string;
  caption: string | null;
  uploaded_by_id: string;
  uploaded_by_name: string;
  uploaded_by_avatar: string | null;
  photo_created_at: Date;
}

export class MysqlMediaRepository implements MediaRepository {
  constructor(private readonly pool: Pool) {}

  async createAsset(input: Omit<MediaAssetRecord, "completed">): Promise<void> {
    await this.pool.execute(
      `INSERT INTO media_assets (
         id, owner_user_id, kitchen_id, storage_key, mime_type,
         size_bytes, width, height, upload_status, visibility,
         moderation_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'private', 'pending')`,
      [
        input.id,
        input.ownerUserId,
        input.kitchenId,
        input.storageKey,
        input.mimeType,
        input.sizeBytes,
        input.width,
        input.height,
      ],
    );
  }

  async findAsset(mediaAssetId: string): Promise<MediaAssetRecord | null> {
    const [rows] = await this.pool.query<AssetRow[]>(
      `${assetSelect()}
       WHERE asset.id = ? AND asset.deleted_at IS NULL`,
      [mediaAssetId],
    );
    return rows[0] ? toAsset(rows[0]) : null;
  }

  async completeAsset(
    input: Parameters<MediaRepository["completeAsset"]>[0],
  ): Promise<MediaAssetRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE media_assets
       SET width = ?, height = ?, upload_status = 'ready'
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
      [input.width, input.height, input.mediaAssetId, input.ownerUserId],
    );
    if (result.affectedRows !== 1) return null;
    return this.findAsset(input.mediaAssetId);
  }

  async listMealPhotos(mealPlanId: string): Promise<MealPhotoRecord[]> {
    const [rows] = await this.pool.query<PhotoRow[]>(
      `${photoSelect()}
       WHERE photo.meal_plan_id = ? AND photo.deleted_at IS NULL
         AND asset.deleted_at IS NULL AND asset.upload_status = 'ready'
       ORDER BY photo.created_at ASC, photo.id ASC`,
      [mealPlanId],
    );
    return rows.map(toPhoto);
  }

  async addMealPhotos(
    photos: Parameters<MediaRepository["addMealPhotos"]>[0],
  ): Promise<MealPhotoRecord[]> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const photo of photos) {
        await connection.execute(
          `INSERT INTO meal_photos (
             id, meal_plan_id, meal_item_id, media_asset_id,
             caption, uploaded_by
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            photo.id,
            photo.mealPlanId,
            photo.mealItemId,
            photo.mediaAssetId,
            photo.caption,
            photo.uploadedBy.id,
          ],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.listMealPhotos(photos[0]!.mealPlanId);
  }

  async findMealPhoto(photoId: string): Promise<MealPhotoRecord | null> {
    const [rows] = await this.pool.query<PhotoRow[]>(
      `${photoSelect()}
       WHERE photo.id = ? AND photo.deleted_at IS NULL
         AND asset.deleted_at IS NULL AND asset.upload_status = 'ready'`,
      [photoId],
    );
    return rows[0] ? toPhoto(rows[0]) : null;
  }

  async updateMealPhoto(
    input: Parameters<MediaRepository["updateMealPhoto"]>[0],
  ): Promise<MealPhotoRecord | null> {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    if (input.mediaAssetId !== undefined) {
      assignments.push("media_asset_id = ?");
      values.push(input.mediaAssetId);
    }
    if (input.mealItemId !== undefined) {
      assignments.push("meal_item_id = ?");
      values.push(input.mealItemId);
    }
    if (input.caption !== undefined) {
      assignments.push("caption = ?");
      values.push(input.caption);
    }
    if (assignments.length === 0) return this.findMealPhoto(input.photoId);
    values.push(input.photoId);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE meal_photos
       SET ${assignments.join(", ")}, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND deleted_at IS NULL`,
      values,
    );
    if (result.affectedRows !== 1) return null;
    return this.findMealPhoto(input.photoId);
  }

  async deleteMealPhoto(photoId: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE meal_photos
       SET deleted_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND deleted_at IS NULL`,
      [photoId],
    );
    return result.affectedRows === 1;
  }
}

function assetSelect(): string {
  return `SELECT
    asset.id, asset.owner_user_id, asset.kitchen_id, asset.storage_key,
    asset.mime_type, asset.size_bytes, asset.width, asset.height,
    asset.upload_status
  FROM media_assets asset`;
}

function photoSelect(): string {
  return `SELECT
    photo.id AS photo_id,
    photo.meal_plan_id,
    photo.meal_item_id,
    photo.media_asset_id,
    photo.caption,
    photo.created_at AS photo_created_at,
    asset.id,
    asset.owner_user_id,
    asset.kitchen_id,
    asset.storage_key,
    asset.mime_type,
    asset.size_bytes,
    asset.width,
    asset.height,
    asset.upload_status,
    uploader.id AS uploaded_by_id,
    uploader.display_name AS uploaded_by_name,
    NULL AS uploaded_by_avatar
  FROM meal_photos photo
  INNER JOIN media_assets asset ON asset.id = photo.media_asset_id
  INNER JOIN users uploader ON uploader.id = photo.uploaded_by`;
}

function toAsset(row: AssetRow): MediaAssetRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    kitchenId: row.kitchen_id,
    storageKey: row.storage_key,
    mockPreviewUrl: null,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    completed: row.upload_status === "ready",
  };
}

function toPhoto(row: PhotoRow): MealPhotoRecord {
  const uploadedBy: UserSummary = {
    id: row.uploaded_by_id,
    displayName: row.uploaded_by_name,
    avatarUrl: row.uploaded_by_avatar,
  };
  return {
    id: row.photo_id,
    mealPlanId: row.meal_plan_id,
    mealItemId: row.meal_item_id,
    mediaAsset: toAsset(row),
    caption: row.caption,
    uploadedBy,
    createdAt: row.photo_created_at.toISOString(),
  };
}
