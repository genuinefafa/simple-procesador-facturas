"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("vitest/config");
var path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
                '**/*.test.ts',
                '**/*.spec.ts',
                'scripts/',
                'vitest.config.ts',
                'eslint.config.js',
                'web/**',
            ],
            thresholds: {
                lines: 10,
                functions: 40,
                branches: 60,
                statements: 10,
            },
        },
    },
    resolve: {
        alias: {
            '@': (0, path_1.resolve)(__dirname, './src'),
        },
    },
});
