/**
 * Shared Prisma client singleton with SQLite adapter
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'prisma', 'streetstore.db');
const url    = 'file:' + dbPath.split(path.sep).join('/');

const adapter = new PrismaBetterSqlite3({ url });
const prisma  = new PrismaClient({ adapter });

module.exports = prisma;
