# API 设计

## 1. 通用约定

- 基础路径：`/v1`
- 协议：HTTPS + JSON
- 日期：`YYYY-MM-DD`，解释为厨房所在地日期
- 时间：ISO 8601 UTC 时间
- 分页：游标分页，`limit` 最大 100
- 写操作请求头：`Idempotency-Key`
- 更新聚合必须提交 `version`
- 每次响应返回 `requestId`，便于查询日志

成功响应：

```json
{
  "data": {},
  "meta": {
    "requestId": "req_01..."
  }
}
```

错误响应：

```json
{
  "error": {
    "code": "MEAL_PLAN_VERSION_CONFLICT",
    "message": "菜单已被其他家庭成员更新，请刷新后重试",
    "details": {
      "currentVersion": 4
    }
  },
  "meta": {
    "requestId": "req_01..."
  }
}
```

前端只按稳定的 `code` 决定交互，不解析后端中文文案。

## 2. 登录与会话

| 方法  | 路径                       | 用途                               |
| ----- | -------------------------- | ---------------------------------- |
| POST  | `/v1/auth/wechat/login`    | 使用微信登录临时 code 换取系统会话 |
| POST  | `/v1/auth/refresh`         | 刷新访问令牌                       |
| POST  | `/v1/auth/logout`          | 撤销当前会话                       |
| GET   | `/v1/me`                   | 当前用户资料和当前厨房             |
| PATCH | `/v1/me`                   | 更新展示资料                       |
| POST  | `/v1/me/export-requests`   | 申请导出个人数据                   |
| POST  | `/v1/me/deletion-requests` | 申请注销和删除数据                 |

微信登录 code 只能由后端向微信服务器交换，不能接受客户端直接提交 OpenID 作为登录凭证。

## 3. 家庭厨房

| 方法   | 路径                                      | 用途               |
| ------ | ----------------------------------------- | ------------------ |
| GET    | `/v1/kitchens`                            | 当前用户加入的厨房 |
| POST   | `/v1/kitchens`                            | 创建厨房           |
| GET    | `/v1/kitchens/:kitchenId`                 | 厨房详情           |
| PATCH  | `/v1/kitchens/:kitchenId`                 | 修改厨房资料       |
| DELETE | `/v1/kitchens/:kitchenId/members/:userId` | 移除成员           |
| POST   | `/v1/kitchens/:kitchenId/invites`         | 创建 6 位邀请码    |
| POST   | `/v1/kitchen-invites/preview`             | 加入前预览厨房     |
| POST   | `/v1/kitchen-invites/join`                | 使用邀请码加入     |
| DELETE | `/v1/kitchens/:kitchenId/membership`      | 当前成员退出厨房   |
| DELETE | `/v1/kitchens/:kitchenId`                 | 创建者解散厨房     |

厨房详情已包含当前有效成员列表。成员可以邀请家人和自行退出；只有厨房创建者可以修改资料、移除其他成员或解散厨房。创建者不能直接退出，必须明确执行解散，避免留下无人管理的家庭空间。

## 4. 菜谱

| 方法   | 路径                                    | 用途                         |
| ------ | --------------------------------------- | ---------------------------- |
| GET    | `/v1/kitchens/:kitchenId/recipes`       | 家庭菜谱列表和分类筛选       |
| POST   | `/v1/kitchens/:kitchenId/recipes`       | 手动创建家庭菜谱             |
| GET    | `/v1/recipes/:recipeId`                 | 菜谱详情                     |
| PATCH  | `/v1/recipes/:recipeId`                 | 创建新的菜谱版本             |
| DELETE | `/v1/recipes/:recipeId`                 | 下架家庭菜谱，二次确认后调用 |
| GET    | `/v1/recipes/:recipeId/versions`        | 版本历史                     |
| POST   | `/v1/recipes/:recipeId/revert`          | 回退到指定版本               |
| PATCH  | `/v1/recipes/:recipeId/ordering-state`  | 开放点菜／想学先存／隐藏     |
| GET    | `/v1/discovery/recipes`                 | 菜谱广场列表                 |
| POST   | `/v1/discovery/recipes/:recipeId/clone` | 克隆为家庭版本               |
| POST   | `/v1/recipe-imports`                    | 创建链接导入任务             |

链接导入返回任务 ID；解析完成后生成待核对草稿，不能未经用户确认直接发布。

家庭菜谱详情、更新、状态调整和删除接口通过 `kitchenId` 查询参数明确当前家庭空间。每次完整编辑都新增不可变的 `recipe_versions` 记录；客户端必须提交 `expectedVersion`，旧版本编辑返回 `RECIPE_VERSION_CONFLICT`，不得静默覆盖其他家庭成员的修改。

菜谱编辑首版保存菜名、介绍、分类、制作时间、用料、步骤、小贴士和点菜状态。封面图片上传在媒体链路接入前使用表情占位，不能接受客户端伪造的对象存储地址。

## 5. 菜单和点餐记录

当前纵向切片已实现餐次摘要查询、单餐查询和整餐版本化保存。单菜删除目前通过提交新的整餐版本完成；完成本餐、历史版本查询和回退接口属于下一阶段实现项。

