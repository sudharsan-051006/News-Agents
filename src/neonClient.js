import { neon } from "@neondatabase/serverless";

const neonUrl = import.meta.env.VITE_NEON_DATABASE_URL;

if (!neonUrl) {
  console.warn("Missing VITE_NEON_DATABASE_URL in .env");
}

export const neonSql = neonUrl ? neon(neonUrl) : null;
