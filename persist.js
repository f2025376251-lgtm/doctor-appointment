const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC = path.join(ROOT, "public");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");
const OUTBOX_FILE = path.join(DATA_DIR, "outbox.json");
const UPLOADS = path.join(PUBLIC, "uploads");

const FILES = {
  store: STORE_FILE,
  secrets: SECRETS_FILE,
  outbox: OUTBOX_FILE,
};

function onNetlify() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV);
}

function blobs() {
  const { getStore } = require("@netlify/blobs");
  return getStore("clinic");
}

function ensureLocalDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(path.join(PUBLIC, "images"), { recursive: true });
}

async function getJson(key) {
  if (onNetlify()) {
    try {
      const value = await blobs().get(key, { type: "json" });
      return value || null;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(FILES[key], "utf8"));
  } catch {
    return null;
  }
}

async function setJson(key, value) {
  if (onNetlify()) {
    await blobs().setJSON(key, value);
    return;
  }
  ensureLocalDirs();
  fs.writeFileSync(FILES[key], JSON.stringify(value, null, 2));
}

async function saveUpload(filename, buffer, contentType) {
  const safe = path.basename(String(filename || ""));
  if (!safe) throw new Error("Invalid upload name");
  if (onNetlify()) {
    await blobs().set(`uploads/${safe}`, buffer, {
      metadata: { contentType: contentType || "application/octet-stream" },
    });
    return;
  }
  ensureLocalDirs();
  fs.writeFileSync(path.join(UPLOADS, safe), buffer);
}

async function getUpload(filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe) return null;
  if (onNetlify()) {
    try {
      const store = blobs();
      const data = await store.get(`uploads/${safe}`, { type: "arrayBuffer" });
      if (!data) return null;
      const meta = await store.getMetadata(`uploads/${safe}`);
      return {
        buffer: Buffer.from(data),
        contentType:
          (meta && meta.metadata && meta.metadata.contentType) || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }
  const file = path.join(UPLOADS, safe);
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(safe).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return { buffer: fs.readFileSync(file), contentType: types[ext] || "application/octet-stream" };
}

async function deleteUpload(filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe) return;
  if (onNetlify()) {
    try {
      await blobs().delete(`uploads/${safe}`);
    } catch {
      // ignore missing blobs
    }
    return;
  }
  const file = path.join(UPLOADS, safe);
  if (fs.existsSync(file)) fs.unlink(file, () => {});
}

module.exports = {
  onNetlify,
  getJson,
  setJson,
  saveUpload,
  getUpload,
  deleteUpload,
  ensureLocalDirs,
  DATA_DIR,
  UPLOADS,
};
