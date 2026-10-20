import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const singleFile = env.DSH_SEQ_VIEWER_SINGLEFILE === "1";
  return {
    plugins: [react(), ...(singleFile ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    base: "./",
    build: singleFile
      ? {
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          reportCompressedSize: false,
        }
      : undefined,
  };
});
