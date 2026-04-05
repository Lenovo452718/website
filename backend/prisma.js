process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://u177512110_Noureddine:Ilovetowork53%21@srv2123.hstgr.io:3306/u177512110_Streetstore?connection_limit=3&pool_timeout=10";
// Force library engine (avoids binary subprocess panic on shared hosting)
process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
module.exports = prisma;
