import type {
  KitchenDetail,
  KitchenInvitePreview,
  KitchenMember,
  KitchenRole,
  KitchenSummary,
  UserSummary,
} from "@jiayan/contracts";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { AppError } from "../../lib/app-error";
import type {
  AccountRepository,
  KitchenRepository,
  StoredSession,
} from "./repository";

interface UserRow extends RowDataPacket {
  id: string;
  display_name: string;
}

interface SessionRow extends UserRow {
  session_id: string;
  expires_at: Date;
}

interface KitchenRow extends RowDataPacket {
  id: string;
  name: string;
  icon: string;
  member_count: number;
  membership_role: string;
}

interface KitchenMemberRow extends RowDataPacket {
  user_id: string;
  display_name: string;
  nickname: string | null;
  membership_role: string;
  joined_at: Date;
}

interface InviteRow extends RowDataPacket {
  invite_id: string;
  kitchen_id: string;
  max_uses: number;
  used_count: number;
  member_limit: number;
}

interface InvitePreviewRow extends RowDataPacket {
  kitchen_name: string;
  kitchen_icon: string;
  expires_at: Date;
  member_count: number;
}

interface ExistingMemberRow extends RowDataPacket {
  left_at: Date | null;
}

interface CountRow extends RowDataPacket {
  member_count: number;
}

function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: null,
  };
}

function toRole(value: string): KitchenRole {
  return value === "owner" ? "owner" : "member";
}

function toKitchenSummary(row: KitchenRow): KitchenSummary {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    memberCount: Number(row.member_count),
    role: toRole(row.membership_role),
  };
}

