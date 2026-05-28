export const PDF_PASSWORD_UNSUPPORTED_CODE = "PDF_PASSWORD_UNSUPPORTED";

export const PDF_PASSWORD_UNSUPPORTED_MESSAGE =
  "PDF password protected belum didukung sepenuhnya. Coba export PDF tanpa password dari aplikasi bank kamu dulu.";

export const PDF_PASSWORD_INSTRUCTIONS = [
  "BCA: Settings → e-Statement → Download tanpa password",
  "Jago: Export PDF → pilih tanpa enkripsi",
  "Mandiri: Rekening Koran → Download PDF biasa",
];

export function formatPdfPasswordUnsupportedError() {
  const lines = [
    PDF_PASSWORD_UNSUPPORTED_MESSAGE,
    "",
    "Cara export tanpa password:",
    ...PDF_PASSWORD_INSTRUCTIONS.map((line) => `- ${line}`),
  ];
  return lines.join("\n");
}
