import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import http from "http";
import path from "path";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(process.cwd(), "artifacts/nexus-engine/dist/public");
  app.use(express.static(publicDir));
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  app.use((req: Request, res: Response) => {
    const frontendPort = 5000;
    const options = {
      hostname: "localhost",
      port: frontendPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${frontendPort}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on("error", () => {
      res.status(502).send(
        `<html><body style="background:#0a0c0f;color:#eef2f8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px">` +
        `<div style="font-size:48px;color:#3d8eff20">⟳</div>` +
        `<div>Iniciando NEXUS ENGINE...</div>` +
        `<div style="font-size:12px;color:#5a6478">El servidor frontend todavía está arrancando. Recarga en unos segundos.</div>` +
        `<script>setTimeout(()=>location.reload(),3000)</script>` +
        `</body></html>`,
      );
    });

    req.pipe(proxyReq, { end: true });
  });
}

export default app;
