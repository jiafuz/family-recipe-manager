import type {
  MealPlanDetail,
  MealPlanItem,
  MealType,
  ProcurementItemResponse,
  ProcurementList,
} from "@jiayan/contracts";
import { deriveProcurementItems, type IngredientSource } from "@jiayan/domain";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { ulid } from "ulid";

import type { MealPlanRepository, SaveMealPlanResult } from "./repository";

interface PlanRow extends RowDataPacket {
  id: string;
  kitchen_id: string;
  meal_date: Date | string;
  meal_type: MealType;
  meal_note: string | null;
  status: "planned" | "completed";
  version: number;
  updated_at: Date;
}

interface PlanItemRow extends RowDataPacket {
  id: string;
  recipe_id: string;
  recipe_version_id: string;
  recipe_name: string;
  cover_emoji: string;
  quantity: number;
  taste_note: string | null;
  ordered_by_id: string;
  ordered_by_name: string;
  ordered_at: Date;
}

interface IngredientSourceRow extends RowDataPacket {
  meal_plan_id: string;
  meal_item_id: string;
  recipe_ingredient_id: string;
  meal_type: MealType;
  recipe_name: string;
  ingredient_name: string;
  category: string;
  ingredient_quantity: string | number | null;
  meal_quantity: number;
  unit: string | null;
}

interface ProcurementRow extends RowDataPacket {
  id: string;
  ingredient_key: string;
  display_name: string;
  category: string;
  total_quantity: string | number | null;
  unit: string | null;
  needed: number | boolean;
  calculated_revision: number;
}

interface ProcurementSourceRow extends RowDataPacket {
  procurement_item_id: string;
  meal_plan_id: string;
  meal_item_id: string;
  meal_type: MealType;
  recipe_name: string;
  ingredient_name: string;
  quantity: string | number | null;
  unit: string | null;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface RevisionRow extends RowDataPacket {
  revision: number | null;
}

export class MysqlMealPlanRepository implements MealPlanRepository {
  constructor(private readonly pool: Pool) {}

  async listMealPlans(
    kitchenId: string,
    from: string,
    to: string,
  ): Promise<MealPlanDetail[]> {
    const [rows] = await this.pool.query<PlanRow[]>(
      `SELECT id, kitchen_id, meal_date, meal_type, meal_note, status,
              version, updated_at
       FROM meal_plans
       WHERE kitchen_id = ? AND meal_date BETWEEN ? AND ?
       ORDER BY meal_date ASC,
         FIELD(meal_type, 'breakfast', 'lunch', 'dinner') ASC`,
      [kitchenId, from, to],
    );
    const details = await Promise.all(
      rows.map((row) =>
        this.findMealPlan(kitchenId, formatDate(row.meal_date), row.meal_type),
      ),
    );
    return details.filter((detail): detail is MealPlanDetail =>
      Boolean(detail),
    );
  }

  async findMealPlan(
    kitchenId: string,
    date: string,
    mealType: MealType,
  ): Promise<MealPlanDetail | null> {
    const [rows] = await this.pool.query<PlanRow[]>(
      `SELECT id, kitchen_id, meal_date, meal_type, meal_note, status,
              version, updated_at
       FROM meal_plans
       WHERE kitchen_id = ? AND meal_date = ? AND meal_type = ?`,
      [kitchenId, date, mealType],
    );
    const row = rows[0];
    if (!row) return null;
    const items = await this.loadPlanItems(this.pool, row.id);
    return toPlanDetail(row, items);
  }

  async findMealPlanById(mealPlanId: string): Promise<MealPlanDetail | null> {
    const [rows] = await this.pool.query<PlanRow[]>(
      `SELECT id, kitchen_id, meal_date, meal_type, meal_note, status,
              version, updated_at
       FROM meal_plans
       WHERE id = ?`,
      [mealPlanId],
    );
    const row = rows[0];
    if (!row) return null;
    const items = await this.loadPlanItems(this.pool, row.id);
    return toPlanDetail(row, items);
  }

