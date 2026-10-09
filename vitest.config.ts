import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig says `jsx: preserve` (Next compiles JSX itself). Vite 8 compiles
  // tests with oxc, which then leaves JSX in place and fails to parse it, so
  // `.test.tsx` files need the automatic runtime spelled out here to render
  // components with react-dom/server in the node environment (spec 0002).
  // (`esbuild.jsx` is ignored on Vite 8.)
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    globals: false,
  },
});
