import { createHmac, randomInt } from "node:crypto";

import type {
  CreateKitchenInput,
  KitchenDetail,
  KitchenInvitePreview,
  KitchenInviteResponse,
  KitchenSummary,
  UpdateKitchenInput,
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

  async update(
    kitchenId: string,
    actorUserId: string,
    input: UpdateKitchenInput,
  ): Promise<KitchenDetail> {
    const kitchen = await this.getDetail(kitchenId, actorUserId);
    this.assertOwner(kitchen);

    const updated = await this.kitchens.updateByOwner({
      kitchenId,
      ownerUserId: actorUserId,
      name: input.name,
      icon: input.icon,
    });
    if (!updated) throw this.ownerRequiredError();
    return this.getDetail(kitchenId, actorUserId);
  }

  async removeMember(
    kitchenId: string,
    actorUserId: string,
    memberUserId: string,
  ): Promise<KitchenDetail> {
    const kitchen = await this.getDetail(kitchenId, actorUserId);
    this.assertOwner(kitchen);
    const member = kitchen.members.find((item) => item.userId === memberUserId);

    if (!member || member.role === "owner") {
      throw new AppError({
        statusCode: 404,
        code: "KITCHEN_MEMBER_NOT_FOUND",
        message: "没有找到可移除的家庭成员",
      });
    }

    const removed = await this.kitchens.removeMemberByOwner({
      kitchenId,
      ownerUserId: actorUserId,
      memberUserId,
    });
    if (!removed) {
      throw new AppError({
        statusCode: 409,
        code: "KITCHEN_MEMBER_NOT_FOUND",
        message: "成员状态已经变化，请刷新后重试",
      });
    }
    return this.getDetail(kitchenId, actorUserId);
  }

  async leave(kitchenId: string, userId: string): Promise<void> {
    const kitchen = await this.getDetail(kitchenId, userId);
    if (kitchen.role === "owner") {
      throw new AppError({
        statusCode: 409,
        code: "KITCHEN_OWNER_CANNOT_LEAVE",
        message: "创建者不能直接退出，请先解散厨房",
      });
    }

    const left = await this.kitchens.leaveAsMember(kitchenId, userId);
    if (!left) {
      throw new AppError({
        statusCode: 409,
        code: "KITCHEN_MEMBER_NOT_FOUND",
        message: "成员状态已经变化，请刷新后重试",
      });
    }
  }

  async delete(kitchenId: string, actorUserId: string): Promise<void> {
    const kitchen = await this.getDetail(kitchenId, actorUserId);
    this.assertOwner(kitchen);
    const deleted = await this.kitchens.deleteByOwner(kitchenId, actorUserId);
    if (!deleted) throw this.ownerRequiredError();
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

  async previewInvite(inviteCode: string): Promise<KitchenInvitePreview> {
    const preview = await this.kitchens.findInvitePreviewByHash(
      this.hashInviteCode(inviteCode),
      new Date(),
    );
    if (!preview) {
      throw new AppError({
        statusCode: 400,
        code: "INVITE_INVALID_OR_EXPIRED",
        message: "邀请码无效或已过期",
      });
    }
    return preview;
  }

  private hashInviteCode(code: string): string {
    return createHmac("sha256", this.inviteCodeSecret)
      .update(code)
      .digest("hex");
  }

  private assertOwner(kitchen: KitchenDetail): void {
    if (kitchen.role !== "owner") throw this.ownerRequiredError();
  }

  private ownerRequiredError(): AppError {
    return new AppError({
      statusCode: 403,
      code: "KITCHEN_OWNER_REQUIRED",
      message: "只有厨房创建者可以进行这项操作",
    });
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
