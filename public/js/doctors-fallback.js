function publicPhotoUrl(photo) {
  const map = {
    "/images/doctor-ahmad.png": "/images/doctor-ahmad.jpg",
    "/images/doctor-ahmad-new.png": "/images/doctor-ahmad.jpg",
    "/images/doctor-sarah.png": "/images/doctor-sarah.jpg",
    "/images/doctor-default.png": "/images/doctor-default.jpg",
  };
  const value = String(photo || "");
  if (map[value]) return map[value];
  if (value.startsWith("/")) return value;
  return "/images/doctor-placeholder.svg";
}

const FALLBACK_DOCTORS = [
  {
    id: 1,
    name: "Dr. Ahmad Hassan",
    specialty: "Cardiologist",
    description:
      "Heart specialist with over 10 years of experience in treating cardiovascular diseases. He provides expert consultation, diagnosis and treatment with personalized care for every patient.",
    photo: "/images/doctor-ahmad.jpg",
  },
  {
    id: 2,
    name: "Dr. Sarah Ahmed",
    specialty: "Dermatologist",
    description:
      "Skin specialist focused on acne, eczema, allergies and cosmetic dermatology. She offers careful diagnosis and treatment plans tailored to each patient.",
    photo: "/images/doctor-sarah.jpg",
  },
];
