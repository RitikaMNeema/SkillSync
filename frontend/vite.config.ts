import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/auth": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/members": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/posts": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/recruiters": {
        target: "http://localhost:3003",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/connections": {
        target: "http://localhost:3004",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/jobs": {
        target: "http://localhost:3005",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/applications": {
        target: "http://localhost:3006",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/threads": {
        target: "http://localhost:3007",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/messages": {
        target: "http://localhost:3007",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/analytics": {
        target: "http://localhost:3008",
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/api/events": {
        target: "http://localhost:3008",
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
