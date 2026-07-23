CREATE TABLE users (
  id CHAR(26) NOT NULL PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  avatar_asset_id CHAR(26) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_users_status CHECK (status IN ('active', 'suspended', 'deleting', 'deleted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_identities (
  id CHAR(26) NOT NULL PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_subject VARBINARY(255) NOT NULL,
  union_subject VARBINARY(255) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_auth_identity_provider (provider, provider_subject),
  KEY idx_auth_identity_user (user_id),
  CONSTRAINT fk_auth_identity_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_sessions (
  id CHAR(26) NOT NULL PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  device_label VARCHAR(120) NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_sessions_token (refresh_token_hash),
  KEY idx_user_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kitchens (
  id CHAR(26) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  avatar_asset_id CHAR(26) NULL,
  owner_user_id CHAR(26) NOT NULL,
  member_limit SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_kitchens_owner (owner_user_id, deleted_at),
  CONSTRAINT fk_kitchens_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kitchen_members (
  kitchen_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  membership_role VARCHAR(20) NOT NULL DEFAULT 'member',
  nickname VARCHAR(80) NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  left_at DATETIME(3) NULL,
  PRIMARY KEY (kitchen_id, user_id),
  KEY idx_kitchen_members_user (user_id, left_at),
  CONSTRAINT chk_kitchen_members_role CHECK (membership_role IN ('owner', 'member')),
  CONSTRAINT fk_kitchen_members_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id),
  CONSTRAINT fk_kitchen_members_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kitchen_invites (
  id CHAR(26) NOT NULL PRIMARY KEY,
  kitchen_id CHAR(26) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  created_by CHAR(26) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  max_uses SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  used_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_kitchen_invites_code (code_hash),
  KEY idx_kitchen_invites_kitchen (kitchen_id, expires_at),
  CONSTRAINT fk_kitchen_invites_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id),
  CONSTRAINT fk_kitchen_invites_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ingredients (
  id CHAR(26) NOT NULL PRIMARY KEY,
  canonical_name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  aliases JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ingredients_name (canonical_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE recipes (
  id CHAR(26) NOT NULL PRIMARY KEY,
  scope VARCHAR(20) NOT NULL,
  kitchen_id CHAR(26) NULL,
  source_recipe_id CHAR(26) NULL,
  current_version_id CHAR(26) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_recipes_kitchen (kitchen_id, status, deleted_at),
  KEY idx_recipes_source (source_recipe_id),
  CONSTRAINT chk_recipes_scope CHECK (scope IN ('public', 'family')),
  CONSTRAINT chk_recipes_status CHECK (status IN ('active', 'archived', 'removed')),
  CONSTRAINT fk_recipes_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id),
  CONSTRAINT fk_recipes_source FOREIGN KEY (source_recipe_id) REFERENCES recipes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE recipe_versions (
  id CHAR(26) NOT NULL PRIMARY KEY,
  recipe_id CHAR(26) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  cover_asset_id CHAR(26) NULL,
  difficulty VARCHAR(20) NULL,
  cook_minutes SMALLINT UNSIGNED NULL,
  serving_note VARCHAR(120) NULL,
  created_by CHAR(26) NOT NULL,
  change_note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_recipe_versions_number (recipe_id, version_number),
  KEY idx_recipe_versions_creator (created_by, created_at),
  CONSTRAINT fk_recipe_versions_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id),
  CONSTRAINT fk_recipe_versions_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE recipe_ingredients (
  id CHAR(26) NOT NULL PRIMARY KEY,
  recipe_version_id CHAR(26) NOT NULL,
  ingredient_id CHAR(26) NULL,
  display_name VARCHAR(120) NOT NULL,
  quantity DECIMAL(12, 3) NULL,
  unit VARCHAR(30) NULL,
  category VARCHAR(40) NOT NULL,
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT UNSIGNED NOT NULL,
  KEY idx_recipe_ingredients_version (recipe_version_id, sort_order),
  KEY idx_recipe_ingredients_ingredient (ingredient_id),
  CONSTRAINT fk_recipe_ingredients_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id),
  CONSTRAINT fk_recipe_ingredients_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE recipe_steps (
  id CHAR(26) NOT NULL PRIMARY KEY,
  recipe_version_id CHAR(26) NOT NULL,
  step_number SMALLINT UNSIGNED NOT NULL,
  instruction TEXT NOT NULL,
  media_asset_id CHAR(26) NULL,
  timer_seconds INT UNSIGNED NULL,
  UNIQUE KEY uq_recipe_steps_number (recipe_version_id, step_number),
  CONSTRAINT fk_recipe_steps_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE family_recipe_settings (
  recipe_id CHAR(26) NOT NULL PRIMARY KEY,
  ordering_state VARCHAR(30) NOT NULL DEFAULT 'want_to_learn',
  first_introduced_until DATETIME(3) NULL,
  updated_by CHAR(26) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_family_recipe_ordering (ordering_state, updated_at),
  CONSTRAINT chk_family_recipe_ordering CHECK (ordering_state IN ('available', 'want_to_learn', 'hidden')),
  CONSTRAINT fk_family_recipe_settings_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id),
  CONSTRAINT fk_family_recipe_settings_user FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE meal_plans (
  id CHAR(26) NOT NULL PRIMARY KEY,
  kitchen_id CHAR(26) NOT NULL,
  meal_date DATE NOT NULL,
  meal_type VARCHAR(20) NOT NULL,
  meal_note VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  completed_by CHAR(26) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_meal_plans_slot (kitchen_id, meal_date, meal_type),
  KEY idx_meal_plans_date (kitchen_id, meal_date, status),
  CONSTRAINT chk_meal_plans_type CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  CONSTRAINT chk_meal_plans_status CHECK (status IN ('planned', 'completed')),
  CONSTRAINT fk_meal_plans_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id),
  CONSTRAINT fk_meal_plans_completed_by FOREIGN KEY (completed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE meal_items (
  id CHAR(26) NOT NULL PRIMARY KEY,
  meal_plan_id CHAR(26) NOT NULL,
  recipe_id CHAR(26) NOT NULL,
  recipe_version_id CHAR(26) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  taste_note VARCHAR(200) NULL,
  ordered_by CHAR(26) NOT NULL,
  ordered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sort_order SMALLINT UNSIGNED NOT NULL,
  deleted_at DATETIME(3) NULL,
  KEY idx_meal_items_plan (meal_plan_id, deleted_at, sort_order),
  CONSTRAINT fk_meal_items_plan FOREIGN KEY (meal_plan_id) REFERENCES meal_plans (id),
  CONSTRAINT fk_meal_items_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id),
  CONSTRAINT fk_meal_items_recipe_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions (id),
  CONSTRAINT fk_meal_items_ordered_by FOREIGN KEY (ordered_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE meal_plan_revisions (
  id CHAR(26) NOT NULL PRIMARY KEY,
  meal_plan_id CHAR(26) NOT NULL,
  version INT UNSIGNED NOT NULL,
  actor_user_id CHAR(26) NOT NULL,
  action VARCHAR(40) NOT NULL,
  before_snapshot JSON NULL,
  after_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_meal_plan_revisions_version (meal_plan_id, version),
  KEY idx_meal_plan_revisions_actor (actor_user_id, created_at),
  CONSTRAINT fk_meal_plan_revisions_plan FOREIGN KEY (meal_plan_id) REFERENCES meal_plans (id),
  CONSTRAINT fk_meal_plan_revisions_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE procurement_items (
  id CHAR(26) NOT NULL PRIMARY KEY,
  kitchen_id CHAR(26) NOT NULL,
  procurement_date DATE NOT NULL,
  ingredient_key VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  total_quantity DECIMAL(12, 3) NULL,
  unit VARCHAR(30) NULL,
  needed BOOLEAN NOT NULL DEFAULT TRUE,
  calculated_revision INT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_procurement_item_key (kitchen_id, procurement_date, ingredient_key),
  KEY idx_procurement_items_date (kitchen_id, procurement_date, category),
  CONSTRAINT fk_procurement_items_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE procurement_item_sources (
  procurement_item_id CHAR(26) NOT NULL,
  meal_plan_id CHAR(26) NOT NULL,
  meal_item_id CHAR(26) NOT NULL,
  recipe_ingredient_id CHAR(26) NOT NULL,
  quantity DECIMAL(12, 3) NULL,
  PRIMARY KEY (procurement_item_id, meal_item_id, recipe_ingredient_id),
  KEY idx_procurement_sources_meal (meal_plan_id, meal_item_id),
  CONSTRAINT fk_procurement_sources_item FOREIGN KEY (procurement_item_id) REFERENCES procurement_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_procurement_sources_plan FOREIGN KEY (meal_plan_id) REFERENCES meal_plans (id),
  CONSTRAINT fk_procurement_sources_meal_item FOREIGN KEY (meal_item_id) REFERENCES meal_items (id),
  CONSTRAINT fk_procurement_sources_ingredient FOREIGN KEY (recipe_ingredient_id) REFERENCES recipe_ingredients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE media_assets (
  id CHAR(26) NOT NULL PRIMARY KEY,
  owner_user_id CHAR(26) NOT NULL,
  kitchen_id CHAR(26) NULL,
  storage_key VARCHAR(512) NOT NULL,
  thumbnail_key VARCHAR(512) NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_media_storage_key (storage_key),
  KEY idx_media_owner (owner_user_id, deleted_at),
  KEY idx_media_kitchen (kitchen_id, visibility, deleted_at),
  CONSTRAINT chk_media_visibility CHECK (visibility IN ('private', 'shared', 'public')),
  CONSTRAINT chk_media_moderation CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fk_media_owner FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT fk_media_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE meal_photos (
  id CHAR(26) NOT NULL PRIMARY KEY,
  meal_plan_id CHAR(26) NOT NULL,
  meal_item_id CHAR(26) NULL,
  media_asset_id CHAR(26) NOT NULL,
  caption VARCHAR(500) NULL,
  uploaded_by CHAR(26) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_meal_photos_plan (meal_plan_id, deleted_at, created_at),
  CONSTRAINT fk_meal_photos_plan FOREIGN KEY (meal_plan_id) REFERENCES meal_plans (id),
  CONSTRAINT fk_meal_photos_item FOREIGN KEY (meal_item_id) REFERENCES meal_items (id),
  CONSTRAINT fk_meal_photos_asset FOREIGN KEY (media_asset_id) REFERENCES media_assets (id),
  CONSTRAINT fk_meal_photos_user FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE share_posts (
  id CHAR(26) NOT NULL PRIMARY KEY,
  author_user_id CHAR(26) NOT NULL,
  kitchen_id CHAR(26) NOT NULL,
  post_type VARCHAR(30) NOT NULL,
  title VARCHAR(160) NOT NULL,
  content_snapshot JSON NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public',
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_share_posts_feed (moderation_status, published_at, id),
  KEY idx_share_posts_author (author_user_id, deleted_at),
  CONSTRAINT chk_share_posts_type CHECK (post_type IN ('recipe', 'meal_memory')),
  CONSTRAINT chk_share_posts_visibility CHECK (visibility IN ('public', 'unlisted')),
  CONSTRAINT chk_share_posts_moderation CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'removed')),
  CONSTRAINT fk_share_posts_author FOREIGN KEY (author_user_id) REFERENCES users (id),
  CONSTRAINT fk_share_posts_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE post_media (
  post_id CHAR(26) NOT NULL,
  media_asset_id CHAR(26) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, media_asset_id),
  UNIQUE KEY uq_post_media_order (post_id, sort_order),
  CONSTRAINT fk_post_media_post FOREIGN KEY (post_id) REFERENCES share_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_post_media_asset FOREIGN KEY (media_asset_id) REFERENCES media_assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE content_reports (
  id CHAR(26) NOT NULL PRIMARY KEY,
  post_id CHAR(26) NOT NULL,
  reporter_user_id CHAR(26) NOT NULL,
  reason VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  resolved_by CHAR(26) NULL,
  resolution_note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  KEY idx_content_reports_status (status, created_at),
  CONSTRAINT fk_content_reports_post FOREIGN KEY (post_id) REFERENCES share_posts (id),
  CONSTRAINT fk_content_reports_user FOREIGN KEY (reporter_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
  id CHAR(26) NOT NULL PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  kitchen_id CHAR(26) NULL,
  notification_type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  payload JSON NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_notifications_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE recommendation_preferences (
  user_id CHAR(26) NOT NULL,
  kitchen_id CHAR(26) NOT NULL,
  strategy VARCHAR(40) NOT NULL DEFAULT 'long_time_no_eat',
  source_scope VARCHAR(40) NOT NULL DEFAULT 'family_only',
  item_count TINYINT UNSIGNED NOT NULL DEFAULT 3,
  collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, kitchen_id),
  CONSTRAINT chk_recommendation_item_count CHECK (item_count BETWEEN 1 AND 10),
  CONSTRAINT fk_recommendation_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_recommendation_kitchen FOREIGN KEY (kitchen_id) REFERENCES kitchens (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_events (
  id CHAR(26) NOT NULL PRIMARY KEY,
  user_id CHAR(26) NULL,
  kitchen_id CHAR(26) NULL,
  event_name VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id CHAR(26) NULL,
  properties JSON NULL,
  occurred_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_product_events_name_time (event_name, occurred_at),
  KEY idx_product_events_kitchen_time (kitchen_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_logs (
  id CHAR(26) NOT NULL PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL,
  actor_id CHAR(26) NULL,
  kitchen_id CHAR(26) NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id CHAR(26) NULL,
  request_id VARCHAR(80) NULL,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_logs_resource (resource_type, resource_id, created_at),
  KEY idx_audit_logs_actor (actor_type, actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

