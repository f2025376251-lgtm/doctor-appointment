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

const id = new URLSearchParams(window.location.search).get("id");
const list = document.getElementById("confirmList");
const error = document.getElementById("confirmError");
let appointment = null;

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function row(label, value, extraClass) {
  return `<li><span>${label}</span><strong class="${extraClass || ""}">${value}</strong></li>`;
}

function to24Hour(time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hours: 9, minutes: 0 };
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ap = match[3].toUpperCase();
  if (ap === "PM" && hours !== 12) hours += 12;
  if (ap === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function icsStamp(date, time, extraMinutes) {
  const [y, m, d] = date.split("-").map(Number);
  const { hours, minutes } = to24Hour(time);
  const dt = new Date(y, m - 1, d, hours, minutes + (extraMinutes || 0), 0);
  return (
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T` +
    `${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  );
}

function downloadIcs() {
  if (!appointment) return;
  const start = icsStamp(appointment.date, appointment.time, 0);
  const end = icsStamp(appointment.date, appointment.time, 30);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Doctor Appointment//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.confirmationId || appointment.id}@doctor-appointment`,
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Appointment with ${appointment.doctorName}`,
    `DESCRIPTION:Confirmation ID ${appointment.confirmationId || appointment.id}`,
    `LOCATION:${appointment.doctorName || "Doctor Appointment"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${appointment.confirmationId || "appointment"}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

async function load() {
  if (!id) {
    list.innerHTML = "";
    error.hidden = false;
    error.textContent = "No appointment was found. Please book again from the home page.";
    return;
  }

  let res;
  let data;
  try {
    res = await fetch(`/api/appointments/${encodeURIComponent(id)}`);
    data = await res.json();
  } catch {
    list.innerHTML = "";
    error.hidden = false;
    error.textContent = "Could not reach the server. Make sure the app is running.";
    return;
  }
  if (!res.ok) {
    list.innerHTML = "";
    error.hidden = false;
    error.textContent = data.error || "Appointment not found";
    return;
  }

  appointment = data;
  list.innerHTML = [
    row("Doctor", `${data.doctorName}${data.specialty ? ` (${data.specialty})` : ""}`),
    row("Date", formatDate(data.date)),
    row("Time", data.time),
    row("Patient Name", data.patientName),
    row("Confirmation ID", data.confirmationId || data.id, "confirm-id"),
  ].join("");

  const banner = document.getElementById("notifyBanner");
  const email = data.notify && data.notify.email;
  const patient = email && email.patient;
  const parts = [];
  if (patient && patient.ok && !patient.skipped) {
    parts.push(`A confirmation email was sent to ${patient.to}.`);
  }
  if (email && email.ok && !email.skipped) {
    parts.push("The clinic has been notified.");
  }
  if (!parts.length) {
    banner.textContent = "Your appointment is saved. A confirmation email will be sent when clinic email is set up.";
  } else {
    banner.textContent = parts.join(" ");
  }
  banner.classList.remove("warn");
}

document.getElementById("calendarBtn").addEventListener("click", downloadIcs);
load();
