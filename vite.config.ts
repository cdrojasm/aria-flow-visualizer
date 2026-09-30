import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// STATIC=1 (make build-static) → SPA shell prerendered for GitHub Pages,
// served under /<repo>/. Unset (default) → SSR build for Docker/node.
const isStatic = !!process.env.STATIC;
const base = process.env.STATIC_BASE ?? "/aria-flow-visualizer/";

export default defineConfig({
  ...(isStatic && { base }),
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Keep server-only modules out of the client bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      ...(isStatic && {
        spa: {
          enabled: true,
          prerender: { outputPath: "/index", autoSubfolderIndex: false },
        },
      }),
    }),
    viteReact(),
  ],
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: { host: "::", port: 8080 },
});
