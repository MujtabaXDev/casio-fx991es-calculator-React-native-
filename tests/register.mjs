// Lets Node run the app's ES modules directly: resolves extensionless imports to .js.
import { register } from "node:module";
register("./resolve-hook.mjs", import.meta.url);
