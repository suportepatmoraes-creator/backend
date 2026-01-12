import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";

const app = new Hono();

app.use("*", cors());

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

app.get("/api", (c) => {
  return c.json({ status: "ok", message: "tRPC API is running" });
});

app.get("/api/debug/routes", (c) => {
  return c.json({
    availableRoutes: [
      "GET /",
      "GET /api",
      "ALL /api/trpc/*",
      "GET /api/debug/routes"
    ],
    message: "These are the available routes"
  });
});

// Handle both GET and POST requests for tRPC
app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
    endpoint: "/api/trpc",
    batching: {
      enabled: false,
    },
  })
);

// For Vercel deployment
export default {
  fetch: app.fetch,
};

// Also export the app directly for other uses
export { app };