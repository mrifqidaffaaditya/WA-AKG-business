import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { config } from "../config.js";
import * as schema from "./schema.js";

const client = createClient({
  url: config.dbPath,
});

export const db = drizzle(client, { schema });
export { schema };
