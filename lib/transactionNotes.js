const NOTES_STORAGE_KEY = "transactionNotes";

function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  const numeric = String(value).replace(/[^\d-]/g, "");
  if (!numeric) return 0;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getTransactionNoteKey(transaction) {
  const tanggal = String(transaction?.tanggal || "").trim();
  const deskripsi = String(transaction?.deskripsi || "").trim();
  const debit = parseAmount(transaction?.debit);
  const kredit = parseAmount(transaction?.kredit);
  const amount = debit > 0 ? debit : kredit;
  return `${tanggal}|${deskripsi}|${amount}`;
}

export function loadTransactionNotes() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTransactionNote(key, note) {
  if (typeof window === "undefined") return {};
  const notes = loadTransactionNotes();
  const trimmed = String(note || "").trim();

  if (trimmed) {
    notes[key] = trimmed;
  } else {
    delete notes[key];
  }

  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  return notes;
}

export function syncNotesFromTransactions(transactions) {
  if (typeof window === "undefined") return {};
  const notes = loadTransactionNotes();
  let changed = false;

  transactions.forEach((transaction) => {
    const note = String(transaction?.notes || "").trim();
    if (!note) return;
    const key = getTransactionNoteKey(transaction);
    if (notes[key] !== note) {
      notes[key] = note;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }

  return notes;
}

export function truncateNote(text, max = 30) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
