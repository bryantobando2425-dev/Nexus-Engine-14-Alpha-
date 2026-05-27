import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Server listening on ${host}:${port}`);
});
