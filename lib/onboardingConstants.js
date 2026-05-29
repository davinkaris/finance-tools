export const OCCUPATION_OPTIONS = [
  "Karyawan Swasta",
  "PNS",
  "Wirausaha/Entrepreneur",
  "Freelancer",
  "Profesional (Dokter/Pengacara/dll)",
  "Mahasiswa",
  "Lainnya",
];

export const INCOME_OPTIONS = [
  "< Rp 5 juta",
  "Rp 5-10 juta",
  "Rp 10-20 juta",
  "Rp 20-50 juta",
  "> Rp 50 juta",
  "Prefer tidak menyebutkan",
];

export const BANK_OPTIONS = [
  "Jago",
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "CIMB",
  "OCBC",
  "Permata",
  "Danamon",
  "BSI",
  "Lainnya",
];

export const COLOR_OPTIONS = [
  "#63B3ED",
  "#10b981",
  "#3b82f6",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#eab308",
  "#ef4444",
];

export const MONTH_OPTIONS = [
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

export function getDayOptions(month, year) {
  if (!month || !year) {
    return Array.from({ length: 31 }, (_, index) => index + 1);
  }

  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => index + 1);
}

export function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear - 17; year >= currentYear - 80; year -= 1) {
    years.push(year);
  }
  return years;
}

export function calculateAge(birthDay, birthMonth, birthYear) {
  if (!birthDay || !birthMonth || !birthYear) return null;

  const today = new Date();
  const birth = new Date(
    Number(birthYear),
    Number(birthMonth) - 1,
    Number(birthDay),
  );

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age;
}

export function getBankInitials(bank) {
  return bank
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
