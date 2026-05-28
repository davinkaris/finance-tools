const STORAGE_KEY = "accounts";

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getAccounts() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistAccounts(accounts) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function getAccountById(id) {
  return getAccounts().find((account) => account.id === id) || null;
}

export function saveAccount(account) {
  if (typeof window === "undefined") return null;

  const accounts = getAccounts();
  const payload = {
    id: account.id || generateId(),
    nama: String(account.nama || "").trim(),
    tipe: account.tipe === "cc" ? "cc" : "bank",
    bank: String(account.bank || "").trim(),
    warna: String(account.warna || "#1B4332").trim(),
    createdAt: account.createdAt || new Date().toISOString(),
  };

  accounts.push(payload);
  persistAccounts(accounts);
  return payload;
}

export function updateAccount(id, data) {
  if (typeof window === "undefined") return null;

  const accounts = getAccounts();
  const index = accounts.findIndex((account) => account.id === id);
  if (index < 0) return null;

  const current = accounts[index];
  const updated = {
    ...current,
    ...data,
    id: current.id,
    tipe: data.tipe === "cc" ? "cc" : data.tipe === "bank" ? "bank" : current.tipe,
    createdAt: current.createdAt,
  };

  accounts[index] = updated;
  persistAccounts(accounts);
  return updated;
}

export function deleteAccount(id) {
  if (typeof window === "undefined") return false;

  const accounts = getAccounts().filter((account) => account.id !== id);
  if (accounts.length === getAccounts().length) return false;

  persistAccounts(accounts);
  return true;
}
