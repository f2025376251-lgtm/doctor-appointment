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

const state = {
  doctor: null,
  viewYear: 0,
  viewMonth: 0,
  selectedDate: "",
  selectedTime: "",
};

let draft = null;
let slotsRequest = 0;

try {
  draft = JSON.parse(sessionStorage.getItem("bookingDraft") || "null");
} catch {
  draft = null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function nowDate() {
  return new Date();
}

function toKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayKey() {
  const today = nowDate();
  return toKey(today.getFullYear(), today.getMonth(), today.getDate());
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function formatPretty(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function defaultDateKey() {
  const today = nowDate();
  const lastSlot = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30, 0);
  if (Date.now() > lastSlot.getTime()) {
    const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return toKey(next.getFullYear(), next.getMonth(), next.getDate());
  }
  return todayKey();
}

function isPastDate(key) {
  return Boolean(key) && key < todayKey();
}

function localSlots(date) {
  const times = [
    "09:00 AM",
    "09:30 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "02:00 PM",
    "02:30 PM",
  ];
  return times.map((time) => ({ time, available: !isPastDate(date) }));
}

function doctorPhoto(doctor) {
  const mapped = publicPhotoUrl(doctor && doctor.photo);
  if (mapped && mapped !== "/images/doctor-placeholder.svg") return mapped;
  const match = FALLBACK_DOCTORS.find((item) => item.id === Number(doctor && doctor.id));
  return (match && match.photo) || "/images/doctor-placeholder.svg";
}

function showSelectedDoctor(doctor) {
  state.doctor = doctor;
  const img = document.getElementById("selectedPhoto");
  img.src = `${doctorPhoto(doctor)}?v=3`;
  img.onerror = () => {
    img.onerror = null;
    img.src = "/images/doctor-placeholder.svg";
  };
  document.getElementById("selectedName").textContent = doctor.name || "Doctor";
  document.getElementById("selectedSpecialty").textContent = doctor.specialty || "";
  const bio = document.getElementById("selectedDescription");
  if (bio) bio.textContent = doctor.description || "";
}

function renderSlotList(slots) {
  const form = document.getElementById("slotForm");
  const hint = document.getElementById("slotHint");
  form.innerHTML = "";
  const open = slots.filter((slot) => slot.available);
  hint.hidden = false;
  hint.textContent = open.length
    ? `Available times for ${formatPretty(state.selectedDate)}`
    : "No remaining times for this date. Please choose another day.";

  slots.forEach((slot) => {
    const label = document.createElement("label");
    label.className = "slot" + (slot.available ? "" : " taken");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "slot";
    input.value = slot.time;
    input.disabled = !slot.available;
    if (slot.available && state.selectedTime === slot.time) input.checked = true;
    input.addEventListener("change", () => {
      state.selectedTime = slot.time;
      updateNextButton();
    });
    const text = document.createElement("span");
    text.textContent = slot.available ? slot.time : `${slot.time} (Unavailable)`;
    label.append(input, text);
    form.appendChild(label);
  });
}

function updateMonthNav() {
  const today = nowDate();
  const prev = document.getElementById("prevMonth");
  prev.disabled =
    state.viewYear < today.getFullYear() ||
    (state.viewYear === today.getFullYear() && state.viewMonth <= today.getMonth());
}

function renderCalendar() {
  document.getElementById("monthLabel").textContent =
    `${MONTHS[state.viewMonth]} ${state.viewYear}`;
  updateMonthNav();

  const firstDow = new Date(state.viewYear, state.viewMonth, 1).getDay();
  const thisCount = daysInMonth(state.viewYear, state.viewMonth);
  const prevCount = daysInMonth(state.viewYear, state.viewMonth - 1);
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) {
    cells.push({
      day: prevCount - firstDow + 1 + i,
      outside: true,
      monthOffset: -1,
    });
  }
  for (let d = 1; d <= thisCount; d += 1) {
    cells.push({ day: d, outside: false, monthOffset: 0 });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      day: nextDay,
      outside: true,
      monthOffset: 1,
    });
    nextDay += 1;
  }

  cells.forEach((cell) => {
    const date = new Date(state.viewYear, state.viewMonth + cell.monthOffset, cell.day);
    const key = toKey(date.getFullYear(), date.getMonth(), date.getDate());
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(cell.day);
    if (cell.outside) btn.classList.add("outside");
    if (key === state.selectedDate) btn.classList.add("selected");
    if (isPastDate(key)) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
    }
    btn.addEventListener("click", () => selectDate(key, date));
    grid.appendChild(btn);
  });
}

