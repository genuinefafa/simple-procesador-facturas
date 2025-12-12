"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    schema: './database/schema.ts',
    out: './database/migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: '../data/database.sqlite',
    },
    verbose: true,
    strict: true,
};
