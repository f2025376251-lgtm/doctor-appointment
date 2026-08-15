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

let draft = null;
try {
  draft = JSON.parse(sessionStorage.getItem("bookingDraft") || "null");
} catch {
  draft = null;
}

const layout = document.getElementById("confirmLayout");
const missing = document.getElementById("missingDraft");

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function row(label, value) {
  return `<li><span>${label}</span><strong>${value || "—"}</strong></li>`;
}

if (!draft || !draft.doctorId || !draft.patientName || !draft.email) {
  layout.hidden = true;
  missing.hidden = false;
} else {
  document.getElementById("confirmList").innerHTML = [
    row("Doctor", `${draft.doctorName}${draft.specialty ? ` (${draft.specialty})` : ""}`),
    row("Date", draft.dateLabel || formatDate(draft.date)),
    row("Time", draft.time),
    row("Patient Name", draft.patientName),
    row("Date of Birth", formatDate(draft.dob)),
    row("Age", draft.age),
    row("Gender", capitalize(draft.gender)),
    row("Email", draft.email),
    row("Phone", draft.phone),
    row("Address", draft.address),
    row("Reason", draft.reason),
    row("Insurance", draft.insurance || "Not provided"),
  ].join("");
}

document.getElementById("confirmBtn").addEventListener("click", async () => {
  const error = document.getElementById("formError");
  const btn = document.getElementById("confirmBtn");
  error.hidden = true;

  if (!draft || !draft.doctorId || !draft.patientName) {
    error.hidden = false;
    error.textContent = "Please complete the previous steps first.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Booking...";

  try {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doctorId: draft.doctorId,
        date: draft.date,
        time: draft.time,
        patientName: draft.patientName,
        dob: draft.dob,
        email: draft.email,
        phone: draft.phone,
        gender: draft.gender,
        age: draft.age,
        address: draft.address,
        reason: draft.reason,
        insurance: draft.insurance,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      error.hidden = false;
      error.textContent = data.error || "Could not book appointment";
      return;
    }

    sessionStorage.removeItem("bookingDraft");
    const key = data.appointment.confirmationId || data.appointment.id;
    window.location.href = `/thanks.html?id=${encodeURIComponent(key)}`;
  } catch {
    error.hidden = false;
    error.textContent = "Could not reach the server. Make sure the app is running.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Appointment";
  }
});
