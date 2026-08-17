const state = {
  doctors: [],
  index: 0,
};

let autoLoopTimer = null;
let loopJumping = false;

function currentDoctor() {
  return state.doctors[state.index] || null;
}

function makeDoctorCard(doctor) {
  const card = document.createElement("article");
  card.className = "doctor-card";
  card.innerHTML = `
    <div class="photo-wrap">
      <img src="${doctor.photo}?v=2" alt="${doctor.name}" />
    </div>
    <h3>${doctor.name}</h3>
    <p class="specialty">${doctor.specialty}</p>
    <p class="doctor-bio">${doctor.description || ""}</p>
    <div class="name-rule"></div>
  `;
  return card;
}

function setTrackPosition(visualIndex, animate) {
  const track = document.getElementById("doctorTrack");
  const viewport = document.getElementById("doctorViewport");
  const width = viewport.clientWidth || 280;
  track.style.transition = animate ? "transform 0.36s cubic-bezier(0.22, 0.61, 0.36, 1)" : "none";
  track.style.transform = `translateX(-${visualIndex * width}px)`;
}

function updateDots() {
  document.querySelectorAll("#doctorDots .dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === state.index);
  });
}

function renderDoctors() {
  const track = document.getElementById("doctorTrack");
  const dots = document.getElementById("doctorDots");
  track.innerHTML = "";
  dots.innerHTML = "";
  if (!state.doctors.length) return;

  const last = state.doctors[state.doctors.length - 1];
  const first = state.doctors[0];
  track.appendChild(makeDoctorCard(last));
  state.doctors.forEach((doctor, i) => {
    track.appendChild(makeDoctorCard(doctor));
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot" + (i === state.index ? " active" : "");
    dot.setAttribute("aria-label", `Show ${doctor.name}`);
    dot.addEventListener("click", () => {
      restartAutoLoop();
      goToDoctor(i);
    });
    dots.appendChild(dot);
  });
  track.appendChild(makeDoctorCard(first));
  setTrackPosition(state.index + 1, false);
}

function goToDoctor(nextIndex, direction) {
  const count = state.doctors.length;
  if (!count || loopJumping) return;
  const wrapped = ((nextIndex % count) + count) % count;
  const from = state.index;
  if (wrapped === from && direction == null) return;

  if (direction === 1 && from === count - 1 && wrapped === 0) {
    loopJumping = true;
    state.index = 0;
    updateDots();
    setTrackPosition(count + 1, true);
    return;
  }
  if (direction === -1 && from === 0 && wrapped === count - 1) {
    loopJumping = true;
    state.index = count - 1;
    updateDots();
    setTrackPosition(0, true);
    return;
  }

  state.index = wrapped;
  updateDots();
  setTrackPosition(wrapped + 1, true);
}

function bindLoopReset() {
  document.getElementById("doctorTrack").addEventListener("transitionend", (event) => {
    if (event.propertyName !== "transform" || !loopJumping) return;
    loopJumping = false;
    setTrackPosition(state.index + 1, false);
  });
}

function startAutoLoop() {
  stopAutoLoop();
  autoLoopTimer = setInterval(() => goToDoctor(state.index + 1, 1), 1850);
}

function stopAutoLoop() {
  if (autoLoopTimer) {
    clearInterval(autoLoopTimer);
    autoLoopTimer = null;
  }
}

function restartAutoLoop() {
  stopAutoLoop();
  startAutoLoop();
}

async function loadDoctors() {
  try {
    const res = await fetch("/api/doctors");
    const data = await res.json();
    state.doctors = Array.isArray(data) && data.length ? data : FALLBACK_DOCTORS;
  } catch {
    state.doctors = FALLBACK_DOCTORS;
  }
  if (!state.doctors.length) return;
  renderDoctors();
  startAutoLoop();
}

function bindSwipe() {
  const viewport = document.getElementById("doctorViewport");
  let startX = 0;
  let dragging = false;

  const begin = (x) => {
    dragging = true;
    startX = x;
    stopAutoLoop();
  };
  const finish = (x) => {
    if (!dragging) return;
    dragging = false;
    const dx = x - startX;
    if (dx < -40) goToDoctor(state.index + 1, 1);
    if (dx > 40) goToDoctor(state.index - 1, -1);
    restartAutoLoop();
  };

  viewport.addEventListener("touchstart", (event) => begin(event.touches[0].clientX), { passive: true });
  viewport.addEventListener("touchend", (event) => finish(event.changedTouches[0].clientX));
  viewport.addEventListener("mousedown", (event) => begin(event.clientX));
  window.addEventListener("mouseup", (event) => finish(event.clientX));
}

document.getElementById("addAppointmentBtn").addEventListener("click", async () => {
  let doctor = currentDoctor();
  if (!doctor) {
    await loadDoctors();
    doctor = currentDoctor();
  }
  if (doctor) {
    sessionStorage.setItem(
      "bookingDraft",
      JSON.stringify({
        doctorId: doctor.id,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        description: doctor.description || "",
        photo: doctor.photo,
      })
    );
  }
  window.location.href = "/appointment.html";
});

const slider = document.querySelector(".doctor-slider");
slider.addEventListener("mouseenter", stopAutoLoop);
slider.addEventListener("mouseleave", startAutoLoop);

bindSwipe();
bindLoopReset();
loadDoctors();
window.addEventListener("resize", () => setTrackPosition(state.index + 1, false));
