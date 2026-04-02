import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve JS files with __PORT_5000__ replaced to empty string
  // so API calls go to /api/... on the same origin (needed for Render)
  app.use((req, res, next) => {
    if (!req.path.endsWith(".js")) return next();
    const filePath = path.join(distPath, req.path);
    if (!fs.existsSync(filePath)) return next();
    let content = fs.readFileSync(filePath, "utf-8");
    if (content.includes("__PORT_5000__")) {
      content = content.replace(/__PORT_5000__/g, "");
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(content);
    }
    next();
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
