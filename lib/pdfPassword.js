import {
  PDF_PASSWORD_UNSUPPORTED_CODE,
  PDF_PASSWORD_INSTRUCTIONS,
  formatPdfPasswordUnsupportedError,
} from "./pdfPasswordConstants";

export {
  PDF_PASSWORD_UNSUPPORTED_CODE,
  formatPdfPasswordUnsupportedError,
} from "./pdfPasswordConstants";

export function isPdfEncrypted(bytes) {
  const sample = Buffer.from(
    bytes.slice(0, Math.min(bytes.byteLength, 15000)),
  ).toString("latin1");
  return /\/Encrypt[\s\n\r/]/i.test(sample);
}

export function buildExtractPrompt(pdfPassword) {
  const basePrompt =
    'Extract semua transaksi yang ada, maksimal 50 transaksi dari bank statement ini. Return HANYA JSON array dengan format: [{"tanggal":"DD/MM/YYYY","deskripsi":"...","debit":0,"kredit":0,"saldo":0}]. Jangan return apapun selain JSON murni.';

  if (!pdfPassword) return basePrompt;

  return `Dokumen ini dilindungi password. Password-nya adalah: ${pdfPassword}

Baca dan extract transaksi dari dokumen ini.

${basePrompt}`;
}

export function isPdfProcessingFailure(message, status) {
  const normalized = String(message || "").toLowerCase();
  return (
    status === 400 &&
    (normalized.includes("could not process pdf") ||
      normalized.includes("password") ||
      normalized.includes("encrypt"))
  );
}

export function pdfPasswordUnsupportedResponse() {
  return Response.json(
    {
      error: formatPdfPasswordUnsupportedError(),
      code: PDF_PASSWORD_UNSUPPORTED_CODE,
      instructions: PDF_PASSWORD_INSTRUCTIONS,
    },
    { status: 422 },
  );
}
