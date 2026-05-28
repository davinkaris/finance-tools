export const INCOME_CATEGORY_DEFAULTS = ["Gaji & Pemasukan", "Investasi"];
export const FALLBACK_INCOME_CATEGORY = "Gaji & Pemasukan";
export const FALLBACK_EXPENSE_CATEGORY = "Lainnya";

const KATEGORI_MAP = {
  transfer: "Transfer",
  "tagihan & utilitas": "Tagihan & Utilitas",
  "makanan & minuman": "Makanan & Minuman",
  shopping: "Shopping",
  transport: "Transport",
  "gaji & pemasukan": "Gaji & Pemasukan",
  investasi: "Investasi",
  hiburan: "Hiburan",
  kesehatan: "Kesehatan",
  lainnya: "Lainnya",
};

export function normalizeKategori(k) {
  const raw = String(k || FALLBACK_EXPENSE_CATEGORY).trim();
  return KATEGORI_MAP[raw.toLowerCase()] || raw;
}

export function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  const numeric = String(value).replace(/[^\d-]/g, "");
  if (!numeric) return 0;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferJenisFromAmounts(debit, kredit) {
  const d = parseAmount(debit);
  const k = parseAmount(kredit);
  if (k > 0 && d === 0) return "income";
  if (d > 0 && k === 0) return "expense";
  return "expense";
}

export function buildIncomeCategoryNames(
  categoryRenames = {},
  customCategories = [],
) {
  const names = new Set();
  INCOME_CATEGORY_DEFAULTS.forEach((orig) => {
    names.add(categoryRenames[orig] || orig);
  });
  customCategories.forEach((cat) => {
    if (cat.type === "income") {
      names.add(cat.name);
    }
  });
  return names;
}

export function isIncomeCategory(kategori, incomeCategoryNames) {
  return incomeCategoryNames.has(normalizeKategori(kategori));
}

export function fixCategoryForJenis(kategori, jenis, incomeCategoryNames) {
  const normalized = normalizeKategori(kategori);
  const isIncome = isIncomeCategory(normalized, incomeCategoryNames);

  if (jenis === "income") {
    return isIncome ? normalized : FALLBACK_INCOME_CATEGORY;
  }

  return isIncome ? FALLBACK_EXPENSE_CATEGORY : normalized;
}

export function processTransaction(transaction, incomeCategoryNames) {
  const jenis =
    transaction?.jenis ||
    inferJenisFromAmounts(transaction?.debit, transaction?.kredit);
  const kategori = fixCategoryForJenis(
    transaction?.kategori || FALLBACK_EXPENSE_CATEGORY,
    jenis,
    incomeCategoryNames,
  );

  return {
    ...transaction,
    jenis,
    kategori,
  };
}

export function processTransactions(transactions, incomeCategoryNames) {
  return transactions.map((transaction) =>
    processTransaction(transaction, incomeCategoryNames),
  );
}
