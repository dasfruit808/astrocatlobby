import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext"
  },
  server: {
    mimeTypes: {
      "application/javascript": ["ts"]
    }
  },
  preview: {
    mimeTypes: {
      "application/javascript": ["ts"]
    }
  }
});
