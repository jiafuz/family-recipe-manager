ALTER TABLE recipes
  ADD COLUMN active_source_recipe_id CHAR(26)
    GENERATED ALWAYS AS (
      CASE
        WHEN scope = 'family' AND status = 'active' AND deleted_at IS NULL
          THEN source_recipe_id
        ELSE NULL
      END
    ) STORED AFTER source_recipe_id,
  ADD UNIQUE KEY uq_recipes_active_family_source (
    kitchen_id,
    active_source_recipe_id
  );
