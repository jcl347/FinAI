/**
 * Node ESM resolution hook: lets `node --use-system-ca --import ./scripts/register-ts.mjs ...`
 * run the website's TypeScript modules unchanged. The website (Next.js) uses extensionless
 * relative imports (`./costs`, `../strategies/types`); Node's native TS runner requires
 * explicit `.ts` extensions. This hook bridges the gap at runtime ONLY — the source files
 * stay extensionless and Next-compatible. No build step, no node_modules needed.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

export async function resolve(specifier, context, nextResolve) {
  // Only touch relative specifiers that lack a recognized extension.
  if (specifier.startsWith(".") && !/\.(mjs|cjs|js|ts|mts|cts|json|node)$/.test(specifier)) {
    const parentURL = context.parentURL;
    if (parentURL && parentURL.startsWith("file:")) {
      const base = pathResolve(dirname(fileURLToPath(parentURL)), specifier);
      for (const cand of [base + ".ts", base + "/index.ts"]) {
        if (existsSync(cand)) {
          return { url: pathToFileURL(cand).href, shortCircuit: true };
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
