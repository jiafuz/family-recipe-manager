import type {
  FamilyRecipeDetail,
  FamilyRecipeListItem,
  PublicRecipeDetail,
  PublicRecipeListItem,
  RecipeImport,
  RecipeImportDraft,
  RecipeImportPlatform,
  RecommendationPreferences,
  RecommendationSourceScope,
  RecommendationStrategy,
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
  ClonePublicRecipeResult,
  PublicRecipeListFilters,
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
  first_introduced_until: Date | null;
  ingredient_count: number;
  updated_at: Date;
}

interface PublicRecipeRow extends RowDataPacket {
  id: string;
  current_version_id: string;
  version_number: number;
  name: string;
  description: string | null;
  category: RecipeCategory;
  cover_emoji: string;
  cook_minutes: number | null;
  tips: string | null;
  ingredient_count: number;
  updated_at: Date;
  author_name: string;
}

interface RecipeIdRow extends RowDataPacket {
  id: string;
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

interface RecipeImportRow extends RowDataPacket {
  id: string;
  kitchen_id: string;
  source_url: string;
  source_platform: RecipeImportPlatform;
  status: "needs_review" | "completed";
  draft_snapshot: string | RecipeImportDraft;
  warnings: string | string[];
  saved_recipe_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RecommendationPreferenceRow extends RowDataPacket {
  strategy: RecommendationStrategy;
  source_scope: RecommendationSourceScope;
  item_count: number;
  collapsed: number | boolean;
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
    firstIntroducedUntil: row.first_introduced_until?.toISOString() ?? null,
    ingredientCount: Number(row.ingredient_count),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toPublicListItem(row: PublicRecipeRow): PublicRecipeListItem {
  return {
    id: row.id,
    currentVersionId: row.current_version_id,
    version: Number(row.version_number),
    name: row.name,
    description: row.description,
    category: row.category,
    coverEmoji: row.cover_emoji,
    cookMinutes: row.cook_minutes === null ? null : Number(row.cook_minutes),
    ingredientCount: Number(row.ingredient_count),
    updatedAt: row.updated_at.toISOString(),
    authorName: row.author_name,
  };
}

const recipeImportSelect = `SELECT
  id, kitchen_id, source_url, source_platform, status,
  draft_snapshot, warnings, saved_recipe_id, created_at, updated_at
FROM recipe_imports`;

function toRecipeImport(row: RecipeImportRow): RecipeImport {
  return {
    id: row.id,
    kitchenId: row.kitchen_id,
    sourceUrl: row.source_url,
    platform: row.source_platform,
    status: row.status,
    draft: parseJsonColumn<RecipeImportDraft>(row.draft_snapshot),
    warnings: parseJsonColumn<string[]>(row.warnings),
    savedRecipeId: row.saved_recipe_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseJsonColumn<T>(value: string | T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export class MysqlRecipeRepository implements RecipeRepository {
  constructor(private readonly pool: Pool) {}

  async getRecommendationPreferences(
    userId: string,
    kitchenId: string,
  ): Promise<RecommendationPreferences> {
    const [rows] = await this.pool.query<RecommendationPreferenceRow[]>(
      `SELECT strategy, source_scope, item_count, collapsed
       FROM recommendation_preferences
       WHERE user_id = ? AND kitchen_id = ?`,
      [userId, kitchenId],
    );
    const row = rows[0];
    return row
      ? {
          strategy: row.strategy,
          sourceScope: row.source_scope,
          itemCount: Number(row.item_count),
          collapsed: Boolean(row.collapsed),
        }
      : {
          strategy: "long_time_no_eat",
          sourceScope: "family_only",
          itemCount: 3,
          collapsed: false,
        };
  }

  async saveRecommendationPreferences(
    userId: string,
    kitchenId: string,
    preferences: RecommendationPreferences,
  ): Promise<RecommendationPreferences> {
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO recommendation_preferences (
         user_id, kitchen_id, strategy, source_scope, item_count, collapsed
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         strategy = VALUES(strategy),
         source_scope = VALUES(source_scope),
         item_count = VALUES(item_count),
         collapsed = VALUES(collapsed)`,
      [
        userId,
        kitchenId,
        preferences.strategy,
        preferences.sourceScope,
        preferences.itemCount,
        preferences.collapsed,
      ],
    );
    return preferences;
  }

  async createRecipeImport(
    input: Parameters<RecipeRepository["createRecipeImport"]>[0],
  ): Promise<RecipeImport> {
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO recipe_imports (
         id, kitchen_id, source_url, source_platform, status,
         draft_snapshot, warnings, created_by
       ) VALUES (?, ?, ?, ?, 'needs_review', ?, ?, ?)`,
      [
        input.id,
        input.kitchenId,
        input.sourceUrl,
        input.platform,
        JSON.stringify(input.draft),
        JSON.stringify(input.warnings),
        input.actorUserId,
      ],
    );
    const recipeImport = await this.findRecipeImport(input.id, input.kitchenId);
    if (!recipeImport) throw new Error("创建链接导入任务后无法读取");
    return recipeImport;
  }

  async findRecipeImport(
    importId: string,
    kitchenId: string,
  ): Promise<RecipeImport | null> {
    const [rows] = await this.pool.query<RecipeImportRow[]>(
      `${recipeImportSelect} WHERE id = ? AND kitchen_id = ?`,
      [importId, kitchenId],
    );
    return rows[0] ? toRecipeImport(rows[0]) : null;
  }

  async completeRecipeImport(
    input: Parameters<RecipeRepository["completeRecipeImport"]>[0],
  ): Promise<RecipeImport | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE recipe_imports
       SET status = 'completed', saved_recipe_id = ?
       WHERE id = ? AND kitchen_id = ?`,
      [input.recipeId, input.importId, input.kitchenId],
    );
    if (result.affectedRows === 0) return null;
    return this.findRecipeImport(input.importId, input.kitchenId);
  }

  async listPublicRecipes(
    filters: PublicRecipeListFilters,
  ): Promise<PublicRecipeListItem[]> {
    const conditions = [
      "r.scope = 'public'",
      "r.status = 'active'",
      "r.deleted_at IS NULL",
    ];
    const parameters: unknown[] = [];
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
    const [rows] = await this.pool.query<PublicRecipeRow[]>(
      `${this.basePublicRecipeSelect()}
       WHERE ${conditions.join(" AND ")}
       GROUP BY r.id, current_version.id, author.id
       ORDER BY r.updated_at DESC, r.id DESC`,
      parameters,
    );
    return rows.map(toPublicListItem);
  }

  async findPublicRecipe(recipeId: string): Promise<PublicRecipeDetail | null> {
    const [rows] = await this.pool.query<PublicRecipeRow[]>(
      `${this.basePublicRecipeSelect()}
       WHERE r.id = ? AND r.scope = 'public'
         AND r.status = 'active' AND r.deleted_at IS NULL
       GROUP BY r.id, current_version.id, author.id`,
      [recipeId],
    );
    const row = rows[0];
    return row ? this.loadPublicRecipeDetail(row) : null;
  }

  async clonePublicRecipe(
    input: Parameters<RecipeRepository["clonePublicRecipe"]>[0],
  ): Promise<ClonePublicRecipeResult> {
    const source = await this.findPublicRecipe(input.publicRecipeId);
    if (!source) return { status: "not_found" };
    const existing = await this.findFamilyRecipeBySource(
      input.kitchenId,
      input.publicRecipeId,
    );
    if (existing) return { status: "already_cloned", recipe: existing };

    const connection = await this.pool.getConnection();
    const data: SaveFamilyRecipeInput = {
      name: source.name,
      description: source.description,
      category: source.category,
      coverEmoji: source.coverEmoji,
      cookMinutes: source.cookMinutes,
      tips: source.tips,
      orderingState: input.orderingState,
      ingredients: source.ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category,
      })),
      steps: source.steps.map((step) => ({
        instruction: step.instruction,
      })),
    };

    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO recipes (
           id, scope, kitchen_id, source_recipe_id, current_version_id, status
         ) VALUES (?, 'family', ?, ?, NULL, 'active')`,
        [input.entities.recipeId, input.kitchenId, input.publicRecipeId],
      );
      await this.insertVersion(connection, {
        recipeId: input.entities.recipeId,
        versionId: input.entities.versionId,
        versionNumber: 1,
        actorUserId: input.actorUserId,
        data,
        ingredientIds: input.entities.ingredientIds,
        stepIds: input.entities.stepIds,
        changeNote: `从菜谱广场收录：${source.authorName}`,
      });
      await connection.execute(
        `INSERT INTO family_recipe_settings (
           recipe_id, ordering_state, first_introduced_until, updated_by
         ) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 DAY), ?)`,
        [input.entities.recipeId, input.orderingState, input.actorUserId],
      );
      await connection.execute(
        `UPDATE recipes SET current_version_id = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [input.entities.versionId, input.entities.recipeId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (this.isDuplicateError(error)) {
        const raced = await this.findFamilyRecipeBySource(
          input.kitchenId,
          input.publicRecipeId,
        );
        if (raced) return { status: "already_cloned", recipe: raced };
      }
      throw error;
    } finally {
      connection.release();
    }

    const recipe = await this.findFamilyRecipe(
      input.entities.recipeId,
      input.kitchenId,
    );
    if (!recipe) throw new Error("收录菜谱后无法读取家庭版本");
    return { status: "created", recipe };
  }

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
       GROUP BY r.id, current_version.id, settings.ordering_state,
                settings.first_introduced_until
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
       GROUP BY r.id, current_version.id, settings.ordering_state,
                settings.first_introduced_until`,
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
         settings.first_introduced_until,
         COUNT(ingredient.id) AS ingredient_count,
         selected_version.created_at AS updated_at
       FROM recipes r
       INNER JOIN recipe_versions selected_version
         ON selected_version.recipe_id = r.id AND selected_version.id = ?
       INNER JOIN family_recipe_settings settings ON settings.recipe_id = r.id
       LEFT JOIN recipe_ingredients ingredient
         ON ingredient.recipe_version_id = selected_version.id
       WHERE r.id = ? AND r.kitchen_id = ? AND r.scope = 'family'
       GROUP BY r.id, selected_version.id, settings.ordering_state,
                settings.first_introduced_until`,
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

  private async loadPublicRecipeDetail(
    row: PublicRecipeRow,
  ): Promise<PublicRecipeDetail> {
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
    return {
      ...toPublicListItem(row),
      tips: row.tips,
      ingredients: ingredientRows[0].map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.display_name,
        quantity:
          ingredient.quantity === null ? null : Number(ingredient.quantity),
        unit: ingredient.unit,
        category: ingredient.category,
        sortOrder: Number(ingredient.sort_order),
      })),
      steps: stepRows[0].map((step) => ({
        id: step.id,
        instruction: step.instruction,
        stepNumber: Number(step.step_number),
      })),
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
      settings.first_introduced_until,
      COUNT(ingredient.id) AS ingredient_count,
      r.updated_at
    FROM recipes r
    INNER JOIN recipe_versions current_version
      ON current_version.id = r.current_version_id
    INNER JOIN family_recipe_settings settings ON settings.recipe_id = r.id
    LEFT JOIN recipe_ingredients ingredient
      ON ingredient.recipe_version_id = current_version.id`;
  }

  private basePublicRecipeSelect(): string {
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
      COUNT(ingredient.id) AS ingredient_count,
      r.updated_at,
      author.display_name AS author_name
    FROM recipes r
    INNER JOIN recipe_versions current_version
      ON current_version.id = r.current_version_id
    INNER JOIN users author ON author.id = current_version.created_by
    LEFT JOIN recipe_ingredients ingredient
      ON ingredient.recipe_version_id = current_version.id`;
  }

  private async findFamilyRecipeBySource(
    kitchenId: string,
    sourceRecipeId: string,
  ): Promise<FamilyRecipeDetail | null> {
    const [rows] = await this.pool.query<RecipeIdRow[]>(
      `SELECT id
       FROM recipes
       WHERE kitchen_id = ? AND source_recipe_id = ?
         AND scope = 'family' AND status = 'active'
         AND deleted_at IS NULL
       LIMIT 1`,
      [kitchenId, sourceRecipeId],
    );
    return rows[0] ? this.findFamilyRecipe(rows[0].id, kitchenId) : null;
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

  private isDuplicateError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    );
  }
}
