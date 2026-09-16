import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

function runtimeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "test") runtimeFiles(path, out);
    } else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * package.json sets "type": "module" and Vercel runs each api/ function
 * unbundled, so Node's ESM resolver needs explicit file extensions on
 * relative imports; an extensionless one fails with ERR_MODULE_NOT_FOUND
 * at runtime even though typecheck, tests, and the Vite build all pass.
 */
describe("serverless ESM import specifiers", () => {
  it("every relative import in api/ and server/ ends in .js", () => {
    const offenders: string[] = [];
    for (const file of [
      ...runtimeFiles(join(root, "api")),
      ...runtimeFiles(join(root, "server")),
    ]) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /(?:\bfrom\s+|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g,
      )) {
        if (!match[1].endsWith(".js"))
          offenders.push(`${relative(root, file)}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
