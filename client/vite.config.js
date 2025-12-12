"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vite_1 = require("@sveltejs/kit/vite");
var vite_2 = require("vite");
var path_1 = require("path");
exports.default = (0, vite_2.defineConfig)(function (_a) {
    var mode = _a.mode;
    // Cargar variables de entorno desde .env
    var env = (0, vite_2.loadEnv)(mode, process.cwd(), '');
    return {
        plugins: [
            (0, vite_1.sveltekit)(),
            {
                name: 'log-server-start',
                configureServer: function (server) {
                    var _a;
                    (_a = server.httpServer) === null || _a === void 0 ? void 0 : _a.once('listening', function () {
                        var _a;
                        var address = (_a = server.httpServer) === null || _a === void 0 ? void 0 : _a.address();
                        var port = typeof address === 'object' && address ? address.port : env.VITE_PORT || 5173;
                        console.log('\n┌─────────────────────────────────────────┐');
                        console.log('│  🎨 FRONTEND (SvelteKit)                │');
                        console.log("\u2502  http://localhost:".concat(port, "                   \u2502"));
                        console.log('└─────────────────────────────────────────┘\n');
                    });
                }
            }
        ],
        resolve: {
            alias: {
                '@server': path_1.default.resolve(__dirname, '../server')
            }
        },
        server: {
            port: parseInt(env.VITE_PORT || '5173'),
            host: env.VITE_HOST || 'localhost',
            strictPort: false,
        },
        preview: {
            port: parseInt(env.VITE_PREVIEW_PORT || '4173'),
            host: env.VITE_HOST || 'localhost',
        },
        build: {
            rollupOptions: {
                external: ['better-sqlite3', 'drizzle-orm', 'pdf-parse', 'sharp', 'exceljs']
            }
        },
        ssr: {
            external: ['better-sqlite3', 'drizzle-orm', 'pdf-parse', 'sharp', 'exceljs']
        }
    };
});
