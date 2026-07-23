ALTER TABLE recipe_versions
  ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'other' AFTER description,
  ADD COLUMN cover_emoji VARCHAR(20) NOT NULL DEFAULT '🍲' AFTER cover_asset_id,
  ADD COLUMN tips TEXT NULL AFTER serving_note;

CREATE INDEX idx_recipe_versions_name ON recipe_versions (name);
