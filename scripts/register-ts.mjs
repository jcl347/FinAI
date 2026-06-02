// Registers the .ts extension-resolution hook. Use with:
//   node --use-system-ca --import ./scripts/register-ts.mjs <entry>.ts
import { register } from "node:module";
register("./ts-resolve.mjs", import.meta.url);
