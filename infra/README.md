# 本地基础设施

如果本机已经安装 Docker Desktop，可以启动本地 MySQL：

```powershell
docker compose -f infra/docker-compose.yml up -d
Copy-Item apps/api/.env.example apps/api/.env
npm.cmd run db:migrate
```

`.env.example` 中的密码只用于本地开发。生产环境必须使用云端密钥管理和独立高强度凭证。

停止服务：

```powershell
docker compose -f infra/docker-compose.yml stop
```

该命令不会删除数据卷。若需要清理本地测试数据，应先确认目标仅为 `jiayan-mysql-data`，再显式执行相应操作。
