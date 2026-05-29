import { getTransactionNoteKey } from "./transactionNotes";
import { parseAmount } from "./transactionJenis";

export function generateTransactionId(transaction, index = 0) {
  const baseKey = getTransactionNoteKey(transaction);
  const accountId = transaction?.accountId || "legacy";
  return `${baseKey}|${accountId}|${index}`;
}

export function normalizeTransaction(transaction, index = 0) {
  const id = transaction?.id || generateTransactionId(transaction, index);

  return {
    ...transaction,
    id,
    accountId: transaction?.accountId ?? null,
    matchedTransactionId: transaction?.matchedTransactionId ?? null,
    matchType: transaction?.matchType ?? null,
    moveMoneyExcluded: Boolean(transaction?.moveMoneyExcluded),
  };
}

export function normalizeTransactions(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((transaction, index) =>
    normalizeTransaction(transaction, index),
  );
}

export function getTransactionDedupKey(transaction) {
  const { debit, kredit } = getTransactionAmount(transaction);
  const amount = debit > 0 ? debit : kredit;
  const tanggal = String(transaction?.tanggal || "").trim();
  const deskripsi = String(transaction?.deskripsi || "").trim();
  const accountId = transaction?.accountId ?? null;
  return `${tanggal}|${deskripsi}|${amount}|${accountId}`;
}

export function deduplicateTransactions(existing, newTransactions) {
  const existingList = Array.isArray(existing) ? existing : [];
  const newList = Array.isArray(newTransactions) ? newTransactions : [];

  const existingKeys = new Set(
    existingList.map((transaction) => getTransactionDedupKey(transaction)),
  );

  const uniqueNew = newList.filter((transaction) => {
    const key = getTransactionDedupKey(transaction);
    return !existingKeys.has(key);
  });

  const duplicateCount = newList.length - uniqueNew.length;

  return { uniqueNew, duplicateCount };
}

export function isMatchedTransaction(transaction) {
  return Boolean(transaction?.matchedTransactionId && transaction?.matchType);
}

export function shouldExcludeFromSpending(transaction) {
  return (
    transaction?.matchType === "move_money" ||
    transaction?.matchType === "pay_bill"
  );
}

export function getTransactionAmount(transaction) {
  const debit = parseAmount(transaction?.debit);
  const kredit = parseAmount(transaction?.kredit);
  return { debit, kredit };
}

export function parseTransactionDate(tanggal) {
  const [day, month, year] = String(tanggal || "").split("/");
  if (!day || !month || !year) return null;

  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getDaysDifference(dateA, dateB) {
  if (!dateA || !dateB) return Infinity;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs(dateA.getTime() - dateB.getTime()) / msPerDay;
}
