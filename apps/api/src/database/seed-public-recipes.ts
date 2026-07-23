import type { Connection } from "mysql2/promise";

import { publicRecipeCatalog } from "../modules/recipes/public-catalog";

const catalogEditorId = "public_catalog_editor";

export async function seedPublicRecipes(connection: Connection): Promise<void> {
  await connection.beginTransaction();
  try {
    await connection.execute(
      `INSERT INTO users (id, display_name, status)
       VALUES (?, '家宴菜谱编辑部', 'active')
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
      [catalogEditorId],
    );

    for (const recipe of publicRecipeCatalog) {
      await connection.execute(
        `INSERT INTO recipes (
           id, scope, kitchen_id, source_recipe_id, current_version_id, status
         ) VALUES (?, 'public', NULL, NULL, NULL, 'active')
         ON DUPLICATE KEY UPDATE status = 'active', deleted_at = NULL`,
        [recipe.id],
      );
      await connection.execute(
        `INSERT INTO recipe_versions (
           id, recipe_id, version_number, name, description, category,
           cover_emoji, cook_minutes, tips, created_by, change_note
         ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, '初始化公共菜谱')
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           description = VALUES(description),
           category = VALUES(category),
           cover_emoji = VALUES(cover_emoji),
           cook_minutes = VALUES(cook_minutes),
           tips = VALUES(tips)`,
        [
          recipe.currentVersionId,
          recipe.id,
          recipe.name,
          recipe.description,
          recipe.category,
          recipe.coverEmoji,
          recipe.cookMinutes,
          recipe.tips,
          catalogEditorId,
        ],
      );
      await connection.execute(
        "DELETE FROM recipe_ingredients WHERE recipe_version_id = ?",
        [recipe.currentVersionId],
      );
      await connection.execute(
        "DELETE FROM recipe_steps WHERE recipe_version_id = ?",
        [recipe.currentVersionId],
      );
      for (const ingredient of recipe.ingredients) {
        await connection.execute(
          `INSERT INTO recipe_ingredients (
             id, recipe_version_id, display_name, quantity, unit,
             category, optional, sort_order
           ) VALUES (?, ?, ?, ?, ?, ?, FALSE, ?)`,
          [
            ingredient.id,
            recipe.currentVersionId,
            ingredient.name,
            ingredient.quantity,
            ingredient.unit,
            ingredient.category,
            ingredient.sortOrder,
          ],
        );
      }
      for (const step of recipe.steps) {
        await connection.execute(
          `INSERT INTO recipe_steps (
             id, recipe_version_id, step_number, instruction
           ) VALUES (?, ?, ?, ?)`,
          [step.id, recipe.currentVersionId, step.stepNumber, step.instruction],
        );
      }
      await connection.execute(
        `UPDATE recipes
         SET current_version_id = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND scope = 'public'`,
        [recipe.currentVersionId, recipe.id],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
