import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Avoid EPIPE / broken pipe on large multipart uploads (photo / resume). */
const proxyLong = {
  changeOrigin: true,
  timeout: 120_000,
  proxyTimeout: 120_000
} as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  /** If set (e.g. http://localhost:3000), all `/api/*` goes to the gateway — best for uploads. */
  const gateway = (process.env.VITE_PROXY_GATEWAY ?? env.VITE_PROXY_GATEWAY ?? "").trim();
  const proxyHost = (process.env.VITE_PROXY_HOST ?? env.VITE_PROXY_HOST ?? "").trim() || "localhost";

  const serviceProxies: Record<string, object> = {
    "/api/auth": {
      target: `http://${proxyHost}:3001`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/members": {
      target: `http://${proxyHost}:3002`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/posts": {
      target: `http://${proxyHost}:3002`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/recruiters": {
      target: `http://${proxyHost}:3003`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/connections": {
      target: `http://${proxyHost}:3004`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/jobs": {
      target: `http://${proxyHost}:3005`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/applications": {
      target: `http://${proxyHost}:3006`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/threads": {
      target: `http://${proxyHost}:3007`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/messages": {
      target: `http://${proxyHost}:3007`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/analytics": {
      target: `http://${proxyHost}:3008`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/events": {
      target: `http://${proxyHost}:3008`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    }
  };

  const redirectLegacyRecruiterUrls = (): Plugin => ({
    name: "redirect-legacy-recruiter-route",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split("?")[0] ?? "";
        const match = pathOnly.match(/^\/recruiters\/(\d+)\/?$/);
        if (match) {
          res.statusCode = 302;
          res.setHeader("Location", `/profile/${match[1]}?type=recruiter`);
          res.end();
          return;
        }
        next();
      });
    }
  });

  return {
    plugins: [react(), redirectLegacyRecruiterUrls()],
    server: {
      port: 5173,
      proxy: gateway
        ? {
            "/api": {
              target: gateway,
              ...proxyLong
            }
          }
        : serviceProxies
    }
  };
});
