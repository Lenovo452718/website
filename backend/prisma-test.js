const {PrismaClient} = require("@prisma/client");
const {PrismaBetterSqlite3} = require("@prisma/adapter-better-sqlite3");
const path = require("path");
const dbPath = path.resolve(__dirname, "prisma", "streetstore.db");
// On Windows, convert backslashes to forward slashes for file: URL
const url = "file:" + dbPath.split(path.sep).join("/");
console.log("URL:", url);
const adapter = new PrismaBetterSqlite3({ url });
const p = new PrismaClient({ adapter });
p.siteSettings.findMany().then(r => {
  console.log("DB OK:", JSON.stringify(r));
  return p["$disconnect"]();
}).catch(e => {
  console.error("DB ERROR:", e.message);
  return p["$disconnect"]();
});