function selectDate(key, date) {
  if (isPastDate(key)) return;
  state.viewYear = date.getFullYear();
  state.viewMonth = date.getMonth();
  state.selectedDate = key;
  state.selectedTime = "";
  renderCalendar();
  loadSlots();
  updateNextButton();
}

async function loadSlots() {
  const hint = document.getElementById("slotHint");
  const requestId = ++slotsRequest;

  if (!state.selectedDate || !state.doctor) {
    hint.hidden = false;
    hint.textContent = "Select a date to see available times.";
    return;
  }

  renderSlotList(localSlots(state.selectedDate));
  try {
    const res = await fetch(
      `/api/slots?date=${encodeURIComponent(state.selectedDate)}&doctorId=${encodeURIComponent(state.doctor.id)}`
    );
    const data = await res.json().catch(() => ({}));
    if (requestId !== slotsRequest) return;
    if (res.ok && Array.isArray(data.slots) && data.slots.length) {
      renderSlotList(data.slots);
    }
  } catch {
    // local slots already on screen
  }
}

async function start() {
  const layout = document.getElementById("bookingLayout");
  const missing = document.getElementById("missingDraft");
  const today = nowDate();
  state.viewYear = today.getFullYear();
  state.viewMonth = today.getMonth();

  if (!draft || !draft.doctorId) {
    draft = {
      doctorId: FALLBACK_DOCTORS[0].id,
      doctorName: FALLBACK_DOCTORS[0].name,
      specialty: FALLBACK_DOCTORS[0].specialty,
      description: FALLBACK_DOCTORS[0].description,
      photo: FALLBACK_DOCTORS[0].photo,
    };
  }

  const quick =
    FALLBACK_DOCTORS.find((item) => item.id === Number(draft.doctorId)) || {
      id: draft.doctorId,
      name: draft.doctorName,
      specialty: draft.specialty,
      description: draft.description,
      photo: draft.photo,
    };
  showSelectedDoctor(quick);
  missing.hidden = true;
  layout.hidden = false;

  if (draft.date && !isPastDate(draft.date)) {
    const [y, m] = draft.date.split("-").map(Number);
    state.selectedDate = draft.date;
    state.viewYear = y;
    state.viewMonth = m - 1;
    state.selectedTime = draft.time || "";
  } else {
    const key = defaultDateKey();
    const [y, m] = key.split("-").map(Number);
    state.selectedDate = key;
    state.viewYear = y;
    state.viewMonth = m - 1;
  }

  renderCalendar();
  loadSlots();
  updateNextButton();

  try {
    const res = await fetch(`/api/doctors/${draft.doctorId}`);
    const doctor = await res.json();
    if (res.ok && doctor && doctor.name) showSelectedDoctor(doctor);
  } catch {
    // fallback photo already showing
  }
}

document.getElementById("prevMonth").addEventListener("click", () => {
  const today = nowDate();
  if (state.viewYear === today.getFullYear() && state.viewMonth <= today.getMonth()) return;
  if (state.viewYear < today.getFullYear()) return;
  state.viewMonth -= 1;
  if (state.viewMonth < 0) {
    state.viewMonth = 11;
    state.viewYear -= 1;
  }
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  state.viewMonth += 1;
  if (state.viewMonth > 11) {
    state.viewMonth = 0;
    state.viewYear += 1;
  }
  renderCalendar();
});

document.getElementById("nextBtn").addEventListener("click", () => {
  const error = document.getElementById("formError");
  if (!state.doctor || !state.selectedDate || !state.selectedTime) {
    error.hidden = false;
    error.textContent = "Please select a date and a time slot";
    return;
  }
  if (isPastDate(state.selectedDate)) {
    error.hidden = false;
    error.textContent = "Please choose a future date";
    return;
  }
  sessionStorage.setItem(
    "bookingDraft",
    JSON.stringify({
      ...draft,
      doctorId: state.doctor.id,
      doctorName: state.doctor.name,
      specialty: state.doctor.specialty,
      description: state.doctor.description || "",
      photo: state.doctor.photo,
      date: state.selectedDate,
      time: state.selectedTime,
      dateLabel: formatPretty(state.selectedDate),
    })
  );
  window.location.href = "/details.html";
});

start();
