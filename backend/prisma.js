process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://u177512110_Noureddine:Ilovetowork53%21@127.0.0.1:3306/u177512110_Streetstore";
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
module.exports = prisma;
