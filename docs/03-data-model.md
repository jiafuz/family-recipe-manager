# 数据模型与数据字典

## 1. 通用规范

- 主键使用不透明字符串 ID，不把微信 OpenID 或自增序号暴露为业务 ID。
- 时间统一以 UTC 保存，API 使用 ISO 8601，界面按用户时区展示。
- 所有可编辑聚合包含 `version`、`created_at`、`updated_at`。
- 需要追责的数据包含 `created_by`、`updated_by`。
- 用户可恢复内容使用 `deleted_at` 软删除；会话、验证码等临时数据可以物理删除。
- JSON 字段只用于结构不稳定的快照和元数据，核心关联使用正常关系表。

## 2. 用户和身份

### users

| 字段                    | 说明                                    |
| ----------------------- | --------------------------------------- |
| id                      | 系统用户 ID                             |
| display_name            | 展示名                                  |
| avatar_asset_id         | 头像媒体 ID                             |
| status                  | active / suspended / deleting / deleted |
| timezone                | 默认 Asia/Shanghai                      |
| created_at / updated_at | 创建和更新时间                          |

### auth_identities

| 字段             | 说明                                  |
| ---------------- | ------------------------------------- |
| id               | 身份 ID                               |
| user_id          | 系统用户                              |
| provider         | wechat_miniprogram / phone / apple 等 |
| provider_subject | 加密或受保护的 OpenID 等外部标识      |
| union_subject    | 可选 UnionID                          |
| last_login_at    | 最后登录时间                          |

`provider + provider_subject` 必须唯一。外部标识不得出现在客户端日志和公开接口中。

## 3. 家庭厨房

### kitchens

- `id`
- `name`
- `avatar_asset_id`
- `owner_user_id`
- `member_limit`
- `version`
- `created_at / updated_at / deleted_at`

### kitchen_members

- `kitchen_id`
- `user_id`
- `membership_role`：owner / member，仅用于管理厨房，不影响点菜权限
- `nickname`
- `joined_at`
- `left_at`

`kitchen_id + user_id` 在有效成员范围内唯一。

### kitchen_invites

- `id`
- `kitchen_id`
- `code_hash`
- `created_by`
- `expires_at`
- `max_uses`
- `used_count`
- `revoked_at`

数据库不保存可直接读取的明文邀请码；验证时对用户输入计算摘要。

## 4. 菜谱

### recipes

菜谱身份与来源，不直接保存经常变化的正文。

- `id`
- `scope`：public / family
- `kitchen_id`：家庭版本必填
- `source_recipe_id`：从公共菜谱克隆时记录来源
- `current_version_id`
- `status`：active / archived / removed

有效家庭菜谱在 `kitchen_id + source_recipe_id` 范围内唯一，避免网络重试或并发点击把同一公共来源重复收录。家庭版本复制收录时的公共版本内容；二者只保留来源关系，不共享可写的版本、食材或步骤记录。

### recipe_versions

- `id`
- `recipe_id`
- `version_number`
- `name`
- `description`
- `cover_asset_id`
- `difficulty`
- `cook_minutes`
- `serving_note`
- `created_by`
- `change_note`
- `created_at`

### recipe_ingredients

- `recipe_version_id`
- `ingredient_id`
- `display_name`
- `quantity`
- `unit`
- `category`
- `optional`
- `sort_order`

### recipe_steps

- `recipe_version_id`
- `step_number`
- `instruction`
- `media_asset_id`
- `timer_seconds`

### family_recipe_settings

- `recipe_id`
- `ordering_state`：available / want_to_learn / hidden
- `first_introduced_until`
- `updated_by / updated_at`

### recipe_imports

- `id`
- `kitchen_id`
- `source_url`
- `source_platform`：xiaohongshu / xiachufang
- `status`：needs_review / completed
- `draft_snapshot`：受限解析得到、等待用户核对的草稿
- `warnings`：缺失字段、页面结构变化和图片不复制等提醒
- `saved_recipe_id`：用户确认后创建的独立家庭菜谱
- `created_by / created_at / updated_at`

导入任务本身不能进入点菜列表。只有用户在菜谱编辑器中补全并保存后，才创建普通家庭菜谱；任务随后仅记录来源与处理状态。

