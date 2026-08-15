const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { getConfig, DOCTOR_EMAIL } = require("./config");

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toE164(phone) {
  let digits = digitsOnly(phone);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = "92" + digits.slice(1);
  if (!digits.startsWith("+")) return `+${digits}`;
  return digits;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tableRows(rows) {
  return rows
    .map(([label, value], index) => {
      const bg = index % 2 === 0 ? "#f8fafc" : "#ffffff";
      return `<tr>
        <td style="padding:11px 14px;border:1px solid #d7e0ee;background:${bg};color:#1e3a8a;font-size:13px;font-weight:700;width:38%;">${escapeHtml(label)}</td>
        <td style="padding:11px 14px;border:1px solid #d7e0ee;background:${bg};color:#111827;font-size:13px;">${escapeHtml(value || "—")}</td>
      </tr>`;
    })
    .join("");
}

function appointmentRows(appt) {
  return [
    ["Confirmation ID", appt.confirmationId],
    ["Doctor", appt.doctorName],
    ["Specialization", appt.specialty],
    ["Appointment Date", formatDate(appt.date)],
    ["Appointment Time", appt.time],
    ["Patient Name", appt.patientName],
    ["Date of Birth", formatDate(appt.dob)],
    ["Age", appt.age],
    ["Gender", capitalize(appt.gender)],
    ["Phone", appt.phone],
    ["Email", appt.email],
    ["Address", appt.address],
    ["Reason for Visit", appt.reason],
    ["Insurance", appt.insurance || "Not provided"],
    ["Status", capitalize(appt.status) || "Booked"],
  ];
}

function wrapEmail(title, intro, appt, footer) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #c9d6ea;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:#1d4e9a;padding:22px 24px;text-align:center;">
              <div style="color:#ffffff;font-size:11px;letter-spacing:1.6px;font-weight:700;">DOCTOR APPOINTMENT</div>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:800;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 8px;color:#334155;font-size:14px;line-height:1.6;">
              ${escapeHtml(intro)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #1d4e9a;">
                <thead>
                  <tr>
                    <th colspan="2" style="background:#163e7d;color:#ffffff;padding:12px 14px;text-align:left;font-size:13px;letter-spacing:0.6px;">APPOINTMENT DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows(appointmentRows(appt))}
                </tbody>
              </table>
              <p style="margin:16px 0 0;background:#eef6ff;color:#1e3a8a;padding:12px 14px;border-radius:8px;font-size:13px;line-height:1.5;">
                ${escapeHtml(footer)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function defaultPrefs(prefs) {
  return {
    doctorNewBooking: true,
    doctorStatusChange: true,
    patientNewBooking: true,
    patientStatusChange: true,
    ...(prefs || {}),
  };
}

function doctorNotifyHtml(appt) {
  return wrapEmail(
    "New Patient Appointment",
    `Dear ${appt.doctorName}, a new appointment has been booked. Please review the patient details in the table below.`,
    appt,
    `Please arrive prepared for this visit. Confirmation ID ${appt.confirmationId}.`
  );
}

function patientConfirmHtml(appt) {
  return wrapEmail(
    "Appointment Confirmed",
    `Dear ${appt.patientName}, your appointment has been booked successfully. Please keep this confirmation for your records.`,
    appt,
    `Please arrive 15 minutes early. Confirmation ID ${appt.confirmationId}.`
  );
}

function doctorStatusHtml(appt) {
  return wrapEmail(
    `Appointment ${capitalize(appt.status)}`,
    `Dear ${appt.doctorName}, appointment ${appt.confirmationId} is now ${appt.status}.`,
    appt,
    `Status updated to ${capitalize(appt.status)}. Confirmation ID ${appt.confirmationId}.`
  );
}

function patientStatusHtml(appt) {
  return wrapEmail(
    `Appointment ${capitalize(appt.status)}`,
    `Dear ${appt.patientName}, your appointment with ${appt.doctorName} is now ${appt.status}.`,
    appt,
    `Please keep this confirmation. ID ${appt.confirmationId}.`
  );
}

function doctorStatusText(appt) {
  return [
    `Appointment ${appt.status}`,
    `Doctor: ${appt.doctorName}`,
    `Patient: ${appt.patientName}`,
    `Date: ${formatDate(appt.date)}`,
    `Time: ${appt.time}`,
    `ID: ${appt.confirmationId}`,
  ].join("\n");
}

function patientStatusText(appt) {
  return `Your appointment with ${appt.doctorName} on ${formatDate(appt.date)} at ${appt.time} is now ${appt.status}. ID: ${appt.confirmationId}.`;
}

function smsText(appt) {
  return `Your appointment with ${appt.doctorName} is confirmed for ${formatDate(appt.date)} at ${appt.time}. ID: ${appt.confirmationId}. Please arrive 15 minutes early.`;
}

function doctorText(appt) {
  return [
    `New appointment booked`,
    `Doctor: ${appt.doctorName}`,
    `Patient: ${appt.patientName}`,
    `Date: ${formatDate(appt.date)}`,
    `Time: ${appt.time}`,
    `Phone: ${appt.phone}`,
    `Email: ${appt.email}`,
    `Reason: ${appt.reason}`,
    `ID: ${appt.confirmationId}`,
  ].join("\n");
}

function appendOutbox(entry) {
  const file = path.join(__dirname, "data", "outbox.json");
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.push({ ...entry, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
}

async function sendWithResend({ apiKey, from, to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Resend email failed");
  return { ok: true, to, via: "resend", id: data.id };
}

async function sendWithGmail({ user, pass, to, subject, html, text }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Doctor Appointment" <${user}>`,
    to,
    subject,
    html,
    text,
  });
  return { ok: true, to, via: "gmail" };
}

async function sendOneEmail(cfg, { to, subject, html, text }) {
  if (cfg.resendApiKey) {
    return sendWithResend({
      apiKey: cfg.resendApiKey,
      from: `Doctor Appointment <${cfg.gmailUser || cfg.doctorEmail}>`,
      to,
      subject,
      html,
      text,
    });
  }
  if (cfg.gmailUser && cfg.gmailAppPassword) {
    return sendWithGmail({
      user: cfg.gmailUser,
      pass: cfg.gmailAppPassword,
      to,
      subject,
      html,
      text,
    });
  }
  return { ok: true, skipped: true, to, reason: "not_configured" };
}

async function trySendEmail(cfg, payload) {
  try {
    return await sendOneEmail(cfg, payload);
  } catch (err) {
    return { ok: false, error: err.message, to: payload.to };
  }
}

async function sendEmails(appt, prefs, kind = "new") {
  const cfg = getConfig();
  const p = defaultPrefs(prefs);
  const doctorTo = appt.doctorEmail || cfg.doctorEmail || DOCTOR_EMAIL;
  const sendDoctor = kind === "status" ? p.doctorStatusChange : p.doctorNewBooking;
  const sendPatient = kind === "status" ? p.patientStatusChange : p.patientNewBooking;

  let doctor = { ok: true, skipped: true, to: doctorTo };
  if (sendDoctor) {
    doctor = await trySendEmail(cfg, {
      to: doctorTo,
      subject:
        kind === "status"
          ? `Appointment ${capitalize(appt.status)} ${appt.confirmationId}`
          : `New Appointment ${appt.confirmationId} — ${appt.patientName}`,
      html: kind === "status" ? doctorStatusHtml(appt) : doctorNotifyHtml(appt),
      text: kind === "status" ? doctorStatusText(appt) : doctorText(appt),
    });
  }

  let patient = { ok: true, skipped: true, to: appt.email };
  if (sendPatient) {
    patient = await trySendEmail(cfg, {
      to: appt.email,
      subject:
        kind === "status"
          ? `Appointment ${capitalize(appt.status)} ${appt.confirmationId}`
          : `Appointment Confirmation ${appt.confirmationId}`,
      html: kind === "status" ? patientStatusHtml(appt) : patientConfirmHtml(appt),
      text: kind === "status" ? patientStatusText(appt) : smsText(appt),
    });
  }

  return {
    ok: Boolean(doctor.ok),
    to: doctor.to,
    via: doctor.via,
    skipped: Boolean(doctor.skipped),
    patient,
  };
}

async function sendPatientSms(appt) {
  const cfg = getConfig();
  if (!cfg.twilioSid || !cfg.twilioToken || !cfg.twilioFrom) {
    throw new Error("SMS is not configured. Open /settings.html and add your Twilio SID, token, and From number.");
  }

  const phone = toE164(appt.phone);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: phone,
      From: cfg.twilioFrom,
      Body: smsText(appt),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Twilio SMS failed");
  return { ok: true, to: phone, via: "twilio", sid: data.sid };
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function sendNotifications(appt, prefs) {
  const result = {
    email: { ok: false },
    sms: { ok: false },
  };
  const p = defaultPrefs(prefs);

  try {
    result.email = await withTimeout(sendEmails(appt, p, "new"), 25000, "Email");
  } catch (err) {
    result.email = {
      ok: false,
      error: err.message,
      to: appt.doctorEmail || getConfig().doctorEmail || DOCTOR_EMAIL,
    };
  }

  result.sms = { ok: true, skipped: true };

  appendOutbox({
    confirmationId: appt.confirmationId,
    doctorEmail: appt.doctorEmail || getConfig().doctorEmail || DOCTOR_EMAIL,
    patientPhone: appt.phone,
    patientEmail: appt.email,
    result,
  });

  return result;
}

async function sendStatusNotifications(appt, prefs) {
  const result = {
    email: { ok: false },
  };
  try {
    result.email = await withTimeout(sendEmails(appt, prefs, "status"), 25000, "Email");
  } catch (err) {
    result.email = {
      ok: false,
      error: err.message,
      to: appt.doctorEmail || getConfig().doctorEmail || DOCTOR_EMAIL,
    };
  }
  appendOutbox({
    confirmationId: appt.confirmationId,
    kind: "status",
    status: appt.status,
    result,
  });
  return result;
}

module.exports = {
  DOCTOR_EMAIL,
  sendNotifications,
  sendStatusNotifications,
  formatDate,
};
