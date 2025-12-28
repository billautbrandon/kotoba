import cors from "cors";
import express from "express";
import session from "express-session";
import { ZodError } from "zod";

import { openDatabase } from "./db.js";
import { registerApiRoutes } from "./routes.js";

const apiPort = Number(process.env.PORT ?? 3001);

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "kotoba.sid",
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

const database = openDatabase();
registerApiRoutes(app, database);

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Invalid request", issues: error.issues });
      return;
    }
    console.error("[kotoba/api] unhandled error", error);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(apiPort, () => {
  console.log(`[kotoba/api] listening on http://localhost:${apiPort}`);
});
