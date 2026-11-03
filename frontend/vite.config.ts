import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // One shared root .env. Vite's default VITE_ prefix keeps backend settings out of client code.
  envDir: "..",
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
	port: 5173,
	strictPort: true,
	allowedHosts: [
	  "kindless-unluminously-christena.ngrok-free.dev",
	],
	proxy: {
	  "/api": {
		target: "http://127.0.0.1:8080",
		changeOrigin: true,
	  },
	},
  },
});
