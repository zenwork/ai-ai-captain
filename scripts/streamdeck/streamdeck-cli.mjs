// Update an installed copy or link the built plugin, then restart it.
import { reloadStreamDeckPlugin } from "./plugin-tools.mjs";

process.exitCode = reloadStreamDeckPlugin();
