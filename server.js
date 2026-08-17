const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;

const { sendNotifications, sendStatusNotifications, DOCTOR_EMAIL } = require("./notify");
const { getStatus, saveSecrets, getConfig, hydrateSecrets } = require("./config");
const { saveAppointment, deleteAppointmentRow } = require("./supabase");
const {
  onNetlify,
  getJson,
  setJson,
  saveUpload,
  getUpload,
  deleteUpload,
  ensureLocalDirs,
} = require("./persist");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(ROOT, "public");

const PLACEHOLDER_PHOTO = "/images/doctor-placeholder.svg";

const DEFAULT_SLOTS = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "02:00 PM",
  "02:30 PM",
];

function defaultDoctors() {
  return [
    {
      id: 1,
      name: "Dr. Ahmad Hassan",
      specialty: "Cardiologist",
      description:
        "Heart specialist with over 10 years of experience in treating cardiovascular diseases. He provides expert consultation, diagnosis and treatment with personalized care for every patient.",
      photo: "/images/doctor-ahmad.png",
      email: DOCTOR_EMAIL,
    },
    {
      id: 2,
      name: "Dr. Sarah Ahmed",
      specialty: "Dermatologist",
      description:
        "Skin specialist focused on acne, eczema, allergies and cosmetic dermatology. She offers careful diagnosis and treatment plans tailored to each patient.",
      photo: "/images/doctor-sarah.png",
      email: DOCTOR_EMAIL,
    },
  ];
}

function ensureDirs() {
  ensureLocalDirs();
}

function mergeDoctor(base, extra) {
  const doctor = { ...base, ...(extra || {}), id: base.id };
  delete doctor.hospital;
  if (!doctor.email) doctor.email = DOCTOR_EMAIL;
  if (!doctor.photo) doctor.photo = base.photo || PLACEHOLDER_PHOTO;
  return doctor;
}

function nextDoctorId(doctors) {
  const maxId = doctors.reduce((max, doctor) => Math.max(max, Number(doctor.id) || 0), 0);
  return maxId + 1;
}

function normalizeDoctors(parsed) {
  const defaults = defaultDoctors();
  if (Array.isArray(parsed.doctors) && parsed.doctors.length) {
    const used = new Set();
    return parsed.doctors.map((item, index) => {
      let id = Number(item && item.id);
      if (!Number.isFinite(id) || id < 1 || used.has(id)) {
        id = index + 1;
        while (used.has(id)) id += 1;
      }
      used.add(id);
      const base = defaults.find((doctor) => doctor.id === id) || {
        id,
        photo: PLACEHOLDER_PHOTO,
        email: DOCTOR_EMAIL,
      };
      return mergeDoctor(base, { ...item, id });
    });
  }
  if (parsed.doctor) {
    return [mergeDoctor(defaults[0], parsed.doctor), defaults[1]];
  }
  return defaults;
}

function readDoctorFields(body) {
  const name = String((body && body.name) || "").trim();
  const specialty = String((body && body.specialty) || "").trim();
  const description = String((body && body.description) || "").trim();
  const email = String((body && body.email) || "").trim();
  const hours = String((body && body.hours) || "").trim();
  const clinicAddress = String((body && body.clinicAddress) || "").trim();
  const phone = String((body && body.phone) || "").trim();
  const fee = String((body && body.fee) || "").trim();
  if (name.length < 2) return { error: "Please enter the doctor name" };
  if (specialty.length < 2) return { error: "Please enter a specialization" };
  if (description.length < 8) return { error: "Please write a description" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address" };
  }
  return { name, specialty, description, email, hours, clinicAddress, phone, fee };
}

function findAppointment(store, id) {
  const key = decodeURIComponent(String(id || ""));
  return store.appointments.find((a) => a.id === key || a.confirmationId === key) || null;
}

function publicAppointment(appt) {
  if (!appt) return null;
  const email = appt.notify && appt.notify.email;
  const patient = email && email.patient;
  return {
    id: appt.id,
    confirmationId: appt.confirmationId,
    doctorId: appt.doctorId,
    doctorName: appt.doctorName,
    specialty: appt.specialty,
    photo: appt.photo,
    date: appt.date,
    time: appt.time,
    patientName: appt.patientName,
    dob: appt.dob,
    age: appt.age,
    gender: appt.gender,
    phone: appt.phone,
    email: appt.email,
    address: appt.address,
    reason: appt.reason,
    insurance: appt.insurance,
    status: normalizeStatus(appt.status),
    createdAt: appt.createdAt,
    notify: {
      email: {
        ok: Boolean(email && email.ok),
        skipped: Boolean(email && email.skipped),
        patient: patient
          ? {
              ok: Boolean(patient.ok),
              skipped: Boolean(patient.skipped),
              to: patient.to,
            }
          : undefined,
      },
    },
  };
}

