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
    var _b, _c, _d, _e;
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    /** If set (e.g. http://localhost:3000), all `/api/*` goes to the gateway — best for uploads. */
    var gateway = ((_c = (_b = process.env.VITE_PROXY_GATEWAY) !== null && _b !== void 0 ? _b : env.VITE_PROXY_GATEWAY) !== null && _c !== void 0 ? _c : "").trim();
    var proxyHost = ((_e = (_d = process.env.VITE_PROXY_HOST) !== null && _d !== void 0 ? _d : env.VITE_PROXY_HOST) !== null && _e !== void 0 ? _e : "").trim() || "localhost";
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
        "/api/events": __assign({ target: "http://".concat(proxyHost, ":3008"), rewrite: function (path) { return path.replace(/^\/api/, ""); } }, proxyLong)
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
