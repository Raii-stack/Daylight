import { rmSync, rmdirSync } from "node:fs"
import { join } from "node:path"

// Vercel can restore stale route-validator files from the .next build cache.
rmSync(join(process.cwd(), ".next", "types"), { force: true, recursive: true })

// Next treats src/pages as a router root, so remove only the empty legacy folder.
try {
  rmdirSync(join(process.cwd(), "src", "pages"))
} catch (error) {
  if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error
}
