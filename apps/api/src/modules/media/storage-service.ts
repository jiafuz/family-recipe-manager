import type { MediaUploadSession } from "@jiayan/contracts";
import COS from "cos-nodejs-sdk-v5";

import type { AppConfig } from "../../config";

export class MediaStorageService {
  private readonly cos: COS | null;

  constructor(private readonly config: AppConfig) {
    this.cos =
      config.MEDIA_STORAGE_MODE === "cos"
        ? new COS({
            SecretId: config.TENCENT_CLOUD_SECRET_ID,
            SecretKey: config.TENCENT_CLOUD_SECRET_KEY,
          })
        : null;
  }

  get isMock(): boolean {
    return this.config.MEDIA_STORAGE_MODE === "mock";
  }

  async createUploadSession(input: {
    mediaAssetId: string;
    kitchenId: string;
    userId: string;
    fileName: string;
    mimeType: string;
  }): Promise<MediaUploadSession> {
    const extension = safeImageExtension(input.fileName);
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const storageKey = `private/${input.kitchenId}/${input.userId}/${date}/${input.mediaAssetId}.${extension}`;
    if (this.config.MEDIA_STORAGE_MODE === "mock") {
      return {
        mediaAssetId: input.mediaAssetId,
        mode: "mock",
        storageKey,
        bucket: null,
        region: null,
        uploadUrl: null,
        authorization: null,
      };
    }
    const authorization = this.cos!.getAuth({
      Method: "PUT",
      Key: storageKey,
      Headers: { "content-type": input.mimeType },
      Expires: 900,
    });
    const encodedKey = storageKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return {
      mediaAssetId: input.mediaAssetId,
      mode: "cos",
      storageKey,
      bucket: this.config.COS_BUCKET,
      region: this.config.COS_REGION,
      uploadUrl: `https://${this.config.COS_BUCKET}.cos.${this.config.COS_REGION}.myqcloud.com/${encodedKey}`,
      authorization,
    };
  }

  async verifyUploaded(storageKey: string): Promise<void> {
    if (!this.cos) return;
    await this.cos.headObject({
      Bucket: this.config.COS_BUCKET,
      Region: this.config.COS_REGION,
      Key: storageKey,
    });
  }

  async getReadUrl(
    storageKey: string,
    mockPreviewUrl?: string,
  ): Promise<string> {
    if (!this.cos) return mockPreviewUrl ?? `mock://${storageKey}`;
    return this.cos.getObjectUrl({
      Bucket: this.config.COS_BUCKET,
      Region: this.config.COS_REGION,
      Key: storageKey,
      Sign: true,
      Expires: 3_600,
    });
  }
}

function safeImageExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "png" || extension === "webp") return extension;
  return "jpg";
}
