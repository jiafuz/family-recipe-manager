# 家宴（JIAYAN）

家宴是一款围绕家庭共同点菜、维护菜谱、自动生成采购清单和记录家庭饮食的微信小程序。

仓库中的 [`index.html`](./index.html) 是已经基本定版的交互原型，后续作为产品验收母版保留。正式产品代码采用独立的前后端工程，不直接在原型文件中继续堆叠生产逻辑。

## 技术路线

- 微信小程序：Taro + React + TypeScript
- 后端 API：Node.js + TypeScript + Fastify
- 数据库：MySQL
- 文件：腾讯云对象存储／CloudBase 文件存储
- 部署：腾讯云 CloudBase 云托管
- 管理后台：React Web（第二阶段建立）
- 推荐：首版使用可解释的规则推荐

## 仓库结构

```text
apps/
  miniprogram/       微信小程序
  api/               后端 API
packages/
  contracts/         前后端共享的数据契约
  domain/            与运行环境无关的核心业务规则
database/
  migrations/        MySQL 数据库迁移
docs/                产品、架构、数据和上线文档
infra/               本地与云端基础设施配置
prototype/
  当前暂不移动，根目录 index.html 仍是产品原型
```

## 开始开发

要求 Node.js 22 或更高版本、npm 10 或更高版本。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
```

启动后端（默认使用内存数据和模拟微信登录，不需要先安装数据库）：

```powershell
npm.cmd run dev:api
```

API 默认监听 `http://127.0.0.1:3000`。内存模式仅用于快速联调，重启服务后数据会清空。

需要验证 MySQL 持久化时：

```powershell
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up -d
# 将 .env 中 PERSISTENCE_MODE 改为 mysql 后执行：
npm.cmd run db:migrate
npm.cmd run dev:api
```

真实微信登录需要把 `.env` 中 `WECHAT_LOGIN_MODE` 改为 `live`，并填写小程序的 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。后端会复用这组配置获取微信接口凭证，并缓存采购分享图使用的官方小程序码；密钥只能放在后端环境变量中，不能写入小程序代码或提交到 Git。`mock` 模式不会生成伪造的小程序码，保存采购分享图时会自动省略该区域。

构建微信小程序：

```powershell
npm.cmd run dev:weapp
```

如需指定其他 API 地址，先设置环境变量：

```powershell
$env:TARO_APP_API_BASE_URL = "https://api.example.com"
npm.cmd run build:weapp
```

构建结果位于 `apps/miniprogram/dist`，使用微信开发者工具导入 `apps/miniprogram`。
本地联调时可在微信开发者工具中临时关闭合法域名校验；正式体验版和生产版必须使用已在微信公众平台登记的 HTTPS API 域名。

当前已经打通八条纵向链路：

1. 微信登录（本地可模拟）→ 创建、加入或切换厨房 → 预览邀请码对应厨房并确认加入 → 编辑厨房资料 → 邀请或移除成员 → 成员退出／创建者解散厨房 → 刷新或撤销会话。
2. 家庭菜谱列表 → 创建菜谱 → 编辑形成新版本 → 开放点菜／想学先存 → 点菜页读取可点菜谱 → 归档删除。
3. 点菜页选择菜品 → 调整数量与备注 → 选择日期餐次 → 合并并保存本餐菜单 → 自动生成采购清单 → 点餐记录精准定位；也支持从点餐记录进入指定餐次编辑，保存后实时重算采购清单。
4. 完成本餐 → 菜单只读 → 可选单张或多张添加成品照 → 编辑关联菜品、说明或替换/删除图片 → 预览并通过微信分享给同厨房成员。
5. 菜谱广场搜索或分类浏览 → 查看公共菜谱详情 → 选择“开放点菜”或“想学先存” → 收录为独立的家庭版本 → 在菜谱管理中继续改良；同一厨房重复收录同一来源时返回已有家庭版本，不产生重复菜谱。
6. 从点菜页或菜谱管理选择“链接导入” → 粘贴小红书／下厨房 HTTPS 链接 → 服务端受限读取并生成待核对草稿 → 复用家庭菜谱编辑器补充和修改 → 用户主动保存后才成为家庭菜谱。
7. 点菜页读取今日推荐 → 按“好久没吃／均衡搭配／轻盈少负担／香辣过瘾／快手不费事”解释推荐理由 → 收起、展开或换一组 → 调整来源和数量 → 一键加入已选菜单；选中菜谱广场内容时自动收录独立家庭版本，并短期标记“首次引入我家菜谱”。
8. 点餐记录进入当天采购清单 → 按全天／早餐／午餐／晚餐切换查看 → 调整“需要购买”状态 → 默认选择三餐或自由组合一至三餐 → 生成合并清单和逐餐明细 → 通过微信小程序卡片分享给同厨房成员，或保存带官方小程序码的普通长图发给未使用小程序的家人。

数据库迁移会幂等写入 12 道首批公共菜谱作为联调种子。公共菜谱只作为来源，收录后会复制当前版本、食材和步骤；家庭成员后续编辑不会反向修改公共原版。

内存联调模式不会访问第三方网站，只生成明确标注的演示草稿；MySQL 持久化模式启用受限外部读取，仅允许受支持域名、HTTPS、最多 3 次受控跳转、8 秒超时和 2 MB 页面体积。第三方图片不自动复制，导入结果始终需要用户核对。

菜谱编辑器当前使用表情作为封面占位。真实图片上传将在对象存储、压缩和内容安全审核链路完成后接入，不使用本地假地址冒充上传成功。

成品照在本地内存模式使用明确的 `mock` 上传链路；体验版和生产环境必须把 `MEDIA_STORAGE_MODE` 设置为 `cos`，并配置 `TENCENT_CLOUD_SECRET_ID`、`TENCENT_CLOUD_SECRET_KEY`、`COS_BUCKET` 和 `COS_REGION`。长期密钥只存在后端，后端为每张图片生成限定到单一随机对象路径和 PUT 方法的短期限时签名，小程序不会接触长期密钥。

微信公众平台需要把正式 HTTPS API 域名同时配置为 request 和 downloadFile 合法域名，采购分享图会通过 downloadFile 从 API 获取鉴权后的小程序码。还需要把 `https://<bucket>.cos.<region>.myqcloud.com` 配置到 request/downloadFile 合法域名；COS 存储桶保持私有读，客户端展示图片时由后端生成短期读取地址。

如果 Windows 应用程序控制策略阻止 Taro 的原生编译模块，而本机已经安装 WSL，可以在隔离的 Linux 临时目录完成验证：

```powershell
wsl.exe -d Ubuntu-24.04 -- bash ./scripts/verify-weapp-wsl.sh
```

脚本不会改动当前工作区的 `node_modules`，会把验证通过的构建结果复制到 `apps/miniprogram/dist`，隔离构建目录会显示在命令输出中。

## 开发顺序

1. 微信登录、用户和家庭厨房。
2. 家庭菜谱与菜谱版本。
3. 点菜、选择日期餐次与保存菜单。
4. 点餐记录和实时采购清单。
5. 成品照、微信分享与通知。
6. 菜谱广场、分享广场和推荐。

开始业务开发前，先阅读 [`docs/01-mvp-scope.md`](./docs/01-mvp-scope.md) 和 [`docs/02-system-architecture.md`](./docs/02-system-architecture.md)。
