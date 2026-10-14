import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // One shared root .env. Vite's default VITE_ prefix keeps backend settings out of client code.
  envDir: "..",
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: { port: 5173 },
});
