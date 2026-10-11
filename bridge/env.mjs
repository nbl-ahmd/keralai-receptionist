import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Render supplies process.env. Never shadow hosted configuration with local files.
// In development resolve relative to this service, independent of shell cwd.
// Existing process.env wins; .env.local wins over the legacy bridge/.env fallback.
if (process.env.NODE_ENV !== 'production') {
  for (const name of ['.env.local', '.env']) {
    const path = fileURLToPath(new URL(name, import.meta.url));
    if (existsSync(path)) dotenv.config({ path, override: false });
  }
}
