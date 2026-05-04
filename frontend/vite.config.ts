import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  /** Where Vite (Node) forwards `/ai-service` — must be reachable from the dev container (e.g. host.docker.internal:3010). */
  const aiProxyTarget =
    (process.env.VITE_AI_PROXY_TARGET ?? env.VITE_AI_PROXY_TARGET ?? "").trim() ||
    `http://${proxyHost}:3010`;

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
    "/api/network": {
      target: `http://${proxyHost}:3009`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    "/api/events": {
      target: `http://${proxyHost}:3008`,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      ...proxyLong
    },
    /** AI service (FastAPI on 3010). Browser calls `/ai-service/*` → same-origin in dev; avoids direct `localhost:3010` failures. */
    "/ai-service": {
      target: aiProxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/ai-service/, ""),
      timeout: 120_000,
      proxyTimeout: 120_000,
      ws: true
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
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom")
      }
    },
    server: {
      port: 5173,
      proxy: gateway
        ? {
            // Must be before `/api` so network score POST is not swallowed by the SPA/gateway-only path.
            "/api/network": {
              target: `http://${proxyHost}:3009`,
              rewrite: (path: string) => path.replace(/^\/api/, ""),
              ...proxyLong
            },
            "/api": {
              target: gateway,
              ...proxyLong
            },
            "/ai-service": {
              target: aiProxyTarget,
              changeOrigin: true,
              rewrite: (path: string) => path.replace(/^\/ai-service/, ""),
              timeout: 120_000,
              proxyTimeout: 120_000,
              ws: true
            }
          }
        : serviceProxies
    }
  };
});
