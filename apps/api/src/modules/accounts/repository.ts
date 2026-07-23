import type {
  KitchenDetail,
  KitchenRole,
  KitchenSummary,
  UserSummary,
} from "@jiayan/contracts";

export interface StoredSession {
  id: string;
  user: UserSummary;
  expiresAt: Date;
}

export interface AccountRepository {
  findOrCreateWechatUser(input: {
    userId: string;
    identityId: string;
    identitySubject: Uint8Array;
    unionSubject: Uint8Array | null;
    defaultDisplayName: string;
  }): Promise<UserSummary>;

  findUserById(userId: string): Promise<UserSummary | null>;

  createSession(input: {
    sessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceLabel: string | null;
  }): Promise<void>;

  findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<StoredSession | null>;

  rotateSession(input: {
    previousSessionId: string;
    nextSessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceLabel: string | null;
  }): Promise<void>;

  isSessionActive(sessionId: string, userId: string): Promise<boolean>;

  revokeSession(sessionId: string, userId: string): Promise<void>;
}

export interface KitchenRepository {
  listForUser(userId: string): Promise<KitchenSummary[]>;

  createWithOwner(input: {
    kitchenId: string;
    ownerUserId: string;
    name: string;
    icon: string;
  }): Promise<KitchenDetail>;

  findDetailForMember(
    kitchenId: string,
    userId: string,
  ): Promise<KitchenDetail | null>;

  createInvite(input: {
    inviteId: string;
    kitchenId: string;
    actorUserId: string;
    codeHash: string;
    expiresAt: Date;
    maxUses: number;
  }): Promise<void>;

  joinByInviteHash(input: {
    codeHash: string;
    userId: string;
    now: Date;
  }): Promise<
    | { status: "joined" | "already_member"; kitchen: KitchenDetail }
    | { status: "invalid" }
    | { status: "member_limit_reached" }
  >;
}

export interface KitchenRecord {
  id: string;
  name: string;
  icon: string;
  memberCount: number;
  role: KitchenRole;
}
