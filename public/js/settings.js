async function api(url, options = {}) {
  try {
    const res = await fetch(url, { credentials: "include", ...options });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = "/dashboard.html";
      return { res, data };
    }
    return { res, data };
  } catch {
    return {
      res: { ok: false, status: 0 },
      data: { error: "Could not reach the server. Make sure the app is running." },
    };
  }
}

async function loadStatus() {
  const { res, data } = await api("/api/settings/status");
  if (!res.ok) return;
  const box = document.getElementById("statusBox");
  box.innerHTML = `
    <strong>Current status</strong><br />
    Doctor email: ${data.doctorEmail}<br />
    Email sending: ${data.emailConfigured ? "Ready" : "Not configured"}<br />
    Supabase: ${data.supabaseConfigured ? "Ready" : "Optional / not set"}
  `;
  if (data.doctorEmail) document.getElementById("DOCTOR_EMAIL").value = data.doctorEmail;
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("formError");
  const ok = document.getElementById("formOk");
  error.hidden = true;
  ok.hidden = true;

  const payload = {};
  ["DOCTOR_EMAIL", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].forEach((key) => {
    payload[key] = document.getElementById(key).value.trim();
  });

  const { res, data } = await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    error.hidden = false;
    error.textContent = data.error || "Could not save settings";
    return;
  }
  ok.hidden = false;
  ok.textContent = "Settings saved. New bookings will send email automatically.";
  loadStatus();
});

loadStatus();
