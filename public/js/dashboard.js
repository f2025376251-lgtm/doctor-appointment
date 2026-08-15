const loginView = document.getElementById("loginView");
const editorView = document.getElementById("editorView");
const STATUSES = ["pending", "confirmed", "cancelled", "completed"];
const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PLACEHOLDER_PHOTO = "/images/doctor-placeholder.svg";
const PAGE_SIZE = 8;
const SLOTS = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "02:00 PM",
  "02:30 PM",
];

let doctors = [];
let currentId = null;
let creatingDoctor = false;
let appointments = [];
let statusFilter = "all";
let doctorFilter = "all";
let dateFilter = "all";
let searchFilter = "";
let currentPage = 1;
let pendingDeleteId = null;
let activePanel = "home";

async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch {
    return {
      res: { ok: false, status: 0 },
      data: { error: "Could not reach the server. Make sure the app is running." },
    };
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showLogin() {
  loginView.hidden = false;
  editorView.hidden = true;
}

function showEditor() {
  loginView.hidden = true;
  editorView.hidden = false;
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatDate(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "—";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function inDateRange(iso) {
  if (dateFilter === "all" || !iso) return true;
  const today = todayKey();
  if (dateFilter === "day") return iso === today;
  const date = new Date(`${iso}T00:00:00`);
  const now = new Date();
  if (dateFilter === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return date >= start && date <= end;
}

function showPanel(name) {
  activePanel = name;
  document.querySelectorAll(".dash-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
  document.querySelectorAll(".dash-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === name);
  });
  if (name === "home") loadOverview();
  if (name === "appointments") loadAppointments();
  if (name === "notifications") loadNotifyPrefs();
  if (name === "account") loadAccount();
}

function setFormMode() {
  const saveBtn = document.getElementById("saveDoctorBtn");
  const deleteBtn = document.getElementById("deleteDoctorBtn");
  const photoBtn = document.querySelector(".photo-btn");
  if (saveBtn) saveBtn.textContent = creatingDoctor ? "Add & Publish" : "Save & Publish";
  if (deleteBtn) deleteBtn.hidden = creatingDoctor || doctors.length <= 1;
  if (photoBtn) {
    photoBtn.style.opacity = creatingDoctor ? "0.55" : "1";
    photoBtn.style.pointerEvents = creatingDoctor ? "none" : "auto";
  }
}

function fillForm(doctor) {
  creatingDoctor = false;
  currentId = doctor.id;
  document.getElementById("previewPhoto").src = `${doctor.photo || PLACEHOLDER_PHOTO}?t=${Date.now()}`;
  document.getElementById("name").value = doctor.name || "";
  document.getElementById("specialty").value = doctor.specialty || "";
  document.getElementById("email").value = doctor.email || "";
  document.getElementById("description").value = doctor.description || "";
  document.getElementById("saveError").hidden = true;
  document.getElementById("saveOk").hidden = true;
  document.querySelectorAll(".dash-tab").forEach((tab) => {
    tab.classList.toggle("active", Number(tab.dataset.id) === doctor.id);
  });
  setFormMode();
}

function startNewDoctor() {
  creatingDoctor = true;
  currentId = null;
  document.getElementById("previewPhoto").src = PLACEHOLDER_PHOTO;
  document.getElementById("name").value = "";
  document.getElementById("specialty").value = "";
  document.getElementById("email").value = "";
  document.getElementById("description").value = "";
  document.getElementById("saveError").hidden = true;
  document.getElementById("saveOk").hidden = true;
  document.querySelectorAll(".dash-tab").forEach((tab) => tab.classList.remove("active"));
  setFormMode();
  showPanel("doctors");
  document.getElementById("name").focus();
}

function renderTabs() {
  const wrap = document.getElementById("doctorTabs");
  wrap.innerHTML = "";
  doctors.forEach((doctor) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dash-tab" + (!creatingDoctor && doctor.id === currentId ? " active" : "");
    btn.dataset.id = String(doctor.id);
    btn.innerHTML = `<img src="${doctor.photo || PLACEHOLDER_PHOTO}?t=${Date.now()}" alt="" /><span><strong>${doctor.name}</strong><span>${doctor.specialty || ""}</span></span>`;
    btn.addEventListener("click", () => fillForm(doctor));
    wrap.appendChild(btn);
  });
}

function fillDoctorFilter() {
  const select = document.getElementById("doctorFilter");
  const current = doctorFilter;
  select.innerHTML = `<option value="all">All doctors</option>`;
  doctors.forEach((doctor) => {
    const option = document.createElement("option");
    option.value = String(doctor.id);
    option.textContent = doctor.name;
    select.appendChild(option);
  });
  select.value = current;
}

function renderRoster(items) {
  const wrap = document.getElementById("doctorRoster");
  if (!items || !items.length) {
    wrap.innerHTML = `<p class="hint">No doctors yet. Add one from the Doctors tab.</p>`;
    return;
  }
  wrap.innerHTML = items
    .map(
      (doctor) => `<article class="roster-card">
        <img src="${doctor.photo || PLACEHOLDER_PHOTO}?t=${Date.now()}" alt="" />
        <div>
          <strong>${escapeHtml(doctor.name)}</strong>
          <span>${escapeHtml(doctor.specialty || "")} · ${doctor.todayCount || 0} today</span>
        </div>
      </article>`
    )
    .join("");
}

function renderUpcoming(items) {
  const wrap = document.getElementById("upcomingList");
  if (!items || !items.length) {
    wrap.innerHTML = `<p class="hint">No upcoming pending or confirmed appointments.</p>`;
    return;
  }
  wrap.innerHTML = items
    .map(
      (item) => `<article class="upcoming-card">
        <div>
          <strong>${escapeHtml(item.patientName || "Patient")}</strong>
          <span>${escapeHtml(item.doctorName || "")} · ${formatDate(item.date)} · ${escapeHtml(item.time)}</span>
        </div>
        <div class="upcoming-meta">
          ${statusBadge(item.status)}
          ${statusQuickActions(item)}
        </div>
      </article>`
    )
    .join("");
}

async function loadOverview() {
  const { res, data } = await api("/api/dashboard/overview");
  if (!res.ok) {
    showLogin();
    return;
  }
  const counts = data.counts || {};
  const todayCounts = data.todayCounts || {};
  document.getElementById("todayLabel").textContent = `${formatDate(data.today)} · ${todayCounts.total || 0} today · ${counts.total || 0} total`;
  document.getElementById("countTotal").textContent = String(counts.total || 0);
  document.getElementById("countToday").textContent = String(todayCounts.total || 0);
  document.getElementById("countPending").textContent = String(counts.pending || 0);
  document.getElementById("countConfirmed").textContent = String(counts.confirmed || 0);
  document.getElementById("countCancelled").textContent = String(counts.cancelled || 0);
  document.getElementById("countCompleted").textContent = String(counts.completed || 0);
  renderRoster(data.doctors || doctors);
  renderUpcoming(data.upcoming || []);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || "Pending";
}

function statusBadge(status) {
  const value = status || "pending";
  return `<em class="status-pill ${value}">${statusLabel(value)}</em>`;
}

function statusSelect(current, id) {
  return `<select class="status-select" data-id="${id}" aria-label="Change status">
    ${STATUSES.map((status) => `<option value="${status}" ${status === current ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
  </select>`;
}

function statusQuickActions(a) {
  const buttons = [];
  if (a.status === "pending") {
    buttons.push(
      `<button class="outline-btn small-btn arrive-btn btn-edit" type="button" data-action="arrive" data-id="${a.id}">Arrived</button>`
    );
  }
  if (a.status === "pending" || a.status === "confirmed") {
    buttons.push(
      `<button class="primary-btn small-btn complete-btn btn-save" type="button" data-action="complete" data-id="${a.id}">Complete</button>`
    );
  }
  return buttons.join("");
}

function filteredAppointments() {
  const query = searchFilter.trim().toLowerCase();
  return appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (doctorFilter !== "all" && String(a.doctorId) !== doctorFilter) return false;
    if (!inDateRange(a.date)) return false;
    if (!query) return true;
    const hay = [a.patientName, a.phone, a.email, a.confirmationId, a.doctorName, a.id]
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

function renderPager(total) {
  const pager = document.getElementById("apptPager");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;
  if (total <= PAGE_SIZE) {
    pager.innerHTML = total ? `<span>${total} appointment${total === 1 ? "" : "s"}</span>` : "";
    return;
  }
  const buttons = [];
  for (let i = 1; i <= pages; i += 1) {
    buttons.push(`<button type="button" class="page-btn${i === currentPage ? " active" : ""}" data-page="${i}">${i}</button>`);
  }
  pager.innerHTML = `<span>${total} appointments</span><div class="page-btns">${buttons.join("")}</div>`;
}

function renderAppointments() {
  const body = document.getElementById("apptBody");
  const rows = filteredAppointments();
  renderPager(rows.length);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  if (!pageRows.length) {
    body.innerHTML = `<tr><td colspan="7" class="hint">No appointments in this view.</td></tr>`;
    return;
  }
  body.innerHTML = pageRows
    .map(
      (a) => `<tr>
        <td>${formatDate(a.date)}</td>
        <td>${escapeHtml(a.time || "—")}</td>
        <td>
          <strong>${escapeHtml(a.patientName || "—")}</strong>
          <span class="cell-sub">${escapeHtml(a.confirmationId || a.id)}</span>
        </td>
        <td>${escapeHtml(a.doctorName || "—")}</td>
        <td>
          ${escapeHtml(a.phone || "—")}
          <span class="cell-sub">${escapeHtml(a.email || "")}</span>
        </td>
        <td>
          <div class="status-cell">
            ${statusBadge(a.status)}
            ${statusSelect(a.status, a.id)}
          </div>
        </td>
        <td>
          <div class="row-actions">
            ${statusQuickActions(a)}
            <button class="outline-btn small-btn btn-view" type="button" data-action="view" data-id="${a.id}">View</button>
            <button class="outline-btn small-btn btn-edit" type="button" data-action="edit" data-id="${a.id}">Edit</button>
            <button class="outline-btn small-btn danger-btn btn-delete" type="button" data-action="delete" data-id="${a.id}">Delete</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

async function loadAppointments() {
  const error = document.getElementById("apptError");
  error.hidden = true;
  const { res, data } = await api("/api/appointments");
  if (!res.ok) {
    if (res.status === 401) showLogin();
    error.hidden = false;
    error.textContent = data.error || "Could not load appointments";
    return;
  }
  appointments = Array.isArray(data) ? data : [];
  fillDoctorFilter();
  renderAppointments();
}

async function updateStatus(id, status) {
  const error = document.getElementById("apptError");
  error.hidden = true;
  const { res, data } = await api(`/api/appointments/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not update status";
    await loadAppointments();
    return;
  }
  const found = appointments.find((a) => a.id === id);
  if (found) {
    if (data.appointment) Object.assign(found, data.appointment);
    else found.status = status;
  }
  renderAppointments();
  loadOverview();
  const detail = document.getElementById("detailModal");
  if (detail && !detail.hidden && findAppt(id)) showDetail(id);
}

function findAppt(id) {
  return appointments.find((a) => a.id === id || a.confirmationId === id);
}

function closeModals() {
  document.getElementById("detailModal").hidden = true;
  document.getElementById("editModal").hidden = true;
  document.getElementById("deleteModal").hidden = true;
}

function showDetail(id) {
  const a = findAppt(id);
  if (!a) return;
  document.getElementById("detailBody").innerHTML = `
    <ul class="confirm-list">
      <li><span>Patient</span><strong>${escapeHtml(a.patientName)}</strong></li>
      <li><span>Appointment ID</span><strong>${escapeHtml(a.confirmationId || a.id)}</strong></li>
      <li><span>Doctor</span><strong>${escapeHtml(a.doctorName)}</strong></li>
      <li><span>Date</span><strong>${formatDate(a.date)}</strong></li>
      <li><span>Time</span><strong>${escapeHtml(a.time)}</strong></li>
      <li><span>Status</span><strong>${statusBadge(a.status)}</strong></li>
      <li><span>Phone</span><strong>${escapeHtml(a.phone)}</strong></li>
      <li><span>Email</span><strong>${escapeHtml(a.email)}</strong></li>
      <li><span>Date of birth</span><strong>${escapeHtml(a.dob || "—")}</strong></li>
      <li><span>Age</span><strong>${escapeHtml(a.age || "—")}</strong></li>
      <li><span>Gender</span><strong>${escapeHtml(a.gender || "—")}</strong></li>
      <li><span>Address</span><strong>${escapeHtml(a.address || "—")}</strong></li>
      <li><span>Reason / notes</span><strong>${escapeHtml(a.reason || a.notes || "—")}</strong></li>
      <li><span>Insurance</span><strong>${escapeHtml(a.insurance || "—")}</strong></li>
      <li><span>Doctor notes</span><strong>${escapeHtml(a.doctorNotes || "None")}</strong></li>
    </ul>
    <p class="hint">Doctor notes are private and never shown to patients.</p>
    <div class="dash-actions">
      ${statusQuickActions(a)}
      <button class="primary-btn btn-edit" type="button" data-action="edit" data-id="${a.id}">Edit appointment</button>
    </div>`;
  document.getElementById("detailModal").hidden = false;
}

async function fillTimeOptions(date, doctorId, selected, excludeId) {
  const select = document.getElementById("editTime");
  select.innerHTML = SLOTS.map((slot) => `<option value="${slot}">${slot}</option>`).join("");
  if (selected) select.value = selected;
  if (!date || !doctorId) return;
  const { res, data } = await api(`/api/slots?date=${date}&doctorId=${doctorId}&excludeId=${excludeId || ""}`);
  if (!res.ok || !data.slots) return;
  select.innerHTML = data.slots
    .map((slot) => {
      const label = slot.available || slot.time === selected ? slot.time : `${slot.time} (Booked)`;
      const disabled = !slot.available && slot.time !== selected ? "disabled" : "";
      const isSelected = slot.time === selected ? "selected" : "";
      return `<option value="${slot.time}" ${disabled} ${isSelected}>${label}</option>`;
    })
    .join("");
}

async function showEdit(id) {
  const a = findAppt(id);
  if (!a) return;
  document.getElementById("editId").value = a.id;
  const dateInput = document.getElementById("editDate");
  dateInput.min = todayKey();
  dateInput.value = a.date && a.date < todayKey() ? a.date : a.date || "";
  if (a.date && a.date < todayKey()) dateInput.min = a.date;
  document.getElementById("editNotes").value = a.notes || a.reason || "";
  document.getElementById("editDoctorNotes").value = a.doctorNotes || "";
  document.getElementById("editError").hidden = true;
  await fillTimeOptions(a.date, a.doctorId, a.time, a.id);
  document.getElementById("editModal").hidden = false;
}

function showDelete(id) {
  const a = findAppt(id);
  if (!a) return;
  pendingDeleteId = a.id;
  document.getElementById("deleteCopy").textContent =
    `Delete ${a.patientName || "this"} appointment on ${formatDate(a.date)} at ${a.time}? This cannot be undone.`;
  document.getElementById("deleteModal").hidden = false;
}

async function loadNotifyPrefs() {
  const { res, data } = await api("/api/dashboard/notify-prefs");
  if (!res.ok) {
    showLogin();
    return;
  }
  const prefs = data.prefs || {};
  document.getElementById("doctorNewBooking").checked = prefs.doctorNewBooking !== false;
  document.getElementById("doctorStatusChange").checked = prefs.doctorStatusChange !== false;
  document.getElementById("patientNewBooking").checked = prefs.patientNewBooking !== false;
  document.getElementById("patientStatusChange").checked = prefs.patientStatusChange !== false;
  const email = data.email || {};
  document.getElementById("emailStatus").textContent = email.emailConfigured
    ? `Sending via ${email.emailVia}. Alerts go to each doctor’s notification email.`
    : "Email sending is not configured yet. Save a Gmail App Password under SMTP setup.";
}

async function loadAccount() {
  const { res, data } = await api("/api/settings/status");
  if (!res.ok) {
    showLogin();
    return;
  }
  document.getElementById("accountEmail").value = data.doctorEmail || "";
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  document.getElementById("accountError").hidden = true;
  document.getElementById("accountOk").hidden = true;
}

async function loadDoctors(options = {}) {
  const { res, data } = await api("/api/dashboard/doctors");
  if (!res.ok) {
    showLogin();
    return;
  }
  doctors = Array.isArray(data) ? data : [];
  if (!creatingDoctor) {
    const selected = doctors.find((d) => d.id === currentId) || doctors[0];
    currentId = selected && selected.id;
    renderTabs();
    if (selected) fillForm(selected);
  } else {
    renderTabs();
    setFormMode();
  }
  fillDoctorFilter();
  showEditor();
  if (!options.keepPanel) showPanel("home");
}

async function checkSession() {
  const { data } = await api("/api/dashboard/session");
  if (data.ok) {
    await loadDoctors();
  } else {
    showLogin();
  }
}

function profilePayload() {
  return {
    name: document.getElementById("name").value.trim(),
    specialty: document.getElementById("specialty").value.trim(),
    description: document.getElementById("description").value.trim(),
    email: document.getElementById("email").value.trim(),
  };
}

document.querySelectorAll(".dash-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});

document.getElementById("upcomingList").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "arrive") await updateStatus(btn.dataset.id, "confirmed");
  if (btn.dataset.action === "complete") await updateStatus(btn.dataset.id, "completed");
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  await loadOverview();
  await loadAppointments();
  btn.disabled = false;
  btn.textContent = "Refresh";
});

document.getElementById("statusFilter").addEventListener("change", (event) => {
  statusFilter = event.target.value;
  currentPage = 1;
  renderAppointments();
});

document.getElementById("doctorFilter").addEventListener("change", (event) => {
  doctorFilter = event.target.value;
  currentPage = 1;
  renderAppointments();
});

document.getElementById("dateFilter").addEventListener("change", (event) => {
  dateFilter = event.target.value;
  currentPage = 1;
  renderAppointments();
});

document.getElementById("apptSearch").addEventListener("input", (event) => {
  searchFilter = event.target.value;
  currentPage = 1;
  renderAppointments();
});

document.getElementById("apptPager").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-page]");
  if (!btn) return;
  currentPage = Number(btn.dataset.page);
  renderAppointments();
});

document.getElementById("apptBody").addEventListener("change", async (event) => {
  const select = event.target.closest(".status-select");
  if (!select) return;
  await updateStatus(select.dataset.id, select.value);
});

document.getElementById("apptBody").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "view") showDetail(btn.dataset.id);
  if (btn.dataset.action === "edit") showEdit(btn.dataset.id);
  if (btn.dataset.action === "delete") showDelete(btn.dataset.id);
  if (btn.dataset.action === "arrive") await updateStatus(btn.dataset.id, "confirmed");
  if (btn.dataset.action === "complete") await updateStatus(btn.dataset.id, "completed");
});

document.getElementById("detailBody").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "edit") {
    document.getElementById("detailModal").hidden = true;
    showEdit(btn.dataset.id);
    return;
  }
  if (btn.dataset.action === "arrive") await updateStatus(btn.dataset.id, "confirmed");
  if (btn.dataset.action === "complete") await updateStatus(btn.dataset.id, "completed");
});

document.getElementById("closeDetailBtn").addEventListener("click", closeModals);
document.getElementById("closeEditBtn").addEventListener("click", closeModals);
document.getElementById("cancelDeleteBtn").addEventListener("click", closeModals);

document.getElementById("editDate").addEventListener("change", async () => {
  const id = document.getElementById("editId").value;
  const a = findAppt(id);
  if (!a) return;
  await fillTimeOptions(document.getElementById("editDate").value, a.doctorId, a.time, a.id);
});

document.getElementById("editForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("editId").value;
  const error = document.getElementById("editError");
  error.hidden = true;
  const payload = {
    date: document.getElementById("editDate").value,
    time: document.getElementById("editTime").value,
    notes: document.getElementById("editNotes").value.trim(),
    reason: document.getElementById("editNotes").value.trim(),
    doctorNotes: document.getElementById("editDoctorNotes").value.trim(),
  };
  const { res, data } = await api(`/api/appointments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not save appointment";
    return;
  }
  closeModals();
  await loadAppointments();
  loadOverview();
});

document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  const { res, data } = await api(`/api/appointments/${pendingDeleteId}`, { method: "DELETE" });
  closeModals();
  if (!res.ok) {
    const error = document.getElementById("apptError");
    error.hidden = false;
    error.textContent = data.error || "Could not delete appointment";
    return;
  }
  pendingDeleteId = null;
  await loadAppointments();
  loadOverview();
});

document.getElementById("addDoctorBtn").addEventListener("click", startNewDoctor);

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("loginError");
  error.hidden = true;
  const { res, data } = await api("/api/dashboard/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("password").value }),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not sign in";
    return;
  }
  await loadDoctors();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/api/dashboard/logout", { method: "POST" });
  showLogin();
});

