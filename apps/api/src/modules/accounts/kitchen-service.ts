import { createHmac, randomInt } from "node:crypto";

import type {
  CreateKitchenInput,
  KitchenDetail,
  KitchenInviteResponse,
  KitchenSummary,
} from "@jiayan/contracts";
import { ulid } from "ulid";

import { AppError } from "../../lib/app-error";
import type { KitchenRepository } from "./repository";

export class KitchenService {
  constructor(
    private readonly kitchens: KitchenRepository,
    private readonly inviteCodeSecret: string,
  ) {}

  listForUser(userId: string): Promise<KitchenSummary[]> {
    return this.kitchens.listForUser(userId);
  }

  create(userId: string, input: CreateKitchenInput): Promise<KitchenDetail> {
    return this.kitchens.createWithOwner({
      kitchenId: ulid(),
      ownerUserId: userId,
      name: input.name,
      icon: input.icon,
    });
  }

  async getDetail(kitchenId: string, userId: string): Promise<KitchenDetail> {
    const kitchen = await this.kitchens.findDetailForMember(kitchenId, userId);

    if (!kitchen) {
      throw new AppError({
        statusCode: 404,
        code: "KITCHEN_NOT_FOUND",
        message: "没有找到这个厨房",
      });
    }

    return kitchen;
  }

  async createInvite(input: {
    kitchenId: string;
    actorUserId: string;
    expiresInDays: number;
    maxUses: number;
  }): Promise<KitchenInviteResponse> {
    await this.getDetail(input.kitchenId, input.actorUserId);
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

      try {
        await this.kitchens.createInvite({
          inviteId: ulid(),
          kitchenId: input.kitchenId,
          actorUserId: input.actorUserId,
          codeHash: this.hashInviteCode(code),
          expiresAt,
          maxUses: input.maxUses,
        });

        return {
          code,
          expiresAt: expiresAt.toISOString(),
          maxUses: input.maxUses,
        };
      } catch (error) {
        if (!this.isDuplicateError(error) || attempt === 4) {
          throw error;
        }
      }
    }

    throw new AppError({
      statusCode: 503,
      code: "INTERNAL_ERROR",
      message: "暂时无法生成邀请码，请稍后重试",
    });
  }

  async join(userId: string, inviteCode: string): Promise<KitchenDetail> {
    const result = await this.kitchens.joinByInviteHash({
      codeHash: this.hashInviteCode(inviteCode),
      userId,
      now: new Date(),
    });

    if (result.status === "invalid") {
      throw new AppError({
        statusCode: 400,
        code: "INVITE_INVALID_OR_EXPIRED",
        message: "邀请码无效或已过期",
      });
    }

    if (result.status === "member_limit_reached") {
      throw new AppError({
        statusCode: 409,
        code: "KITCHEN_MEMBER_LIMIT_REACHED",
        message: "这个厨房的成员人数已达上限",
      });
    }

    return result.kitchen;
  }

  private hashInviteCode(code: string): string {
    return createHmac("sha256", this.inviteCodeSecret)
      .update(code)
      .digest("hex");
  }

  private isDuplicateError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    );
  }
}
