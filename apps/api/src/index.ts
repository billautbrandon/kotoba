import cors from "cors";
import express from "express";

import { openDatabase } from "./db.js";
import { registerApiRoutes } from "./routes.js";

const apiPort = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const database = openDatabase();
registerApiRoutes(app, database);

app.listen(apiPort, () => {
  console.log(`[kotoba/api] listening on http://localhost:${apiPort}`);
});