function countByStatus(list) {
  const counts = {
    total: list.length,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
  };
  list.forEach((a) => {
    counts[normalizeStatus(a.status)] += 1;
  });
  return counts;
}

function occupiesSlot(status) {
  const value = normalizeStatus(status);
  return value === "pending" || value === "confirmed";
}

function parseSlotTime(timeVal) {
  const match = String(timeVal || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && hours !== 12) hours += 12;
  if (ap === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function isPastSlot(date, time) {
  const parsed = parseSlotTime(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsed) return false;
  const [year, month, day] = date.split("-").map(Number);
  const slot = new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0, 0);
  return slot.getTime() <= Date.now();
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "booked") return "pending";
  if (["pending", "confirmed", "cancelled", "completed"].includes(value)) return value;
  return "pending";
}

function defaultNotifyPrefs() {
  return {
    doctorNewBooking: true,
    doctorStatusChange: true,
    patientNewBooking: true,
    patientStatusChange: true,
  };
}

function emptyStore() {
  return {
    doctors: defaultDoctors(),
    appointments: [],
    notify: defaultNotifyPrefs(),
  };
}

async function readStore() {
  if (!onNetlify()) ensureDirs();
  const parsed = await getJson("store");
  if (!parsed) {
    const fresh = emptyStore();
    await writeStore(fresh);
    return structuredClone(fresh);
  }
  try {
    return {
      doctors: normalizeDoctors(parsed),
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      notify: { ...defaultNotifyPrefs(), ...(parsed.notify || {}) },
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store) {
  await setJson("store", store);
}

function publicDoctor(doctor) {
  if (!doctor) return null;
  return {
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    description: doctor.description || "",
    photo: doctor.photo,
  };
}

function findDoctor(store, id) {
  const num = Number(id);
  return store.doctors.find((d) => d.id === num) || null;
}

function cookieValue(req, name) {
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionSecret() {
  return process.env.SESSION_SECRET || getConfig().dashboardPassword || "clinic-session";
}

function cookieOptions(maxAge) {
  const secure = onNetlify() || process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function createSession() {
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function isDashboardAuthed(req) {
  const header = String(req.headers.authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || cookieValue(req, "dash_session");
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireDashboard(req, res, next) {
  if (!isDashboardAuthed(req)) {
    return res.status(401).json({ error: "Please log in to the doctor dashboard" });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WEBP, or GIF images are allowed"));
    }
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(async (_req, _res, next) => {
  try {
    await hydrateSecrets();
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/uploads/:file", async (req, res) => {
  const file = await getUpload(req.params.file);
  if (!file) return res.status(404).json({ error: "Image not found" });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000");
  res.send(file.buffer);
});

if (!onNetlify()) {
  app.use(express.static(PUBLIC));
}

app.get("/api/doctors", async (_req, res) => {
  res.json((await readStore()).doctors.map(publicDoctor));
});

app.get("/api/doctors/:id", async (req, res) => {
  const doctor = findDoctor(await readStore(), req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  res.json(publicDoctor(doctor));
});

app.get("/api/doctor", async (_req, res) => {
  res.json(publicDoctor((await readStore()).doctors[0]));
});

function saveDoctorPhoto(req, res, doctorId) {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Please choose a picture" });
    }

    const store = await readStore();
    const doctor = findDoctor(store, doctorId);
    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase() || ".jpg";
    const filename = `doctor-${Date.now()}${ext}`;
    await saveUpload(filename, req.file.buffer, req.file.mimetype);

    const previous = doctor.photo;
    doctor.photo = `/uploads/${filename}`;
    await writeStore(store);

    if (previous && previous.startsWith("/uploads/")) {
      await deleteUpload(previous.replace("/uploads/", ""));
    }

    res.json({ ok: true, photo: doctor.photo, doctor });
  });
}

app.post("/api/dashboard/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  const expected = getConfig().dashboardPassword;
  if (!password || password !== expected) {
    return res.status(401).json({ error: "Incorrect dashboard password" });
  }
  const token = createSession();
  res.setHeader("Set-Cookie", `dash_session=${token}; ${cookieOptions(86400)}`);
  res.json({ ok: true });
});

app.post("/api/dashboard/logout", (req, res) => {
  res.setHeader("Set-Cookie", `dash_session=; ${cookieOptions(0)}`);
  res.json({ ok: true });
});

app.get("/api/dashboard/session", (req, res) => {
  res.json({ ok: isDashboardAuthed(req) });
});

app.get("/api/dashboard/doctors", requireDashboard, async (_req, res) => {
  res.json((await readStore()).doctors);
});

app.post("/api/doctors", requireDashboard, async (req, res) => {
  const fields = readDoctorFields(req.body);
  if (fields.error) return res.status(400).json({ error: fields.error });

  const store = await readStore();
  const doctor = {
    id: nextDoctorId(store.doctors),
    name: fields.name,
    specialty: fields.specialty,
    description: fields.description,
    email: fields.email || DOCTOR_EMAIL,
    photo: PLACEHOLDER_PHOTO,
    clinicAddress: fields.clinicAddress,
    phone: fields.phone,
    fee: fields.fee,
    hours: fields.hours,
  };
  store.doctors.push(doctor);
  await writeStore(store);
  res.status(201).json({ ok: true, doctor });
});

app.put("/api/doctors/:id", requireDashboard, async (req, res) => {
  const store = await readStore();
  const doctor = findDoctor(store, req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const fields = readDoctorFields(req.body);
  if (fields.error) return res.status(400).json({ error: fields.error });

  doctor.name = fields.name;
  doctor.specialty = fields.specialty;
  doctor.description = fields.description;
  if (fields.email) doctor.email = fields.email;
  await writeStore(store);
  res.json({ ok: true, doctor });
});

app.delete("/api/doctors/:id", requireDashboard, async (req, res) => {
  const store = await readStore();
  const doctor = findDoctor(store, req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  if (store.doctors.length <= 1) {
    return res.status(400).json({ error: "Keep at least one doctor on the booking site" });
  }
  store.doctors = store.doctors.filter((item) => item.id !== doctor.id);
  await writeStore(store);
  res.json({ ok: true });
});

app.post("/api/doctors/:id/photo", requireDashboard, (req, res) => {
  saveDoctorPhoto(req, res, req.params.id);
});

app.post("/api/doctor/photo", requireDashboard, (req, res) => {
  saveDoctorPhoto(req, res, 1);
});

app.get("/api/slots", async (req, res) => {
  const date = String(req.query.date || "").trim();
  const doctorId = Number(req.query.doctorId || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Valid date is required (YYYY-MM-DD)" });
  }

  const store = await readStore();
  if (doctorId && !findDoctor(store, doctorId)) {
    return res.status(404).json({ error: "Doctor not found" });
  }

  const excludeId = String(req.query.excludeId || "").trim();
  const booked = new Set(
    store.appointments
      .filter(
        (a) =>
          a.date === date &&
          occupiesSlot(a.status) &&
          (!doctorId || Number(a.doctorId) === doctorId) &&
          a.id !== excludeId &&
          a.confirmationId !== excludeId
      )
      .map((a) => a.time)
  );

  res.json({
    date,
    doctorId: doctorId || null,
    slots: DEFAULT_SLOTS.map((time) => ({
      time,
      available: !booked.has(time) && !isPastSlot(date, time),
    })),
  });
});

app.get("/api/appointments", requireDashboard, async (_req, res) => {
  const store = await readStore();
  res.json(
    store.appointments
      .map((a) => ({ ...a, status: normalizeStatus(a.status) }))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  );
});

function confirmationIdFor(dateVal, timeVal, doctorId) {
  const [year, month, day] = dateVal.split("-");
  const stamp = String(timeVal)
    .replace(/[^0-9]/g, "")
    .padStart(4, "0")
    .slice(0, 4);
  return `APT-${year}-${month}${day}-${stamp}-D${doctorId}`;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

app.post("/api/appointments", async (req, res) => {
  const body = req.body || {};
  const name = String(body.patientName || "").trim();
  const phoneVal = String(body.phone || "").trim();
  const emailVal = String(body.email || "").trim();
  const dateVal = String(body.date || "").trim();
  const timeVal = String(body.time || "").trim();
  const dob = String(body.dob || "").trim();
  const gender = String(body.gender || "").trim().toLowerCase();
  const address = String(body.address || "").trim();
  const reason = String(body.reason || body.notes || "").trim();
  const insurance = String(body.insurance || "").trim();
  const ageNum = parseInt(body.age, 10);
  const doctorId = Number(body.doctorId || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    return res.status(400).json({ error: "Please select a valid appointment date" });
  }
  if (!DEFAULT_SLOTS.includes(timeVal)) {
    return res.status(400).json({ error: "Please select a valid time slot" });
  }
  if (isPastSlot(dateVal, timeVal)) {
    return res.status(400).json({ error: "Please choose a future date and time" });
  }
  if (name.length < 2) {
    return res.status(400).json({ error: "Full name is required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || new Date(dob) >= new Date()) {
    return res.status(400).json({ error: "Enter a valid date of birth" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  const phoneDigits = digitsOnly(phoneVal);
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return res.status(400).json({ error: "Enter a valid phone number (10 to 15 digits)" });
  }
  if (!["male", "female", "other"].includes(gender)) {
    return res.status(400).json({ error: "Please select a gender" });
  }
  if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
    return res.status(400).json({ error: "Enter a valid age" });
  }
  if (address.length < 5) {
    return res.status(400).json({ error: "Address is required" });
  }
  if (reason.length < 3) {
    return res.status(400).json({ error: "Please describe the reason for your visit" });
  }

  const store = await readStore();
  const doctor = findDoctor(store, doctorId);
  if (!doctor) {
    return res.status(400).json({ error: "Please select a doctor" });
  }

  const taken = store.appointments.some(
    (a) =>
      Number(a.doctorId) === doctor.id &&
      a.date === dateVal &&
      a.time === timeVal &&
      occupiesSlot(a.status)
  );
  if (taken) {
    return res.status(409).json({
      error: "This time slot is already booked. Please go back and choose another time.",
    });
  }

  const confirmationId = confirmationIdFor(dateVal, timeVal, doctor.id);
  const appointment = {
    id: crypto.randomUUID(),
    confirmationId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty,
    doctorEmail: doctor.email || DOCTOR_EMAIL,
    photo: doctor.photo,
    date: dateVal,
    time: timeVal,
    patientName: name,
    dob,
    age: ageNum,
    gender,
    phone: phoneVal,
    email: emailVal,
    address,
    reason,
    insurance,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  store.appointments.push(appointment);
  await writeStore(store);

  try {
    appointment.supabase = await saveAppointment(appointment);
  } catch (err) {
    appointment.supabase = { ok: false, error: err.message };
  }

  appointment.notify = await sendNotifications(appointment, store.notify);
  await writeStore(store);
  res.status(201).json({ ok: true, appointment: publicAppointment(appointment) });
});

app.get("/api/dashboard/overview", requireDashboard, async (_req, res) => {
  const store = await readStore();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todays = store.appointments.filter((a) => a.date === todayKey);
  const counts = countByStatus(store.appointments);
  const todayCounts = countByStatus(todays);
  const upcoming = store.appointments
    .filter((a) => occupiesSlot(a.status) && a.date >= todayKey)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 6)
    .map((a) => ({
      id: a.id,
      confirmationId: a.confirmationId,
      patientName: a.patientName,
      doctorName: a.doctorName,
      date: a.date,
      time: a.time,
      status: normalizeStatus(a.status),
    }));
  res.json({
    today: todayKey,
    counts,
    todayCounts,
    upcoming,
    doctors: store.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      photo: doctor.photo,
      todayCount: todays.filter((a) => Number(a.doctorId) === doctor.id).length,
    })),
  });
});

app.put("/api/appointments/:id", requireDashboard, async (req, res) => {
  const store = await readStore();
  const found = findAppointment(store, req.params.id);
  if (!found) return res.status(404).json({ error: "Appointment not found" });

  const body = req.body || {};
  const dateVal = String(body.date || found.date).trim();
  const timeVal = String(body.time || found.time).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    return res.status(400).json({ error: "Please choose a valid date" });
  }
  if (timeVal && !DEFAULT_SLOTS.includes(timeVal)) {
    return res.status(400).json({ error: "Please choose a valid time slot" });
  }
  const taken = store.appointments.some(
    (a) =>
      a.id !== found.id &&
      Number(a.doctorId) === Number(found.doctorId) &&
      a.date === dateVal &&
      a.time === timeVal &&
      occupiesSlot(a.status)
  );
  if (taken) {
    return res.status(409).json({ error: "That time slot is already booked" });
  }

  found.date = dateVal;
  found.time = timeVal;
  if (body.notes !== undefined) found.notes = String(body.notes || "").trim();
  if (body.reason !== undefined) found.reason = String(body.reason || "").trim();
  if (body.doctorNotes !== undefined) found.doctorNotes = String(body.doctorNotes || "").trim();
  found.updatedAt = new Date().toISOString();
  await writeStore(store);
  try {
    found.supabase = await saveAppointment(found);
    await writeStore(store);
  } catch (err) {
    found.supabase = { ok: false, error: err.message };
  }
  res.json({ ok: true, appointment: found });
});

app.delete("/api/appointments/:id", requireDashboard, async (req, res) => {
  const store = await readStore();
  const found = findAppointment(store, req.params.id);
  if (!found) return res.status(404).json({ error: "Appointment not found" });
  store.appointments = store.appointments.filter((a) => a.id !== found.id);
  await writeStore(store);
  try {
    await deleteAppointmentRow(found.id);
  } catch {
    // local store is the source of truth if remote delete is unavailable
  }
  res.json({ ok: true });
});

app.put("/api/dashboard/account", requireDashboard, async (req, res) => {
  const body = req.body || {};
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const email = String(body.email || "").trim();
  const expected = getConfig().dashboardPassword;
  if (!currentPassword || currentPassword !== expected) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  const currentEmail = getConfig().doctorEmail;
  const payload = {};
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (email !== currentEmail) payload.DOCTOR_EMAIL = email;
  }
  if (newPassword) {
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    payload.DASHBOARD_PASSWORD = newPassword;
  }
  if (!payload.DOCTOR_EMAIL && !payload.DASHBOARD_PASSWORD) {
    return res.json({ ok: true, unchanged: true, status: getStatus() });
  }
  const status = await saveSecrets(payload);
  res.json({ ok: true, status });
});

app.patch("/api/appointments/:id/status", requireDashboard, async (req, res) => {
  const requested = String((req.body && req.body.status) || "").toLowerCase();
  const nextStatus = requested === "booked" ? "pending" : requested;
  if (!["pending", "confirmed", "cancelled", "completed"].includes(nextStatus)) {
    return res.status(400).json({
      error: "Choose pending, confirmed, cancelled, or completed",
    });
  }

  const store = await readStore();
  const found = findAppointment(store, req.params.id);
  if (!found) return res.status(404).json({ error: "Appointment not found" });
  found.status = nextStatus;
  found.updatedAt = new Date().toISOString();
  if (nextStatus === "confirmed" && !found.arrivedAt) {
    found.arrivedAt = found.updatedAt;
  }
  if (nextStatus === "completed") {
    found.completedAt = found.updatedAt;
  }
  await writeStore(store);

  try {
    found.notify = await sendStatusNotifications(found, store.notify);
    await writeStore(store);
  } catch (err) {
    found.notify = { ok: false, error: err.message };
    await writeStore(store);
  }
  try {
    found.supabase = await saveAppointment(found);
    await writeStore(store);
  } catch (err) {
    found.supabase = { ok: false, error: err.message };
    await writeStore(store);
  }

  res.json({ ok: true, appointment: { ...found, status: nextStatus } });
});

app.get("/api/dashboard/notify-prefs", requireDashboard, async (_req, res) => {
  const store = await readStore();
  res.json({ prefs: store.notify, email: getStatus() });
});

app.put("/api/dashboard/notify-prefs", requireDashboard, async (req, res) => {
  const store = await readStore();
  const body = req.body || {};
  for (const key of Object.keys(defaultNotifyPrefs())) {
    if (body[key] !== undefined) store.notify[key] = Boolean(body[key]);
  }
  await writeStore(store);
  res.json({ ok: true, prefs: store.notify });
});

app.get("/api/settings/status", requireDashboard, (_req, res) => {
  res.json(getStatus());
});

app.post("/api/settings", requireDashboard, async (req, res) => {
  try {
    const status = await saveSecrets(req.body || {});
    res.json({ ok: true, status });
  } catch (err) {
    res.status(400).json({ error: err.message || "Could not save settings" });
  }
});

app.get("/api/appointments/:id", async (req, res) => {
  const store = await readStore();
  const key = decodeURIComponent(req.params.id);
  const found = store.appointments.find(
    (a) => a.id === key || a.confirmationId === key
  );
  if (!found) return res.status(404).json({ error: "Appointment not found" });
  res.json(publicAppointment(found));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message || "Server error" });
});

if (!onNetlify()) {
  ensureDirs();
}

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Doctor Appointment running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