| 方法   | 路径                                                               | 用途                   |
| ------ | ------------------------------------------------------------------ | ---------------------- |
| GET    | `/v1/kitchens/:kitchenId/meal-plans?from=&to=`                     | 日期区间的餐次摘要     |
| GET    | `/v1/kitchens/:kitchenId/meal-plans/:date/:mealType`               | 某餐完整菜单           |
| PUT    | `/v1/kitchens/:kitchenId/meal-plans/:date/:mealType`               | 创建或替换当前菜单版本 |
| DELETE | `/v1/kitchens/:kitchenId/meal-plans/:date/:mealType/items/:itemId` | 删除单道菜             |
| POST   | `/v1/kitchens/:kitchenId/meal-plans/:date/:mealType/complete`      | 完成本餐               |
| GET    | `/v1/meal-plans/:mealPlanId/revisions`                             | 修改历史               |
| POST   | `/v1/meal-plans/:mealPlanId/revert`                                | 撤销到指定版本         |

保存示例：

```json
{
  "version": 3,
  "mealNote": "奶奶也一起吃",
  "items": [
    {
      "itemId": "mi_existing",
      "recipeId": "recipe_1",
      "recipeVersionId": "rv_4",
      "quantity": 1,
      "tasteNote": "少盐"
    },
    {
      "recipeId": "recipe_2",
      "recipeVersionId": "rv_7",
      "quantity": 1,
      "tasteNote": null
    }
  ]
}
```

成功保存返回最新 `version`、点餐记录摘要和采购清单修订号，前端无需再调用“生成采购清单”。

## 6. 采购清单

当前纵向切片已实现全天采购清单查询和“是否需要购买”更新；分享预览接口仍是后续媒体与分享阶段的设计约定。

| 方法  | 路径                                                       | 用途                   |
| ----- | ---------------------------------------------------------- | ---------------------- |
| GET   | `/v1/kitchens/:kitchenId/procurement/:date`                | 全天采购清单及逐餐来源 |
| PATCH | `/v1/kitchens/:kitchenId/procurement/:date/items/:itemId`  | 修改是否需要购买       |
| POST  | `/v1/kitchens/:kitchenId/procurement/:date/share-previews` | 按所选餐次生成分享预览 |

分享预览请求：

```json
{
  "mealTypes": ["breakfast", "dinner"],
  "includeNotNeeded": true
}
```

## 7. 图片和分享

当前纵向切片已实现私有图片上传会话、COS 上传验收、完成餐次的照片增删改查，以及面向同厨房成员的微信小程序卡片分享。匿名或跨厨房的限时分享链接、分享图片保存到相册和公开分享广场仍属于后续阶段。

| 方法   | 路径                                        | 用途                 |
| ------ | ------------------------------------------- | -------------------- |
| POST   | `/v1/media/upload-sessions`                 | 获取受限上传凭证     |
| POST   | `/v1/media/:mediaId/complete`               | 确认上传并开始处理   |
| POST   | `/v1/meal-plans/:mealPlanId/photos`         | 关联一张或多张成品照 |
| PATCH  | `/v1/meal-photos/:photoId`                  | 修改关联菜品或说明   |
| DELETE | `/v1/meal-photos/:photoId`                  | 删除照片             |
| POST   | `/v1/meal-plans/:mealPlanId/share-previews` | 生成本餐分享预览     |
| POST   | `/v1/discovery/posts`                       | 发布到分享广场       |
| GET    | `/v1/discovery/posts`                       | 分享广场列表         |
| POST   | `/v1/discovery/posts/:postId/reports`       | 举报内容             |

公开发布接口只接受已经完成内容审核的媒体。未审核或审核失败的内容可以在家庭内部查看，但不可公开。

## 8. 推荐与通知

| 方法 | 路径                                                 | 用途     |
| ---- | ---------------------------------------------------- | -------- |
| GET  | `/v1/kitchens/:kitchenId/recommendations/today`      | 今日推荐 |
| POST | `/v1/kitchens/:kitchenId/recommendations/refresh`    | 换一组   |
| PUT  | `/v1/kitchens/:kitchenId/recommendation-preferences` | 保存偏好 |
| GET  | `/v1/notifications`                                  | 通知列表 |
| POST | `/v1/notifications/:notificationId/read`             | 标记已读 |
| POST | `/v1/notifications/read-all`                         | 全部已读 |

## 9. 稳定错误码

- `AUTH_REQUIRED`
- `SESSION_EXPIRED`
- `KITCHEN_ACCESS_DENIED`
- `KITCHEN_NOT_FOUND`
- `KITCHEN_OWNER_REQUIRED`
- `KITCHEN_OWNER_CANNOT_LEAVE`
- `KITCHEN_MEMBER_NOT_FOUND`
- `KITCHEN_MEMBER_LIMIT_REACHED`
- `INVITE_INVALID_OR_EXPIRED`
- `RECIPE_NOT_FOUND`
- `RECIPE_VERSION_CONFLICT`
- `MEAL_PLAN_VERSION_CONFLICT`
- `MEAL_PLAN_ALREADY_COMPLETED`
- `MEAL_PLAN_EMPTY`
- `MEDIA_NOT_READY`
- `CONTENT_MODERATION_REJECTED`
- `RATE_LIMITED`
- `VALIDATION_FAILED`
