const serverless = require("serverless-http");
const { connectBlobs } = require("../../persist");
const { app } = require("../../server");

const handle = serverless(app, {
  binary: ["image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream"],
});

function normalizePath(raw) {
  let value = String(raw || "/");
  const prefix = "/.netlify/functions/api";
  if (value.startsWith(prefix)) value = value.slice(prefix.length) || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value !== "/" && !value.startsWith("/api") && !value.startsWith("/uploads")) {
    value = `/api${value}`;
  }
  return value;
}

exports.handler = async (event, context) => {
  connectBlobs(event);
  if (context && typeof context.callbackWaitsForEmptyEventLoop === "boolean") {
    context.callbackWaitsForEmptyEventLoop = false;
  }
  if (event.isBase64Encoded && event.body) {
    event.body = Buffer.from(event.body, "base64").toString("utf8");
    event.isBase64Encoded = false;
  }
  event.path = normalizePath(event.path);
  if (event.rawPath) event.rawPath = normalizePath(event.rawPath);
  return handle(event, context);
};
