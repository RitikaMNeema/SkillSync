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
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
/** Avoid EPIPE / broken pipe on large multipart uploads (photo / resume). */
var proxyLong = {
    changeOrigin: true,
    timeout: 120000,
    proxyTimeout: 120000
};
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    /** If set (e.g. http://localhost:3000), all `/api/*` goes to the gateway — best for uploads. */
    var gateway = (_b = env.VITE_PROXY_GATEWAY) === null || _b === void 0 ? void 0 : _b.trim();
    var serviceProxies = {
        "/api/auth": __assign({ target: "http://localhost:3001", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/members": __assign({ target: "http://localhost:3002", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/posts": __assign({ target: "http://localhost:3002", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/recruiters": __assign({ target: "http://localhost:3003", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/connections": __assign({ target: "http://localhost:3004", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/jobs": __assign({ target: "http://localhost:3005", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/applications": __assign({ target: "http://localhost:3006", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/threads": __assign({ target: "http://localhost:3007", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/messages": __assign({ target: "http://localhost:3007", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/analytics": __assign({ target: "http://localhost:3008", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong),
        "/api/events": __assign({ target: "http://localhost:3008", rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong)
    };
    return {
        plugins: [react()],
        server: {
            port: 5173,
            proxy: gateway
                ? {
                    "/api": __assign({ target: gateway }, proxyLong)
                }
                : serviceProxies
        }
    };
});