export class MysqlAccountKitchenRepository
  implements AccountRepository, KitchenRepository
{
  constructor(private readonly pool: Pool) {}

  async findOrCreateWechatUser(input: {
    userId: string;
    identityId: string;
    identitySubject: Uint8Array;
    unionSubject: Uint8Array | null;
    defaultDisplayName: string;
  }): Promise<UserSummary> {
    const existing = await this.findUserByIdentity(input.identitySubject);

    if (existing) {
      await this.pool.execute(
        `UPDATE auth_identities
         SET last_login_at = UTC_TIMESTAMP(3)
         WHERE provider = 'wechat_miniprogram' AND provider_subject = ?`,
        [Buffer.from(input.identitySubject)],
      );
      return existing;
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO users (id, display_name)
         VALUES (?, ?)`,
        [input.userId, input.defaultDisplayName],
      );
      await connection.execute(
        `INSERT INTO auth_identities (
           id, user_id, provider, provider_subject, union_subject, last_login_at
         ) VALUES (?, ?, 'wechat_miniprogram', ?, ?, UTC_TIMESTAMP(3))`,
        [
          input.identityId,
          input.userId,
          Buffer.from(input.identitySubject),
          input.unionSubject ? Buffer.from(input.unionSubject) : null,
        ],
      );
      await connection.commit();

      return {
        id: input.userId,
        displayName: input.defaultDisplayName,
        avatarUrl: null,
      };
    } catch (error) {
      await connection.rollback();

      if (this.isDuplicateError(error)) {
        const racedUser = await this.findUserByIdentity(input.identitySubject);
        if (racedUser) return racedUser;
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  async findUserById(userId: string): Promise<UserSummary | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, display_name
       FROM users
       WHERE id = ? AND status = 'active'`,
      [userId],
    );

    return rows[0] ? toUserSummary(rows[0]) : null;
  }

  async createSession(input: {
    sessionId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceLabel: string | null;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO user_sessions (
         id, user_id, refresh_token_hash, device_label, expires_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [
        input.sessionId,
        input.userId,
        input.refreshTokenHash,
        input.deviceLabel,
        input.expiresAt,
      ],
    );
  }

  async findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<StoredSession | null> {
    const [rows] = await this.pool.query<SessionRow[]>(
      `SELECT
         s.id AS session_id,
         s.expires_at,
         u.id,
         u.display_name
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND u.status = 'active'`,
      [refreshTokenHash],
    );
    const row = rows[0];

    return row
      ? {
          id: row.session_id,
          user: toUserSummary(row),
          expiresAt: row.expires_at,
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
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE user_sessions
         SET revoked_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL
           AND expires_at > UTC_TIMESTAMP(3)`,
        [input.previousSessionId, input.userId],
      );

      if (updateResult.affectedRows !== 1) {
        throw new AppError({
          statusCode: 401,
          code: "SESSION_EXPIRED",
          message: "登录状态已失效，请重新登录",
        });
      }

      await connection.execute(
        `INSERT INTO user_sessions (
           id, user_id, refresh_token_hash, device_label, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          input.nextSessionId,
          input.userId,
          input.refreshTokenHash,
          input.deviceLabel,
          input.expiresAt,
        ],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1
       FROM user_sessions
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP(3)
       LIMIT 1`,
      [sessionId, userId],
    );

    return rows.length === 1;
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.pool.execute(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
       WHERE id = ? AND user_id = ?`,
      [sessionId, userId],
    );
  }

  async listForUser(userId: string): Promise<KitchenSummary[]> {
    const [rows] = await this.pool.query<KitchenRow[]>(
      `SELECT
         k.id,
         k.name,
         k.icon,
         km.membership_role,
         (
           SELECT COUNT(*)
           FROM kitchen_members active_members
           WHERE active_members.kitchen_id = k.id
             AND active_members.left_at IS NULL
         ) AS member_count
       FROM kitchen_members km
       INNER JOIN kitchens k ON k.id = km.kitchen_id
       WHERE km.user_id = ?
         AND km.left_at IS NULL
         AND k.deleted_at IS NULL
       ORDER BY km.joined_at ASC`,
      [userId],
    );

    return rows.map(toKitchenSummary);
  }

  async createWithOwner(input: {
    kitchenId: string;
    ownerUserId: string;
    name: string;
    icon: string;
  }): Promise<KitchenDetail> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO kitchens (id, name, icon, owner_user_id)
         VALUES (?, ?, ?, ?)`,
        [input.kitchenId, input.name, input.icon, input.ownerUserId],
      );
      await connection.execute(
        `INSERT INTO kitchen_members (
           kitchen_id, user_id, membership_role, joined_at
         ) VALUES (?, ?, 'owner', UTC_TIMESTAMP(3))`,
        [input.kitchenId, input.ownerUserId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const detail = await this.findDetailForMember(
      input.kitchenId,
      input.ownerUserId,
    );

    if (!detail) throw new Error("创建厨房后无法读取厨房数据");
    return detail;
  }

  async findDetailForMember(
    kitchenId: string,
    userId: string,
  ): Promise<KitchenDetail | null> {
    const [kitchenRows] = await this.pool.query<KitchenRow[]>(
      `SELECT
         k.id,
         k.name,
         k.icon,
         viewer.membership_role,
         (
           SELECT COUNT(*)
           FROM kitchen_members active_members
           WHERE active_members.kitchen_id = k.id
             AND active_members.left_at IS NULL
         ) AS member_count
       FROM kitchens k
       INNER JOIN kitchen_members viewer
         ON viewer.kitchen_id = k.id
        AND viewer.user_id = ?
        AND viewer.left_at IS NULL
       WHERE k.id = ? AND k.deleted_at IS NULL`,
      [userId, kitchenId],
    );
    const kitchenRow = kitchenRows[0];

    if (!kitchenRow) return null;

    const [memberRows] = await this.pool.query<KitchenMemberRow[]>(
      `SELECT
         u.id AS user_id,
         u.display_name,
         km.nickname,
         km.membership_role,
         km.joined_at
       FROM kitchen_members km
       INNER JOIN users u ON u.id = km.user_id
       WHERE km.kitchen_id = ? AND km.left_at IS NULL
       ORDER BY km.joined_at ASC`,
      [kitchenId],
    );

    const members: KitchenMember[] = memberRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: null,
      nickname: row.nickname,
      role: toRole(row.membership_role),
      joinedAt: row.joined_at.toISOString(),
    }));

    return {
      ...toKitchenSummary(kitchenRow),
      members,
    };
  }

  async updateByOwner(input: {
    kitchenId: string;
    ownerUserId: string;
    name: string;
    icon: string;
  }): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE kitchens
       SET name = ?, icon = ?, version = version + 1
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
      [input.name, input.icon, input.kitchenId, input.ownerUserId],
    );
    return result.affectedRows === 1;
  }

  async removeMemberByOwner(input: {
    kitchenId: string;
    ownerUserId: string;
    memberUserId: string;
  }): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE kitchen_members target
       INNER JOIN kitchens kitchen ON kitchen.id = target.kitchen_id
       SET target.left_at = UTC_TIMESTAMP(3)
       WHERE target.kitchen_id = ?
         AND target.user_id = ?
         AND target.membership_role = 'member'
         AND target.left_at IS NULL
         AND kitchen.owner_user_id = ?
         AND kitchen.deleted_at IS NULL`,
      [input.kitchenId, input.memberUserId, input.ownerUserId],
    );
    return result.affectedRows === 1;
  }

  async leaveAsMember(kitchenId: string, userId: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE kitchen_members
       SET left_at = UTC_TIMESTAMP(3)
       WHERE kitchen_id = ?
         AND user_id = ?
         AND membership_role = 'member'
         AND left_at IS NULL`,
      [kitchenId, userId],
    );
    return result.affectedRows === 1;
  }

  async deleteByOwner(
    kitchenId: string,
    ownerUserId: string,
  ): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE kitchens
         SET deleted_at = UTC_TIMESTAMP(3), version = version + 1
         WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
        [kitchenId, ownerUserId],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.execute(
        `UPDATE kitchen_members
         SET left_at = COALESCE(left_at, UTC_TIMESTAMP(3))
         WHERE kitchen_id = ?`,
        [kitchenId],
      );
      await connection.execute(
        `UPDATE kitchen_invites
         SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
         WHERE kitchen_id = ?`,
        [kitchenId],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await this.rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }
  }

  async createInvite(input: {
    inviteId: string;
    kitchenId: string;
    actorUserId: string;
    codeHash: string;
    expiresAt: Date;
    maxUses: number;
  }): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO kitchen_invites (
         id, kitchen_id, code_hash, created_by, expires_at, max_uses
       )
       SELECT ?, ?, ?, ?, ?, ?
       FROM kitchen_members
       WHERE kitchen_id = ? AND user_id = ? AND left_at IS NULL`,
      [
        input.inviteId,
        input.kitchenId,
        input.codeHash,
        input.actorUserId,
        input.expiresAt,
        input.maxUses,
        input.kitchenId,
        input.actorUserId,
      ],
    );

    if (result.affectedRows !== 1) {
      throw new AppError({
        statusCode: 403,
        code: "KITCHEN_ACCESS_DENIED",
        message: "你不是这个厨房的成员",
      });
    }
  }

  async findInvitePreviewByHash(
    codeHash: string,
    now: Date,
  ): Promise<KitchenInvitePreview | null> {
    const [rows] = await this.pool.query<InvitePreviewRow[]>(
      `SELECT
         k.name AS kitchen_name,
         k.icon AS kitchen_icon,
         i.expires_at,
         (
           SELECT COUNT(*)
           FROM kitchen_members active_members
           WHERE active_members.kitchen_id = k.id
             AND active_members.left_at IS NULL
         ) AS member_count
       FROM kitchen_invites i
       INNER JOIN kitchens k ON k.id = i.kitchen_id
       WHERE i.code_hash = ?
         AND i.revoked_at IS NULL
         AND i.expires_at > ?
         AND i.used_count < i.max_uses
         AND k.deleted_at IS NULL`,
      [codeHash, now],
    );
    const row = rows[0];
    return row
      ? {
          kitchenName: row.kitchen_name,
          kitchenIcon: row.kitchen_icon,
          memberCount: Number(row.member_count),
          expiresAt: row.expires_at.toISOString(),
        }
      : null;
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
    const connection = await this.pool.getConnection();
    let kitchenId: string | null = null;
    let status: "joined" | "already_member" = "joined";

    try {
      await connection.beginTransaction();
      const [inviteRows] = await connection.query<InviteRow[]>(
        `SELECT
           i.id AS invite_id,
           i.kitchen_id,
           i.max_uses,
           i.used_count,
           k.member_limit
         FROM kitchen_invites i
         INNER JOIN kitchens k ON k.id = i.kitchen_id
         WHERE i.code_hash = ?
           AND i.revoked_at IS NULL
           AND i.expires_at > ?
           AND i.used_count < i.max_uses
           AND k.deleted_at IS NULL
         FOR UPDATE`,
        [input.codeHash, input.now],
      );
      const invite = inviteRows[0];

      if (!invite) {
        await connection.rollback();
        return { status: "invalid" };
      }

      kitchenId = invite.kitchen_id;
      const [existingRows] = await connection.query<ExistingMemberRow[]>(
        `SELECT left_at
         FROM kitchen_members
         WHERE kitchen_id = ? AND user_id = ?
         FOR UPDATE`,
        [kitchenId, input.userId],
      );
      const existing = existingRows[0];

      if (existing?.left_at === null) {
        status = "already_member";
        await connection.commit();
      } else {
        const [countRows] = await connection.query<CountRow[]>(
          `SELECT COUNT(*) AS member_count
           FROM kitchen_members
           WHERE kitchen_id = ? AND left_at IS NULL`,
          [kitchenId],
        );

        if (Number(countRows[0]?.member_count ?? 0) >= invite.member_limit) {
          await connection.rollback();
          return { status: "member_limit_reached" };
        }

        if (existing) {
          await connection.execute(
            `UPDATE kitchen_members
             SET left_at = NULL, joined_at = UTC_TIMESTAMP(3), membership_role = 'member'
             WHERE kitchen_id = ? AND user_id = ?`,
            [kitchenId, input.userId],
          );
        } else {
          await connection.execute(
            `INSERT INTO kitchen_members (
               kitchen_id, user_id, membership_role, joined_at
             ) VALUES (?, ?, 'member', UTC_TIMESTAMP(3))`,
            [kitchenId, input.userId],
          );
        }

        await connection.execute(
          `UPDATE kitchen_invites
           SET used_count = used_count + 1
           WHERE id = ?`,
          [invite.invite_id],
        );
        await connection.commit();
      }
    } catch (error) {
      await this.rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }

    if (!kitchenId) return { status: "invalid" };
    const kitchen = await this.findDetailForMember(kitchenId, input.userId);
    if (!kitchen) return { status: "invalid" };

    return { status, kitchen };
  }

  private async findUserByIdentity(
    identitySubject: Uint8Array,
  ): Promise<UserSummary | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT u.id, u.display_name
       FROM auth_identities identity_record
       INNER JOIN users u ON u.id = identity_record.user_id
       WHERE identity_record.provider = 'wechat_miniprogram'
         AND identity_record.provider_subject = ?
         AND u.status = 'active'`,
      [Buffer.from(identitySubject)],
    );

    return rows[0] ? toUserSummary(rows[0]) : null;
  }

  private isDuplicateError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    );
  }

  private async rollbackQuietly(connection: PoolConnection): Promise<void> {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original transaction error.
    }
  }
}
