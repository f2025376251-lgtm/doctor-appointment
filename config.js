const fs = require("fs");
const path = require("path");
const { getJson, setJson, onNetlify } = require("./persist");

const ROOT = __dirname;
const SECRETS_FILE = path.join(ROOT, "data", "secrets.json");
const DOCTOR_EMAIL = "ahmadhassan266484@gmail.com";

let secretsCache = null;

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function readSecretsFile() {
  try {
    if (onNetlify()) return {};
    return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function hydrateSecrets() {
  loadEnvFile();
  if (onNetlify()) {
    secretsCache = (await getJson("secrets")) || {};
  } else {
    secretsCache = readSecretsFile();
  }
  return secretsCache;
}

function getConfig() {
  loadEnvFile();
  const file = secretsCache || readSecretsFile();
  const pick = (key, fallback = "") =>
    String(process.env[key] || file[key] || fallback).trim();

  return {
    doctorEmail: pick("DOCTOR_EMAIL", DOCTOR_EMAIL),
    gmailUser: pick("GMAIL_USER", DOCTOR_EMAIL),
    gmailAppPassword: pick("GMAIL_APP_PASSWORD").replace(/\s+/g, ""),
    twilioSid: pick("TWILIO_SID"),
    twilioToken: pick("TWILIO_TOKEN"),
    twilioFrom: pick("TWILIO_FROM"),
    resendApiKey: pick("RESEND_API_KEY"),
    supabaseUrl: pick("SUPABASE_URL"),
    supabaseKey: pick("SUPABASE_SERVICE_ROLE_KEY") || pick("SUPABASE_ANON_KEY"),
    dashboardPassword: pick("DASHBOARD_PASSWORD", "ClinicAdmin#26"),
  };
}

function getStatus() {
  const cfg = getConfig();
  return {
    doctorEmail: cfg.doctorEmail,
    emailConfigured: Boolean(cfg.resendApiKey || (cfg.gmailUser && cfg.gmailAppPassword)),
    smsConfigured: Boolean(cfg.twilioSid && cfg.twilioToken && cfg.twilioFrom),
    supabaseConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseKey),
    emailVia: cfg.resendApiKey ? "resend" : cfg.gmailAppPassword ? "gmail" : "none",
  };
}

async function saveSecrets(input) {
  const current = (await getJson("secrets")) || secretsCache || readSecretsFile();
  const next = { ...current };
  const keys = [
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "TWILIO_SID",
    "TWILIO_TOKEN",
    "TWILIO_FROM",
    "RESEND_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DOCTOR_EMAIL",
    "DASHBOARD_PASSWORD",
  ];
  for (const key of keys) {
    if (input[key] === undefined) continue;
    const value = String(input[key] || "").trim();
    if (value === "********") continue;
    next[key] = value;
  }
  if (!next.GMAIL_USER) next.GMAIL_USER = DOCTOR_EMAIL;
  if (!next.DOCTOR_EMAIL) next.DOCTOR_EMAIL = DOCTOR_EMAIL;
  await setJson("secrets", next);
  secretsCache = next;
  return getStatus();
}

module.exports = {
  DOCTOR_EMAIL,
  SECRETS_FILE,
  getConfig,
  getStatus,
  saveSecrets,
  loadEnvFile,
  hydrateSecrets,
};