  async saveMealPlan(
    input: Parameters<MealPlanRepository["saveMealPlan"]>[0],
  ): Promise<SaveMealPlanResult> {
    const connection = await this.pool.getConnection();
    let mealPlanId = input.mealPlanId;
    let nextVersion = 1;

    try {
      await connection.beginTransaction();
      const [planRows] = await connection.query<PlanRow[]>(
        `SELECT id, kitchen_id, meal_date, meal_type, meal_note, status,
                version, updated_at
         FROM meal_plans
         WHERE kitchen_id = ? AND meal_date = ? AND meal_type = ?
         FOR UPDATE`,
        [input.kitchenId, input.date, input.mealType],
      );
      const existing = planRows[0];
      const currentVersion = existing ? Number(existing.version) : 0;
      if (existing?.status === "completed") {
        await connection.rollback();
        return { status: "completed" };
      }
      if (currentVersion !== input.data.version) {
        await connection.rollback();
        return { status: "version_conflict", currentVersion };
      }

      const beforeItems = existing
        ? await this.loadPlanItems(connection, existing.id)
        : [];
      if (!(await this.recipesAreValid(connection, input, beforeItems))) {
        await connection.rollback();
        return { status: "invalid_recipe" };
      }

      mealPlanId = existing?.id ?? input.mealPlanId;
      nextVersion = currentVersion + 1;

      if (existing) {
        await connection.execute(
          `UPDATE meal_plans
           SET meal_note = ?, version = ?, updated_at = UTC_TIMESTAMP(3)
           WHERE id = ?`,
          [input.data.mealNote, nextVersion, mealPlanId],
        );
        await connection.execute(
          `UPDATE meal_items SET deleted_at = UTC_TIMESTAMP(3)
           WHERE meal_plan_id = ? AND deleted_at IS NULL`,
          [mealPlanId],
        );
      } else {
        await connection.execute(
          `INSERT INTO meal_plans (
             id, kitchen_id, meal_date, meal_type, meal_note, status, version
           ) VALUES (?, ?, ?, ?, ?, 'planned', 1)`,
          [
            mealPlanId,
            input.kitchenId,
            input.date,
            input.mealType,
            input.data.mealNote,
          ],
        );
      }

      for (const [index, item] of input.data.items.entries()) {
        let retained = false;
        if (item.itemId && existing) {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE meal_items
             SET recipe_id = ?, recipe_version_id = ?, quantity = ?,
                 taste_note = ?, sort_order = ?, deleted_at = NULL
             WHERE id = ? AND meal_plan_id = ?`,
            [
              item.recipeId,
              item.recipeVersionId,
              item.quantity,
              item.tasteNote,
              index,
              item.itemId,
              mealPlanId,
            ],
          );
          retained = result.affectedRows === 1;
        }
        if (!retained) {
          await connection.execute(
            `INSERT INTO meal_items (
               id, meal_plan_id, recipe_id, recipe_version_id, quantity,
               taste_note, ordered_by, ordered_at, sort_order
             ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?)`,
            [
              input.newItemIds[index]!,
              mealPlanId,
              item.recipeId,
              item.recipeVersionId,
              item.quantity,
              item.tasteNote,
              input.actorUserId,
              index,
            ],
          );
        }
      }

      const afterItems = await this.loadPlanItems(connection, mealPlanId);
      await connection.execute(
        `INSERT INTO meal_plan_revisions (
           id, meal_plan_id, version, actor_user_id, action,
           before_snapshot, after_snapshot
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.revisionId,
          mealPlanId,
          nextVersion,
          input.actorUserId,
          existing ? "replace_menu" : "create_menu",
          existing ? JSON.stringify({ items: beforeItems }) : null,
          JSON.stringify({ mealNote: input.data.mealNote, items: afterItems }),
        ],
      );

      const procurementRevision = await this.recalculateProcurement(
        connection,
        input.kitchenId,
        input.date,
      );
      await connection.commit();

      const mealPlan = await this.findMealPlan(
        input.kitchenId,
        input.date,
        input.mealType,
      );
      if (!mealPlan) throw new Error("保存菜单后无法读取菜单数据");
      return {
        status: "saved",
        data: { mealPlan, procurementRevision },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getProcurementList(
    kitchenId: string,
    date: string,
  ): Promise<ProcurementList> {
    const [rows] = await this.pool.query<ProcurementRow[]>(
      `SELECT id, ingredient_key, display_name, category, total_quantity,
              unit, needed, calculated_revision
       FROM procurement_items
       WHERE kitchen_id = ? AND procurement_date = ?
       ORDER BY category ASC, display_name ASC`,
      [kitchenId, date],
    );
    if (rows.length === 0) {
      return { kitchenId, date, revision: 0, items: [] };
    }
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const [sourceRows] = await this.pool.query<ProcurementSourceRow[]>(
      `SELECT
         source.procurement_item_id,
         source.meal_plan_id,
         source.meal_item_id,
         plan.meal_type,
         recipe_version.name AS recipe_name,
         ingredient.display_name AS ingredient_name,
         source.quantity,
         ingredient.unit
       FROM procurement_item_sources source
       INNER JOIN meal_plans plan ON plan.id = source.meal_plan_id
       INNER JOIN meal_items meal_item ON meal_item.id = source.meal_item_id
       INNER JOIN recipe_versions recipe_version
         ON recipe_version.id = meal_item.recipe_version_id
       INNER JOIN recipe_ingredients ingredient
         ON ingredient.id = source.recipe_ingredient_id
       WHERE source.procurement_item_id IN (${placeholders})
       ORDER BY FIELD(plan.meal_type, 'breakfast', 'lunch', 'dinner'),
                recipe_version.name`,
      ids,
    );
    const sourceGroups = new Map<string, ProcurementSourceRow[]>();
    for (const source of sourceRows) {
      const group = sourceGroups.get(source.procurement_item_id) ?? [];
      group.push(source);
      sourceGroups.set(source.procurement_item_id, group);
    }
    const items: ProcurementItemResponse[] = rows.map((row) => ({
      id: row.id,
      ingredientKey: row.ingredient_key,
      displayName: row.display_name,
      category: row.category,
      totalQuantity:
        row.total_quantity === null ? null : Number(row.total_quantity),
      unit: row.unit,
      needed: Boolean(row.needed),
      sources: (sourceGroups.get(row.id) ?? []).map((source) => ({
        mealPlanId: source.meal_plan_id,
        mealItemId: source.meal_item_id,
        mealType: source.meal_type,
        recipeName: source.recipe_name,
        ingredientName: source.ingredient_name,
        quantity: source.quantity === null ? null : Number(source.quantity),
        unit: source.unit,
      })),
    }));
    return {
      kitchenId,
      date,
      revision: Math.max(...rows.map((row) => Number(row.calculated_revision))),
      items,
    };
  }

  async completeMealPlan(
    input: Parameters<MealPlanRepository["completeMealPlan"]>[0],
  ): Promise<Awaited<ReturnType<MealPlanRepository["completeMealPlan"]>>> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PlanRow[]>(
        `SELECT id, kitchen_id, meal_date, meal_type, meal_note, status,
                version, updated_at
         FROM meal_plans
         WHERE kitchen_id = ? AND meal_date = ? AND meal_type = ?
         FOR UPDATE`,
        [input.kitchenId, input.date, input.mealType],
      );
      const plan = rows[0];
      if (!plan) {
        await connection.rollback();
        return { status: "not_found" };
      }
      if (plan.status === "completed") {
        await connection.commit();
        const mealPlan = await this.findMealPlan(
          input.kitchenId,
          input.date,
          input.mealType,
        );
        if (!mealPlan) return { status: "not_found" };
        return { status: "already_completed", mealPlan };
      }
      const currentVersion = Number(plan.version);
      if (currentVersion !== input.version) {
        await connection.rollback();
        return { status: "version_conflict", currentVersion };
      }
      const items = await this.loadPlanItems(connection, plan.id);
      const nextVersion = currentVersion + 1;
      await connection.execute(
        `UPDATE meal_plans
         SET status = 'completed', completed_by = ?,
             completed_at = UTC_TIMESTAMP(3), version = ?,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.actorUserId, nextVersion, plan.id],
      );
      await connection.execute(
        `INSERT INTO meal_plan_revisions (
           id, meal_plan_id, version, actor_user_id, action,
           before_snapshot, after_snapshot
         ) VALUES (?, ?, ?, ?, 'complete_meal', ?, ?)`,
        [
          input.revisionId,
          plan.id,
          nextVersion,
          input.actorUserId,
          JSON.stringify({ status: "planned", items }),
          JSON.stringify({ status: "completed", items }),
        ],
      );
      await connection.commit();
      const mealPlan = await this.findMealPlan(
        input.kitchenId,
        input.date,
        input.mealType,
      );
      if (!mealPlan) return { status: "not_found" };
      return { status: "completed", mealPlan };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProcurementItem(
    input: Parameters<MealPlanRepository["updateProcurementItem"]>[0],
  ): Promise<ProcurementList | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE procurement_items
       SET needed = ?, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND kitchen_id = ? AND procurement_date = ?`,
      [input.needed, input.itemId, input.kitchenId, input.date],
    );
    if (result.affectedRows !== 1) return null;
    return this.getProcurementList(input.kitchenId, input.date);
  }

  private async recipesAreValid(
    connection: PoolConnection,
    input: Parameters<MealPlanRepository["saveMealPlan"]>[0],
    beforeItems: MealPlanItem[],
  ): Promise<boolean> {
    const retainedItems = new Map(beforeItems.map((item) => [item.id, item]));
    for (const item of input.data.items) {
      const retained = item.itemId ? retainedItems.get(item.itemId) : undefined;
      if (
        retained?.recipeId === item.recipeId &&
        retained.recipeVersionId === item.recipeVersionId
      ) {
        continue;
      }
      const [rows] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS count
         FROM recipes recipe
         INNER JOIN recipe_versions recipe_version
           ON recipe_version.id = recipe.current_version_id
         INNER JOIN family_recipe_settings settings
           ON settings.recipe_id = recipe.id
         WHERE recipe.id = ? AND recipe_version.id = ?
           AND recipe.kitchen_id = ? AND recipe.scope = 'family'
           AND recipe.status = 'active' AND recipe.deleted_at IS NULL
           AND settings.ordering_state = 'available'`,
        [item.recipeId, item.recipeVersionId, input.kitchenId],
      );
      if (Number(rows[0]?.count ?? 0) !== 1) return false;
    }
    return true;
  }

  private async loadPlanItems(
    executor: Pool | PoolConnection,
    mealPlanId: string,
  ): Promise<MealPlanItem[]> {
    const [rows] = await executor.query<PlanItemRow[]>(
      `SELECT
         item.id,
         item.recipe_id,
         item.recipe_version_id,
           recipe_version.name AS recipe_name,
           recipe_version.cover_emoji,
         item.quantity,
         item.taste_note,
         user.id AS ordered_by_id,
         user.display_name AS ordered_by_name,
         item.ordered_at
       FROM meal_items item
         INNER JOIN recipe_versions recipe_version
           ON recipe_version.id = item.recipe_version_id
       INNER JOIN users user ON user.id = item.ordered_by
       WHERE item.meal_plan_id = ? AND item.deleted_at IS NULL
       ORDER BY item.sort_order ASC, item.ordered_at ASC`,
      [mealPlanId],
    );
    return rows.map((row) => ({
      id: row.id,
      recipeId: row.recipe_id,
      recipeVersionId: row.recipe_version_id,
      recipeName: row.recipe_name,
      coverEmoji: row.cover_emoji,
      quantity: Number(row.quantity),
      tasteNote: row.taste_note,
      orderedBy: {
        id: row.ordered_by_id,
        displayName: row.ordered_by_name,
        avatarUrl: null,
      },
      orderedAt: row.ordered_at.toISOString(),
    }));
  }

  private async recalculateProcurement(
    connection: PoolConnection,
    kitchenId: string,
    date: string,
  ): Promise<number> {
    const [previousRows] = await connection.query<ProcurementRow[]>(
      `SELECT id, ingredient_key, display_name, category, total_quantity,
              unit, needed, calculated_revision
       FROM procurement_items
       WHERE kitchen_id = ? AND procurement_date = ?
       FOR UPDATE`,
      [kitchenId, date],
    );
    const selections = new Map(
      previousRows.map((row) => [row.ingredient_key, Boolean(row.needed)]),
    );
    const [revisionRows] = await connection.query<RevisionRow[]>(
      `SELECT MAX(calculated_revision) AS revision
       FROM procurement_items
       WHERE kitchen_id = ? AND procurement_date = ?`,
      [kitchenId, date],
    );
    const revision = Number(revisionRows[0]?.revision ?? 0) + 1;
    const [sourceRows] = await connection.query<IngredientSourceRow[]>(
      `SELECT
         plan.id AS meal_plan_id,
         item.id AS meal_item_id,
         ingredient.id AS recipe_ingredient_id,
         plan.meal_type,
           recipe_version.name AS recipe_name,
         ingredient.display_name AS ingredient_name,
         ingredient.category,
         ingredient.quantity AS ingredient_quantity,
         item.quantity AS meal_quantity,
         ingredient.unit
       FROM meal_plans plan
       INNER JOIN meal_items item
         ON item.meal_plan_id = plan.id AND item.deleted_at IS NULL
         INNER JOIN recipe_versions recipe_version
           ON recipe_version.id = item.recipe_version_id
         INNER JOIN recipe_ingredients ingredient
          ON ingredient.recipe_version_id = recipe_version.id
       WHERE plan.kitchen_id = ? AND plan.meal_date = ?`,
      [kitchenId, date],
    );
    const sources: IngredientSource[] = sourceRows.map((row) => ({
      mealPlanId: row.meal_plan_id,
      mealItemId: row.meal_item_id,
      recipeIngredientId: row.recipe_ingredient_id,
      mealType: row.meal_type,
      recipeName: row.recipe_name,
      ingredientName: row.ingredient_name,
      category: row.category,
      quantity:
        row.ingredient_quantity === null
          ? null
          : Number(row.ingredient_quantity) * Number(row.meal_quantity),
      unit: row.unit,
    }));
    const derived = deriveProcurementItems(sources, selections);

    await connection.execute(
      `DELETE FROM procurement_items
       WHERE kitchen_id = ? AND procurement_date = ?`,
      [kitchenId, date],
    );

    for (const item of derived) {
      const procurementItemId = ulid();
      await connection.execute(
        `INSERT INTO procurement_items (
           id, kitchen_id, procurement_date, ingredient_key, display_name,
           category, total_quantity, unit, needed, calculated_revision
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          procurementItemId,
          kitchenId,
          date,
          item.ingredientKey,
          item.displayName,
          item.category,
          item.totalQuantity,
          item.unit,
          item.needed,
          revision,
        ],
      );
      for (const source of item.sources) {
        await connection.execute(
          `INSERT INTO procurement_item_sources (
             procurement_item_id, meal_plan_id, meal_item_id,
             recipe_ingredient_id, quantity
           ) VALUES (?, ?, ?, ?, ?)`,
          [
            procurementItemId,
            source.mealPlanId!,
            source.mealItemId,
            source.recipeIngredientId!,
            source.quantity,
          ],
        );
      }
    }
    return revision;
  }
}

function toPlanDetail(row: PlanRow, items: MealPlanItem[]): MealPlanDetail {
  return {
    id: row.id,
    kitchenId: row.kitchen_id,
    mealDate: formatDate(row.meal_date),
    mealType: row.meal_type,
    mealNote: row.meal_note,
    status: row.status,
    version: Number(row.version),
    items,
    updatedAt: row.updated_at.toISOString(),
  };
}

function formatDate(value: Date | string): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