## 5. 菜单

### meal_plans

一行代表某厨房某天某餐的当前菜单聚合。

- `id`
- `kitchen_id`
- `meal_date`：厨房本地日期
- `meal_type`：breakfast / lunch / dinner
- `meal_note`
- `status`：planned / completed
- `version`
- `completed_by / completed_at`
- `created_at / updated_at`

`kitchen_id + meal_date + meal_type` 唯一。

### meal_items

- `id`
- `meal_plan_id`
- `recipe_id`
- `recipe_version_id`：点餐时使用的家庭菜谱版本
- `quantity`
- `taste_note`
- `ordered_by`
- `ordered_at`
- `sort_order`
- `deleted_at`

菜单项固定引用点餐时的菜谱版本。之后改良家庭菜谱不能静默改变已经保存的菜单。

### meal_plan_revisions

- `id`
- `meal_plan_id`
- `version`
- `actor_user_id`
- `action`
- `before_snapshot`
- `after_snapshot`
- `created_at`

用于查看修改历史、冲突说明和撤销。

## 6. 采购清单

### procurement_items

- `id`
- `kitchen_id`
- `procurement_date`
- `ingredient_key`：标准化名称、单位等生成的稳定键
- `display_name`
- `category`
- `total_quantity`
- `unit`
- `needed`：是否需要购买，默认 true
- `calculated_menu_version`
- `updated_at`

### procurement_item_sources

- `procurement_item_id`
- `meal_plan_id`
- `meal_item_id`
- `recipe_ingredient_id`
- `quantity`

采购清单重算规则：

1. 同日期、标准食材、可换算单位相同才合并。
2. 重算前记录已有 `ingredient_key → needed`。
3. 重算后仍存在的食材恢复旧选择。
4. 新食材默认 `needed = true`。
5. 不再存在的食材及来源一并删除。

首版不自动换算“少许”“适量”等非精确用量，只展示来源明细。

## 7. 媒体和公开内容

### media_assets

- `id`
- `owner_user_id`
- `kitchen_id`
- `storage_key`
- `thumbnail_key`
- `mime_type`
- `size_bytes`
- `width / height`
- `visibility`：private / shared / public
- `moderation_status`
- `created_at / deleted_at`

### meal_photos

- `id`
- `meal_plan_id`
- `meal_item_id`：空值表示整餐合照
- `media_asset_id`
- `caption`
- `uploaded_by`
- `created_at / updated_at / deleted_at`

### share_posts

- `id`
- `author_user_id`
- `kitchen_id`
- `post_type`：recipe / meal_memory
- `title`
- `content_snapshot`
- `visibility`
- `moderation_status`
- `published_at / deleted_at`

公开帖子保存发布快照。其他用户“收录菜谱”时，从快照创建新的家庭版本，不共享可写对象。

## 8. 推荐和行为事件

### recommendation_preferences

- `user_id`
- `kitchen_id`
- `strategy`
- `source_scope`
- `item_count`
- `collapsed`
- `updated_at`

偏好按 `user_id + kitchen_id` 唯一保存，因此同一用户在不同家庭厨房可以使用不同推荐策略，收起／展开状态也随厨房记忆。推荐结果即时根据当前家庭菜谱和近一年菜单计算，不单独持久化，避免菜谱或点餐记录变化后继续展示过期结果。

### product_events

- `id`
- `user_id`
- `kitchen_id`
- `event_name`
- `entity_type / entity_id`
- `properties`
- `occurred_at`

行为事件只保存改进产品所需的最少字段，不把口味、健康偏好等敏感信息无目的地复制到埋点。

## 9. 关键索引

- `kitchen_members(user_id, left_at)`
- `recipes(kitchen_id, status)`
- `family_recipe_settings(ordering_state, updated_at)`
- `meal_plans(kitchen_id, meal_date, meal_type)` 唯一
- `meal_items(meal_plan_id, deleted_at, sort_order)`
- `procurement_items(kitchen_id, procurement_date, category)`
- `notifications(user_id, read_at, created_at)`
- `share_posts(moderation_status, published_at)`

索引必须根据真实慢查询和执行计划调整，不为所有字段盲目建索引。
