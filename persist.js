const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC = path.join(ROOT, "public");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SECRETS_FILE = path.join(DATA_DIR, "secrets.json");
const OUTBOX_FILE = path.join(DATA_DIR, "outbox.json");
const UPLOADS = path.join(PUBLIC, "uploads");
const TMP_DIR = path.join(process.env.TMPDIR || process.env.TEMP || "/tmp", "clinic-data");

const FILES = {
  store: STORE_FILE,
  secrets: SECRETS_FILE,
  outbox: OUTBOX_FILE,
};

let getStoreFn = null;
try {
  getStoreFn = require("@netlify/blobs").getStore;
} catch {
  getStoreFn = null;
}

function onNetlify() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      ROOT === "/var/task" ||
      String(ROOT).startsWith("/var/task/")
  );
}

function blobs() {
  if (!getStoreFn) throw new Error("Netlify Blobs is not available");
  return getStoreFn({
    name: "clinic",
    consistency: "strong",
  });
}

function tmpFile(key) {
  return path.join(TMP_DIR, `${key}.json`);
}

function ensureLocalDirs() {
  if (onNetlify()) {
    try {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    } catch {
      // ignore
    }
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(UPLOADS, { recursive: true });
    fs.mkdirSync(path.join(PUBLIC, "images"), { recursive: true });
  } catch {
    // Netlify functions have a read-only filesystem
  }
}

function readLocalJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeLocalJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

let memoryStore = {};

async function getJson(key) {
  if (onNetlify()) {
    try {
      const value = await blobs().get(key, { type: "json" });
      if (value) {
        memoryStore[key] = value;
        return value;
      }
    } catch {
      // fall through
    }
    const fromTmp = readLocalJson(tmpFile(key));
    if (fromTmp) {
      memoryStore[key] = fromTmp;
      return fromTmp;
    }
    return memoryStore[key] || null;
  }
  return readLocalJson(FILES[key]);
}

async function setJson(key, value) {
  memoryStore[key] = value;
  if (onNetlify()) {
    try {
      await blobs().setJSON(key, value);
      return;
    } catch {
      // fall through to /tmp, never /var/task
    }
    try {
      writeLocalJson(tmpFile(key), value);
    } catch {
      // keep the in-memory copy so this request still works
    }
    return;
  }
  try {
    ensureLocalDirs();
    writeLocalJson(FILES[key], value);
  } catch {
    memoryStore[key] = value;
  }
}

async function saveUpload(filename, buffer, contentType) {
  const safe = path.basename(String(filename || ""));
  if (!safe) throw new Error("Invalid upload name");
  if (onNetlify()) {
    try {
      await blobs().set(`uploads/${safe}`, buffer, {
        metadata: { contentType: contentType || "application/octet-stream" },
      });
      return;
    } catch {
      const dest = path.join(TMP_DIR, "uploads");
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, safe), buffer);
      return;
    }
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
      if (data) {
        const meta = await store.getMetadata(`uploads/${safe}`);
        return {
          buffer: Buffer.from(data),
          contentType:
            (meta && meta.metadata && meta.metadata.contentType) || "application/octet-stream",
        };
      }
    } catch {
      // fall through
    }
    try {
      const file = path.join(TMP_DIR, "uploads", safe);
      if (fs.existsSync(file)) {
        return { buffer: fs.readFileSync(file), contentType: "application/octet-stream" };
      }
    } catch {
      return null;
    }
    return null;
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
    try {
      const file = path.join(TMP_DIR, "uploads", safe);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // ignore
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
