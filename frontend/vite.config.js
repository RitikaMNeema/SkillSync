var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Avoid EPIPE / broken pipe on large multipart uploads (photo / resume). */
var proxyLong = {
    changeOrigin: true,
    timeout: 120000,
    proxyTimeout: 120000
};
export default defineConfig(function (_a) {
    var _b, _c, _d, _e, _f, _g;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    /** If set (e.g. http://localhost:3000), all `/api/*` goes to the gateway — best for uploads. */
    var gateway = ((_c = (_b = process.env.VITE_PROXY_GATEWAY) !== null && _b !== void 0 ? _b : env.VITE_PROXY_GATEWAY) !== null && _c !== void 0 ? _c : "").trim();
    var proxyHost = ((_e = (_d = process.env.VITE_PROXY_HOST) !== null && _d !== void 0 ? _d : env.VITE_PROXY_HOST) !== null && _e !== void 0 ? _e : "").trim() || "localhost";
    /** Where Vite (Node) forwards `/ai-service` — must be reachable from the dev container (e.g. host.docker.internal:3010). */
    var aiProxyTarget = ((_g = (_f = process.env.VITE_AI_PROXY_TARGET) !== null && _f !== void 0 ? _f : env.VITE_AI_PROXY_TARGET) !== null && _g !== void 0 ? _g : "").trim() ||
        "http://".concat(proxyHost, ":3010");
    var serviceProxies = {
        "/api/auth": __assign({ target: "http://".concat(proxyHost, ":3001"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/members": __assign({ target: "http://".concat(proxyHost, ":3002"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/posts": __assign({ target: "http://".concat(proxyHost, ":3002"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/recruiters": __assign({ target: "http://".concat(proxyHost, ":3003"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/connections": __assign({ target: "http://".concat(proxyHost, ":3004"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/jobs": __assign({ target: "http://".concat(proxyHost, ":3005"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/applications": __assign({ target: "http://".concat(proxyHost, ":3006"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/threads": __assign({ target: "http://".concat(proxyHost, ":3007"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/messages": __assign({ target: "http://".concat(proxyHost, ":3007"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/analytics": __assign({ target: "http://".concat(proxyHost, ":3008"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/network": __assign({ target: "http://".concat(proxyHost, ":3009"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/events": __assign({ target: "http://".concat(proxyHost, ":3008"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        /** AI service (FastAPI on 3010). Browser calls `/ai-service/*` → same-origin in dev; avoids direct `localhost:3010` failures. */
        "/ai-service": {
            target: aiProxyTarget,
            changeOrigin: true,
            rewrite: function (path) { return path.replace(/^\/ai-service/, ""); },
            timeout: 120000,
            proxyTimeout: 120000,
            ws: true
        }
    };
    var redirectLegacyRecruiterUrls = function () { return ({
        name: "redirect-legacy-recruiter-route",
        configureServer: function (server) {
            server.middlewares.use(function (req, res, next) {
                var _a, _b;
                var pathOnly = (_b = (_a = req.url) === null || _a === void 0 ? void 0 : _a.split("?")[0]) !== null && _b !== void 0 ? _b : "";
                var match = pathOnly.match(/^\/recruiters\/(\d+)\/?$/);
                if (match) {
                    res.statusCode = 302;
                    res.setHeader("Location", "/profile/".concat(match[1], "?type=recruiter"));
                    res.end();
                    return;
                }
                next();
            });
        }
    }); };
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
                    "/api/network": __assign({ target: "http://".concat(proxyHost, ":3009"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
                    "/api": __assign({ target: gateway }, proxyLong),
                    "/ai-service": {
                        target: aiProxyTarget,
                        changeOrigin: true,
                        rewrite: function (path) { return path.replace(/^\/ai-service/, ""); },
                        timeout: 120000,
                        proxyTimeout: 120000,
                        ws: true
                    }
                }
                : serviceProxies
        }
    };
});
