import cors from "cors";
import express from "express";
import session from "express-session";
import { ZodError } from "zod";

import { openDatabase } from "./db.js";
import { registerApiRoutes } from "./routes.js";

const apiPort = Number(process.env.PORT ?? 3001);

const app = express();
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://kotoba.ovh", "https://www.kotoba.ovh"]
    : ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
const sessionConfig = {
  name: "kotoba.sid",
  secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  resave: false,
  saveUninitialized: true, // Changed to true to ensure session is created
  cookie: {
    httpOnly: true,
    sameSite: "lax" as const, // Use "lax" even in production since frontend and API are on same domain via nginx
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24,
    path: "/",
    // Do NOT set domain explicitly - let browser use default (current domain)
    // Setting domain explicitly can cause issues with cookies
  },
};

if (process.env.NODE_ENV === "production") {
  console.log("[kotoba/api] Session config:", {
    name: sessionConfig.name,
    secure: sessionConfig.cookie.secure,
    sameSite: sessionConfig.cookie.sameSite,
    path: sessionConfig.cookie.path,
  });
}

app.use(session(sessionConfig));

// Debug middleware to log session creation and Set-Cookie headers
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/auth/login") || req.path.startsWith("/api/auth/register")) {
      res.on("finish", () => {
        if (req.session && req.session.userId) {
          console.log("[kotoba/api] Session created:", {
            userId: req.session.userId,
            cookie: req.session.cookie,
            sessionId: req.sessionID,
          });
          // Log Set-Cookie header
          const setCookieHeader = res.getHeader("Set-Cookie");
          console.log("[kotoba/api] Set-Cookie header:", setCookieHeader);
        }
      });
    }
    next();
  });
}

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
