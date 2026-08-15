const { getConfig } = require("./config");

function getClient() {
  const cfg = getConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;
  const { createClient } = require("@supabase/supabase-js");
  return createClient(cfg.supabaseUrl, cfg.supabaseKey);
}

function toRow(appt) {
  return {
    id: appt.id,
    confirmation_id: appt.confirmationId,
    doctor_id: appt.doctorId || null,
    doctor_name: appt.doctorName,
    specialty: appt.specialty || null,
    appointment_date: appt.date,
    appointment_time: appt.time,
    patient_name: appt.patientName,
    dob: appt.dob || null,
    age: appt.age || null,
    gender: appt.gender || null,
    phone: appt.phone,
    email: appt.email,
    address: appt.address || null,
    reason: appt.reason || null,
    insurance: appt.insurance || null,
    status: appt.status || "booked",
    notes: appt.notes || appt.reason || null,
    doctor_notes: appt.doctorNotes || null,
    created_at: appt.createdAt,
  };
}

async function saveAppointment(appt) {
  const client = getClient();
  if (!client) return { skipped: true };

  const { error } = await client.from("appointments").upsert(toRow(appt), {
    onConflict: "id",
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function deleteAppointmentRow(id) {
  const client = getClient();
  if (!client) return { skipped: true };
  const { error } = await client.from("appointments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = { saveAppointment, deleteAppointmentRow };
