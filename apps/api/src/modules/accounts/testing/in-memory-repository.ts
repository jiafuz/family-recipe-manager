import type {
  KitchenDetail,
  KitchenMember,
  KitchenRole,
  KitchenSummary,
  UserSummary,
} from "@jiayan/contracts";

import type {
  AccountRepository,
  KitchenRepository,
  StoredSession,
} from "../repository";

interface MemorySession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revoked: boolean;
}

interface MemoryKitchen {
  id: string;
  name: string;
  icon: string;
  ownerUserId: string;
  memberLimit: number;
  members: Map<
    string,
    {
      role: KitchenRole;
      nickname: string | null;
      joinedAt: Date;
      active: boolean;
    }
  >;
}

interface MemoryInvite {
  kitchenId: string;
  expiresAt: Date;
  maxUses: number;
  usedCount: number;
}

export class InMemoryAccountKitchenRepository
  implements AccountRepository, KitchenRepository
{
  private readonly users = new Map<string, UserSummary>();
  private readonly identityToUser = new Map<string, string>();
  private readonly sessions = new Map<string, MemorySession>();
  private readonly kitchens = new Map<string, MemoryKitchen>();
  private readonly invites = new Map<string, MemoryInvite>();

  async findOrCreateWechatUser(input: {
    userId: string;
    identityId: string;
    identitySubject: Uint8Array;
    unionSubject: Uint8Array | null;
    defaultDisplayName: string;
  }): Promise<UserSummary> {
    const identityKey = Buffer.from(input.identitySubject).toString("hex");
    const existingUserId = this.identityToUser.get(identityKey);
    const existing = existingUserId
      ? this.users.get(existingUserId)
      : undefined;

    if (existing) return { ...existing };

    const user: UserSummary = {
      id: input.userId,
      displayName: input.defaultDisplayName,
      avatarUrl: null,
    };
    this.users.set(user.id, user);
    this.identityToUser.set(identityKey, user.id);
    return { ...user };
  }

  async findUserById(userId: string): Promise<UserSummary | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async createSession(input: {
    sessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceLabel: string | null;
  }): Promise<void> {
    this.sessions.set(input.sessionId, {
      id: input.sessionId,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      revoked: false,
    });
  }

  async findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<StoredSession | null> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.refreshTokenHash === refreshTokenHash &&
        !candidate.revoked &&
        candidate.expiresAt.getTime() > Date.now(),
    );
    const user = session ? this.users.get(session.userId) : undefined;

    return session && user
      ? {
          id: session.id,
          user: { ...user },
          expiresAt: session.expiresAt,
        }
      : null;
  }

  async rotateSession(input: {
    previousSessionId: string;
    nextSessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceLabel: string | null;
  }): Promise<void> {
    const previous = this.sessions.get(input.previousSessionId);
    if (!previous || previous.revoked) throw new Error("Session is inactive");
    previous.revoked = true;
    await this.createSession({
      sessionId: input.nextSessionId,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      deviceLabel: input.deviceLabel,
    });
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    return Boolean(
      session &&
      session.userId === userId &&
      !session.revoked &&
      session.expiresAt.getTime() > Date.now(),
    );
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.userId === userId) session.revoked = true;
  }

  async listForUser(userId: string): Promise<KitchenSummary[]> {
    return [...this.kitchens.values()]
      .filter((kitchen) => kitchen.members.get(userId)?.active)
      .map((kitchen) => this.toKitchenSummary(kitchen, userId));
  }

  async createWithOwner(input: {
    kitchenId: string;
    ownerUserId: string;
    name: string;
    icon: string;
  }): Promise<KitchenDetail> {
    const kitchen: MemoryKitchen = {
      id: input.kitchenId,
      name: input.name,
      icon: input.icon,
      ownerUserId: input.ownerUserId,
      memberLimit: 10,
      members: new Map([
        [
          input.ownerUserId,
          {
            role: "owner",
            nickname: null,
            joinedAt: new Date(),
            active: true,
          },
        ],
      ]),
    };
    this.kitchens.set(kitchen.id, kitchen);
    return this.toKitchenDetail(kitchen, input.ownerUserId);
  }

  async findDetailForMember(
    kitchenId: string,
    userId: string,
  ): Promise<KitchenDetail | null> {
    const kitchen = this.kitchens.get(kitchenId);
    return kitchen?.members.get(userId)?.active
      ? this.toKitchenDetail(kitchen, userId)
      : null;
  }

  async createInvite(input: {
    inviteId: string;
    kitchenId: string;
    actorUserId: string;
    codeHash: string;
    expiresAt: Date;
    maxUses: number;
  }): Promise<void> {
    const kitchen = this.kitchens.get(input.kitchenId);
    if (!kitchen?.members.get(input.actorUserId)?.active) {
      throw new Error("Kitchen access denied");
    }
    if (this.invites.has(input.codeHash)) {
      const error = new Error("Duplicate invite") as Error & { code: string };
      error.code = "ER_DUP_ENTRY";
      throw error;
    }
    this.invites.set(input.codeHash, {
      kitchenId: input.kitchenId,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
      usedCount: 0,
    });
  }

  async joinByInviteHash(input: {
    codeHash: string;
    userId: string;
    now: Date;
  }): Promise<
    | { status: "joined" | "already_member"; kitchen: KitchenDetail }
    | { status: "invalid" }
    | { status: "member_limit_reached" }
  > {
    const invite = this.invites.get(input.codeHash);

    if (
      !invite ||
      invite.expiresAt.getTime() <= input.now.getTime() ||
      invite.usedCount >= invite.maxUses
    ) {
      return { status: "invalid" };
    }

    const kitchen = this.kitchens.get(invite.kitchenId);
    if (!kitchen) return { status: "invalid" };
    const existing = kitchen.members.get(input.userId);

    if (existing?.active) {
      return {
        status: "already_member",
        kitchen: this.toKitchenDetail(kitchen, input.userId),
      };
    }

    const activeMembers = [...kitchen.members.values()].filter(
      (member) => member.active,
    ).length;
    if (activeMembers >= kitchen.memberLimit) {
      return { status: "member_limit_reached" };
    }

    kitchen.members.set(input.userId, {
      role: "member",
      nickname: null,
      joinedAt: new Date(),
      active: true,
    });
    invite.usedCount += 1;

    return {
      status: "joined",
      kitchen: this.toKitchenDetail(kitchen, input.userId),
    };
  }

  private toKitchenSummary(
    kitchen: MemoryKitchen,
    viewerUserId: string,
  ): KitchenSummary {
    return {
      id: kitchen.id,
      name: kitchen.name,
      icon: kitchen.icon,
      memberCount: [...kitchen.members.values()].filter(
        (member) => member.active,
      ).length,
      role: kitchen.members.get(viewerUserId)?.role ?? "member",
    };
  }

  private toKitchenDetail(
    kitchen: MemoryKitchen,
    viewerUserId: string,
  ): KitchenDetail {
    const members: KitchenMember[] = [...kitchen.members.entries()]
      .filter(([, membership]) => membership.active)
      .map(([userId, membership]) => {
        const user = this.users.get(userId);
        if (!user) throw new Error("Unknown in-memory user");
        return {
          userId,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          nickname: membership.nickname,
          role: membership.role,
          joinedAt: membership.joinedAt.toISOString(),
        };
      });

    return {
      ...this.toKitchenSummary(kitchen, viewerUserId),
      members,
    };
  }
}
