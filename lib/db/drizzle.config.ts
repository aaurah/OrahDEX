import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Versioned migration output directory.
  // Run `pnpm --filter @workspace/db drizzle-kit generate` to produce a new
  // versioned migration file whenever the schema changes, then
  // `pnpm --filter @workspace/db drizzle-kit migrate` to apply it.
  out: path.join(__dirname, "./drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
