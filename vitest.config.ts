import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // Generated components must be on disk before Vite transforms the test that
    // imports one of them.
    globalSetup: ["./test/globalSetup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Lets a generated component be imported and executed for real, so the
      // runtime test exercises the same code that gets pasted into Framer.
      framer: path.resolve(__dirname, "./test/shims/framer.ts"),
    },
  },
})