document.getElementById("photoInput").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !currentId || creatingDoctor) return;
  const ok = document.getElementById("saveOk");
  const error = document.getElementById("saveError");
  ok.hidden = true;
  error.hidden = true;
  const body = new FormData();
  body.append("photo", file);
  const { res, data } = await api(`/api/doctors/${currentId}/photo`, { method: "POST", body });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not update photo";
    return;
  }
  const doctor = doctors.find((d) => d.id === currentId);
  if (doctor) doctor.photo = data.photo;
  document.getElementById("previewPhoto").src = `${data.photo}?t=${Date.now()}`;
  ok.hidden = false;
  ok.textContent = "Photo published";
  renderTabs();
});

document.getElementById("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = document.getElementById("saveOk");
  const error = document.getElementById("saveError");
  ok.hidden = true;
  error.hidden = true;
  const payload = profilePayload();
  const creating = creatingDoctor;
  const url = creating ? "/api/doctors" : `/api/doctors/${currentId}`;
  const { res, data } = await api(url, {
    method: creating ? "POST" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not save doctor";
    return;
  }
  if (creating) {
    doctors.push(data.doctor);
    creatingDoctor = false;
    currentId = data.doctor.id;
    fillForm(data.doctor);
    ok.hidden = false;
    ok.textContent = "Doctor added and published to the booking site";
  } else {
    const index = doctors.findIndex((d) => d.id === currentId);
    if (index >= 0) doctors[index] = { ...doctors[index], ...data.doctor };
    renderTabs();
    if (index >= 0) fillForm(doctors[index]);
    ok.hidden = false;
    ok.textContent = "Profile published to the booking site";
  }
  renderTabs();
  fillDoctorFilter();
});

