import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app";
import { loadConfig } from "./config";

const testConfig = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
});

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("API foundation", () => {
  it("returns liveness status", async () => {
    const app = buildApp({ config: testConfig });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: "ok" } });
  });

  it("returns API metadata with a request id", async () => {
    const app = buildApp({ config: testConfig });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/meta" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual({ service: "jiayan-api", apiVersion: "v1" });
    expect(body.meta.requestId).toBeTypeOf("string");
  });
});
