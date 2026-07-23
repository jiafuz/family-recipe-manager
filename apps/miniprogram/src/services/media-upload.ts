import Taro from "@tarojs/taro";

import { completeMediaUpload, createMediaUploadSession } from "./api-client";

export interface LocalMediaFile {
  tempFilePath: string;
  size: number;
}

export async function uploadMealPhoto(
  kitchenId: string,
  file: LocalMediaFile,
): Promise<string> {
  const imageInfo = await Taro.getImageInfo({ src: file.tempFilePath });
  const fileName = getFileName(file.tempFilePath, imageInfo.type);
  const mimeType = getMimeType(imageInfo.type);
  const session = await createMediaUploadSession({
    kitchenId,
    fileName,
    mimeType,
    sizeBytes: file.size,
  });

  if (session.mode === "cos") {
    if (!session.uploadUrl || !session.authorization) {
      throw new Error("图片上传签名不完整");
    }
    const fileData = await readFile(file.tempFilePath);
    const response = await Taro.request({
      url: session.uploadUrl,
      method: "PUT",
      data: fileData,
      header: {
        Authorization: session.authorization,
        "content-type": mimeType,
      },
      timeout: 60_000,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`图片上传失败（${response.statusCode}）`);
    }
  }

  await completeMediaUpload(session.mediaAssetId, {
    width: imageInfo.width,
    height: imageInfo.height,
    mockPreviewUrl: session.mode === "mock" ? file.tempFilePath : null,
  });
  return session.mediaAssetId;
}

function readFile(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      success(result) {
        if (typeof result.data === "string") {
          reject(new Error("读取图片失败"));
          return;
        }
        resolve(result.data);
      },
      fail: reject,
    });
  });
}

function getFileName(path: string, type: string): string {
  const candidate = path.slice(path.lastIndexOf("/") + 1);
  return candidate.includes(".")
    ? candidate
    : `meal-photo.${normaliseType(type)}`;
}

function getMimeType(type: string): "image/jpeg" | "image/png" | "image/webp" {
  const normalised = normaliseType(type);
  if (normalised === "png") return "image/png";
  if (normalised === "webp") return "image/webp";
  return "image/jpeg";
}

function normaliseType(type: string): "jpg" | "png" | "webp" {
  const normalised = type.toLowerCase();
  if (normalised === "png" || normalised === "webp") return normalised;
  return "jpg";
}
