import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  RecipeCategory,
  RecipeIngredient,
  RecipeOrderingState,
  RecipeStep,
  SaveFamilyRecipeInput,
} from "@jiayan/contracts";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import type {
  RecipeListFilters,
  RecipeRepository,
  UpdateRecipeResult,
} from "./repository";

interface RecipeRow extends RowDataPacket {
  id: string;
  current_version_id: string;
  version_number: number;
  name: string;
  description: string | null;
  category: RecipeCategory;
  cover_emoji: string;
  cook_minutes: number | null;
  tips: string | null;
  ordering_state: RecipeOrderingState;
  ingredient_count: number;
  updated_at: Date;
}

interface IngredientRow extends RowDataPacket {
  id: string;
  display_name: string;
  quantity: string | number | null;
  unit: string | null;
  category: string;
  sort_order: number;
}

interface StepRow extends RowDataPacket {
  id: string;
  instruction: string;
  step_number: number;
}

interface VersionRow extends RowDataPacket {
  version_number: number;
}

function toListItem(row: RecipeRow): FamilyRecipeListItem {
  return {
    id: row.id,
    currentVersionId: row.current_version_id,
    version: Number(row.version_number),
    name: row.name,
    description: row.description,
    category: row.category,
    coverEmoji: row.cover_emoji,
    cookMinutes: row.cook_minutes === null ? null : Number(row.cook_minutes),
    orderingState: row.ordering_state,
    ingredientCount: Number(row.ingredient_count),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class MysqlRecipeRepository implements RecipeRepository {
  constructor(private readonly pool: Pool) {}

  async listFamilyRecipes(
    kitchenId: string,
    filters: RecipeListFilters,
  ): Promise<FamilyRecipeListItem[]> {
    const conditions = [
      "r.kitchen_id = ?",
      "r.scope = 'family'",
      "r.status = 'active'",
      "r.deleted_at IS NULL",
    ];
    const parameters: unknown[] = [kitchenId];

    if (filters.orderingState) {
      conditions.push("settings.ordering_state = ?");
      parameters.push(filters.orderingState);
    }
    if (filters.category) {
      conditions.push("current_version.category = ?");
      parameters.push(filters.category);
    }
    if (filters.search?.trim()) {
      conditions.push(`(
        current_version.name LIKE ? OR current_version.description LIKE ? OR EXISTS (
          SELECT 1 FROM recipe_ingredients search_ingredient
          WHERE search_ingredient.recipe_version_id = current_version.id
            AND search_ingredient.display_name LIKE ?
        )
      )`);
      const pattern = `%${filters.search.trim()}%`;
      parameters.push(pattern, pattern, pattern);
    }

    const [rows] = await this.pool.query<RecipeRow[]>(
      `${this.baseRecipeSelect()}
       WHERE ${conditions.join(" AND ")}
       GROUP BY r.id, current_version.id, settings.ordering_state
       ORDER BY r.updated_at DESC, r.id DESC`,
      parameters,
    );

    return rows.map(toListItem);
  }

  async findFamilyRecipe(
    recipeId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null> {
    const [rows] = await this.pool.query<RecipeRow[]>(
      `${this.baseRecipeSelect()}
       WHERE r.id = ? AND r.kitchen_id = ?
         AND r.scope = 'family' AND r.status = 'active'
         AND r.deleted_at IS NULL
       GROUP BY r.id, current_version.id, settings.ordering_state`,
      [recipeId, kitchenId],
    );
    const row = rows[0];
    if (!row) return null;

    return this.loadRecipeDetail(row);
  }

  async findFamilyRecipeVersion(
    recipeId: string,
    recipeVersionId: string,
    kitchenId: string,
  ): Promise<FamilyRecipeDetail | null> {
    const [rows] = await this.pool.query<RecipeRow[]>(
      `SELECT
         r.id,
         selected_version.id AS current_version_id,
         selected_version.version_number,
         selected_version.name,
         selected_version.description,
         selected_version.category,
         selected_version.cover_emoji,
         selected_version.cook_minutes,
         selected_version.tips,
         settings.ordering_state,
         COUNT(ingredient.id) AS ingredient_count,
         selected_version.created_at AS updated_at
       FROM recipes r
       INNER JOIN recipe_versions selected_version
         ON selected_version.recipe_id = r.id AND selected_version.id = ?
       INNER JOIN family_recipe_settings settings ON settings.recipe_id = r.id
       LEFT JOIN recipe_ingredients ingredient
         ON ingredient.recipe_version_id = selected_version.id
       WHERE r.id = ? AND r.kitchen_id = ? AND r.scope = 'family'
       GROUP BY r.id, selected_version.id, settings.ordering_state`,
      [recipeVersionId, recipeId, kitchenId],
    );
    const row = rows[0];
    return row ? this.loadRecipeDetail(row) : null;
  }

  private async loadRecipeDetail(row: RecipeRow): Promise<FamilyRecipeDetail> {
    const [ingredientRows, stepRows] = await Promise.all([
      this.pool.query<IngredientRow[]>(
        `SELECT id, display_name, quantity, unit, category, sort_order
         FROM recipe_ingredients
         WHERE recipe_version_id = ?
         ORDER BY sort_order ASC`,
        [row.current_version_id],
      ),
      this.pool.query<StepRow[]>(
        `SELECT id, instruction, step_number
         FROM recipe_steps
         WHERE recipe_version_id = ?
         ORDER BY step_number ASC`,
        [row.current_version_id],
      ),
    ]);

    const ingredients: RecipeIngredient[] = ingredientRows[0].map(
      (ingredient) => ({
        id: ingredient.id,
        name: ingredient.display_name,
        quantity:
          ingredient.quantity === null ? null : Number(ingredient.quantity),
        unit: ingredient.unit,
        category: ingredient.category,
        sortOrder: Number(ingredient.sort_order),
      }),
    );
    const steps: RecipeStep[] = stepRows[0].map((step) => ({
      id: step.id,
      instruction: step.instruction,
      stepNumber: Number(step.step_number),
    }));

    return {
      ...toListItem(row),
      tips: row.tips,
      ingredients,
      steps,
    };
  }

  async createFamilyRecipe(
    input: Parameters<RecipeRepository["createFamilyRecipe"]>[0],
  ): Promise<FamilyRecipeDetail> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO recipes (
           id, scope, kitchen_id, current_version_id, status
         ) VALUES (?, 'family', ?, NULL, 'active')`,
        [input.entities.recipeId, input.kitchenId],
      );
      await this.insertVersion(connection, {
        recipeId: input.entities.recipeId,
        versionId: input.entities.versionId,
        versionNumber: 1,
        actorUserId: input.actorUserId,
        data: input.data,
        ingredientIds: input.entities.ingredientIds,
        stepIds: input.entities.stepIds,
        changeNote: "创建家庭菜谱",
      });
      await connection.execute(
        `INSERT INTO family_recipe_settings (
           recipe_id, ordering_state, updated_by
         ) VALUES (?, ?, ?)`,
        [input.entities.recipeId, input.data.orderingState, input.actorUserId],
      );
      await connection.execute(
        `UPDATE recipes SET current_version_id = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.entities.versionId, input.entities.recipeId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const recipe = await this.findFamilyRecipe(
      input.entities.recipeId,
      input.kitchenId,
    );
    if (!recipe) throw new Error("创建菜谱后无法读取菜谱数据");
    return recipe;
  }

  async updateFamilyRecipe(
    input: Parameters<RecipeRepository["updateFamilyRecipe"]>[0],
  ): Promise<UpdateRecipeResult> {
    const connection = await this.pool.getConnection();
    let nextVersion = input.data.expectedVersion + 1;

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<VersionRow[]>(
        `SELECT current_version.version_number
         FROM recipes r
         INNER JOIN recipe_versions current_version
           ON current_version.id = r.current_version_id
         WHERE r.id = ? AND r.kitchen_id = ?
           AND r.scope = 'family' AND r.status = 'active'
           AND r.deleted_at IS NULL
         FOR UPDATE`,
        [input.recipeId, input.kitchenId],
      );
      const current = rows[0];
      if (!current) {
        await connection.rollback();
        return { status: "not_found" };
      }
      if (Number(current.version_number) !== input.data.expectedVersion) {
        await connection.rollback();
        return {
          status: "version_conflict",
          currentVersion: Number(current.version_number),
        };
      }

      nextVersion = Number(current.version_number) + 1;
      await this.insertVersion(connection, {
        recipeId: input.recipeId,
        versionId: input.entities.versionId,
        versionNumber: nextVersion,
        actorUserId: input.actorUserId,
        data: input.data,
        ingredientIds: input.entities.ingredientIds,
        stepIds: input.entities.stepIds,
        changeNote: input.data.changeNote,
      });
      await connection.execute(
        `UPDATE recipes SET current_version_id = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.entities.versionId, input.recipeId],
      );
      await connection.execute(
        `UPDATE family_recipe_settings
         SET ordering_state = ?, updated_by = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE recipe_id = ?`,
        [input.data.orderingState, input.actorUserId, input.recipeId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const recipe = await this.findFamilyRecipe(input.recipeId, input.kitchenId);
    return recipe ? { status: "updated", recipe } : { status: "not_found" };
  }

  async updateOrderingState(
    input: Parameters<RecipeRepository["updateOrderingState"]>[0],
  ): Promise<FamilyRecipeDetail | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE family_recipe_settings settings
       INNER JOIN recipes r ON r.id = settings.recipe_id
       SET settings.ordering_state = ?, settings.updated_by = ?,
           settings.updated_at = UTC_TIMESTAMP(3),
           r.updated_at = UTC_TIMESTAMP(3)
       WHERE r.id = ? AND r.kitchen_id = ?
         AND r.scope = 'family' AND r.status = 'active'
         AND r.deleted_at IS NULL`,
      [input.orderingState, input.actorUserId, input.recipeId, input.kitchenId],
    );
    if (result.affectedRows === 0) return null;
    return this.findFamilyRecipe(input.recipeId, input.kitchenId);
  }

  async archiveFamilyRecipe(
    recipeId: string,
    kitchenId: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE recipes
       SET status = 'archived', deleted_at = UTC_TIMESTAMP(3),
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND kitchen_id = ? AND scope = 'family'
         AND status = 'active' AND deleted_at IS NULL`,
      [recipeId, kitchenId],
    );
    return result.affectedRows === 1;
  }

  private baseRecipeSelect(): string {
    return `SELECT
      r.id,
      current_version.id AS current_version_id,
      current_version.version_number,
      current_version.name,
      current_version.description,
      current_version.category,
      current_version.cover_emoji,
      current_version.cook_minutes,
      current_version.tips,
      settings.ordering_state,
      COUNT(ingredient.id) AS ingredient_count,
      r.updated_at
    FROM recipes r
    INNER JOIN recipe_versions current_version
      ON current_version.id = r.current_version_id
    INNER JOIN family_recipe_settings settings ON settings.recipe_id = r.id
    LEFT JOIN recipe_ingredients ingredient
      ON ingredient.recipe_version_id = current_version.id`;
  }

  private async insertVersion(
    connection: PoolConnection,
    input: {
      recipeId: string;
      versionId: string;
      versionNumber: number;
      actorUserId: string;
      data: SaveFamilyRecipeInput;
      ingredientIds: string[];
      stepIds: string[];
      changeNote: string | null;
    },
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO recipe_versions (
         id, recipe_id, version_number, name, description, category,
         cover_emoji, cook_minutes, tips, created_by, change_note
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.versionId,
        input.recipeId,
        input.versionNumber,
        input.data.name,
        input.data.description,
        input.data.category,
        input.data.coverEmoji,
        input.data.cookMinutes,
        input.data.tips,
        input.actorUserId,
        input.changeNote,
      ],
    );

    for (const [index, ingredient] of input.data.ingredients.entries()) {
      await connection.execute(
        `INSERT INTO recipe_ingredients (
           id, recipe_version_id, display_name, quantity, unit,
           category, optional, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, FALSE, ?)`,
        [
          input.ingredientIds[index]!,
          input.versionId,
          ingredient.name,
          ingredient.quantity,
          ingredient.unit,
          ingredient.category,
          index,
        ],
      );
    }

    for (const [index, step] of input.data.steps.entries()) {
      await connection.execute(
        `INSERT INTO recipe_steps (
           id, recipe_version_id, step_number, instruction
         ) VALUES (?, ?, ?, ?)`,
        [input.stepIds[index]!, input.versionId, index + 1, step.instruction],
      );
    }
  }
}
