import { defineConfig, type UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  projectName: "jiayan-miniprogram",
  date: "2026-07-22",
  designWidth: 375,
  deviceRatio: {
    375: 2,
    640: 1.17,
    750: 1,
    828: 0.905,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: {
    type: "webpack5",
    prebundle: {
      enable: false,
    },
  },
  cache: {
    enable: true,
  },
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(
      process.env.TARO_APP_API_BASE_URL ?? "http://127.0.0.1:3000",
    ),
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      cssModules: {
        enable: false,
      },
    },
  },
};

export default defineConfig(config);
