import "dotenv/config";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createAppServices } from "./services";

const config = loadConfig();
const services = createAppServices(config);
const app = buildApp({ config, services });

const closeGracefully = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "正在停止 API 服务");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void closeGracefully("SIGINT"));
process.once("SIGTERM", () => void closeGracefully("SIGTERM"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error, "API 服务启动失败");
  process.exit(1);
}
