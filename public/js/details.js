let draft = null;
try {
  draft = JSON.parse(sessionStorage.getItem("bookingDraft") || "null");
} catch {
  draft = null;
}

const layout = document.getElementById("patientLayout");
const missing = document.getElementById("missingDraft");

if (!draft || !draft.date || !draft.time || !draft.doctorId) {
  layout.hidden = true;
  missing.hidden = false;
} else {
  document.getElementById("summaryDate").textContent = draft.dateLabel || draft.date;
  document.getElementById("summaryTime").textContent = draft.time;
  fillSavedFields();
  loadPublishedDoctor();
}

function fillSavedFields() {
  if (draft.patientName) document.getElementById("patientName").value = draft.patientName;
  if (draft.dob) document.getElementById("dob").value = draft.dob;
  if (draft.email) document.getElementById("email").value = draft.email;
  if (draft.phone) document.getElementById("phone").value = draft.phone;
  if (draft.age) document.getElementById("age").value = draft.age;
  if (draft.address) document.getElementById("address").value = draft.address;
  if (draft.reason) document.getElementById("reason").value = draft.reason;
  if (draft.insurance) document.getElementById("insurance").value = draft.insurance;
  if (draft.gender) {
    const gender = document.querySelector(`input[name="gender"][value="${draft.gender}"]`);
    if (gender) gender.checked = true;
  }
}

function showDoctor(doctor) {
  const photo = publicPhotoUrl(doctor.photo);
  document.getElementById("summaryDoctor").textContent = doctor.name;
  document.getElementById("summarySpecialty").textContent = doctor.specialty || "";
  document.getElementById("summaryDescription").textContent = doctor.description || "";
  const img = document.getElementById("summaryPhoto");
  img.src = `${photo}?v=3`;
  img.onerror = () => {
    img.onerror = null;
    img.src = "/images/doctor-placeholder.svg";
  };
  draft.doctorName = doctor.name;
  draft.specialty = doctor.specialty;
  draft.description = doctor.description;
  draft.photo = photo;
}

async function loadPublishedDoctor() {
  showDoctor({
    name: draft.doctorName,
    specialty: draft.specialty,
    description: draft.description,
    photo: draft.photo,
  });
  try {
    const res = await fetch(`/api/doctors/${draft.doctorId}`);
    const doctor = await res.json();
    if (res.ok && doctor && doctor.name) showDoctor(doctor);
  } catch {
    // draft photo already showing
  }
}

function ageFromDob(value) {
  if (!value) return "";
  const born = new Date(value);
  if (Number.isNaN(born.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age <= 120 ? String(age) : "";
}

document.getElementById("dob").addEventListener("change", () => {
  const age = ageFromDob(document.getElementById("dob").value);
  if (age) document.getElementById("age").value = age;
});

document.getElementById("patientForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.getElementById("formError");
  error.hidden = true;

  if (!draft || !draft.date || !draft.time || !draft.doctorId) {
    error.hidden = false;
    error.textContent = "Please select a doctor, date and time first.";
    return;
  }

  const genderInput = document.querySelector('input[name="gender"]:checked');
  const nextDraft = {
    ...draft,
    patientName: document.getElementById("patientName").value.trim(),
    dob: document.getElementById("dob").value,
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    gender: genderInput ? genderInput.value : "",
    age: document.getElementById("age").value,
    address: document.getElementById("address").value.trim(),
    reason: document.getElementById("reason").value.trim(),
    insurance: document.getElementById("insurance").value.trim(),
  };

  sessionStorage.setItem("bookingDraft", JSON.stringify(nextDraft));
  window.location.href = "/confirmation.html";
});