document.getElementById("deleteDoctorBtn").addEventListener("click", async () => {
  if (!currentId || creatingDoctor || doctors.length <= 1) return;
  const doctor = doctors.find((d) => d.id === currentId);
  const okRemove = window.confirm(`Remove ${doctor && doctor.name ? doctor.name : "this doctor"} from the booking site?`);
  if (!okRemove) return;
  const error = document.getElementById("saveError");
  const ok = document.getElementById("saveOk");
  error.hidden = true;
  ok.hidden = true;
  const { res, data } = await api(`/api/doctors/${currentId}`, { method: "DELETE" });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not remove doctor";
    return;
  }
  doctors = doctors.filter((d) => d.id !== currentId);
  currentId = doctors[0] && doctors[0].id;
  renderTabs();
  fillDoctorFilter();
  if (doctors[0]) fillForm(doctors[0]);
  ok.hidden = false;
  ok.textContent = "Doctor removed from the booking site";
});

document.getElementById("notifyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = document.getElementById("notifyOk");
  const error = document.getElementById("notifyError");
  ok.hidden = true;
  error.hidden = true;
  const payload = {
    doctorNewBooking: document.getElementById("doctorNewBooking").checked,
    doctorStatusChange: document.getElementById("doctorStatusChange").checked,
    patientNewBooking: document.getElementById("patientNewBooking").checked,
    patientStatusChange: document.getElementById("patientStatusChange").checked,
  };
  const { res, data } = await api("/api/dashboard/notify-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not save alert settings";
    return;
  }
  ok.hidden = false;
  ok.textContent = "Alert settings saved";
});

document.getElementById("accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("accountError");
  const ok = document.getElementById("accountOk");
  error.hidden = true;
  ok.hidden = true;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  if (newPassword && newPassword.length < 8) {
    error.hidden = false;
    error.textContent = "New password must be at least 8 characters";
    return;
  }
  if (newPassword && newPassword !== confirmPassword) {
    error.hidden = false;
    error.textContent = "New password and confirmation do not match";
    return;
  }
  const { res, data } = await api("/api/dashboard/account", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPassword: document.getElementById("currentPassword").value,
      newPassword,
      email: document.getElementById("accountEmail").value.trim(),
    }),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not update account";
    return;
  }
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  ok.hidden = false;
  ok.textContent = data.unchanged ? "No changes to save" : "Account settings saved";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
});

setInterval(() => {
  if (editorView.hidden) return;
  if (activePanel === "home") loadOverview();
  if (activePanel === "appointments") loadAppointments();
}, 12000);

checkSession();
