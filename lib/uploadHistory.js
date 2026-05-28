import { generateId, getAccounts } from "./accounts";
import { parseTransactionDate } from "./transactions";

const STORAGE_KEY = "uploadHistory";

const BULAN_SHORT = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "Mei",
  "06": "Jun",
  "07": "Jul",
  "08": "Agu",
  "09": "Sep",
  "10": "Okt",
  "11": "Nov",
  "12": "Des",
};

function persistUploadHistory(history) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function getUploadHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function computeUploadDateRange(transactions) {
  const dates = (Array.isArray(transactions) ? transactions : [])
    .map((transaction) => parseTransactionDate(transaction?.tanggal))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return {
      dateRange: "Tidak diketahui",
      dateRangeStart: null,
      dateRangeEnd: null,
    };
  }

  const formatMonth = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${BULAN_SHORT[month] || month} ${date.getFullYear()}`;
  };

  const first = dates[0];
  const last = dates[dates.length - 1];
  const firstLabel = formatMonth(first);
  const lastLabel = formatMonth(last);

  return {
    dateRange: firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`,
    dateRangeStart: first.getTime(),
    dateRangeEnd: last.getTime(),
  };
}

export function addUploadHistoryEntry({
  accountId,
  fileName,
  transactions,
  transactionCount,
}) {
  if (typeof window === "undefined") return null;

  const { dateRange, dateRangeStart, dateRangeEnd } =
    computeUploadDateRange(transactions);

  const entry = {
    id: generateId(),
    accountId,
    fileName: String(fileName || "statement.pdf"),
    uploadedAt: new Date().toISOString(),
    transactionCount:
      typeof transactionCount === "number"
        ? transactionCount
        : transactions?.length || 0,
    dateRange,
    dateRangeStart,
    dateRangeEnd,
  };

  const history = getUploadHistory();
  history.unshift(entry);
  persistUploadHistory(history);
  return entry;
}

export function deleteUploadHistoryEntry(id) {
  if (typeof window === "undefined") return false;

  const history = getUploadHistory();
  const next = history.filter((entry) => entry.id !== id);
  if (next.length === history.length) return false;

  persistUploadHistory(next);
  return true;
}

export function isTransactionInUploadRange(transaction, entry) {
  if (!entry || transaction?.accountId !== entry.accountId) return false;

  const date = parseTransactionDate(transaction?.tanggal);
  if (!date || entry.dateRangeStart == null || entry.dateRangeEnd == null) {
    return false;
  }

  const time = date.getTime();
  return time >= entry.dateRangeStart && time <= entry.dateRangeEnd;
}

export function removeTransactionsForUploadEntry(entry, transactions) {
  if (!entry) return transactions;
  return transactions.filter(
    (transaction) => !isTransactionInUploadRange(transaction, entry),
  );
}

export function formatUploadDate(isoString) {
  if (!isoString) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(isoString));
  } catch {
    return "-";
  }
}

export function getTransactionMonthYearKey(tanggal) {
  const date = parseTransactionDate(tanggal);
  if (!date) return "unknown";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${date.getFullYear()}`;
}

export function formatMonthYearKey(periodKey) {
  if (periodKey === "unknown") return "Tidak diketahui";
  const [month, year] = String(periodKey).split("/");
  return `${BULAN_SHORT[month] || month} ${year}`;
}

export function isUnlinkedTransaction(transaction) {
  return transaction?.accountId == null;
}

export function isTransactionInUnlinkedGroup(transaction, group) {
  if (!group || !isUnlinkedTransaction(transaction)) return false;
  return getTransactionMonthYearKey(transaction?.tanggal) === group.periodKey;
}

export function groupUnlinkedTransactionsByPeriod(transactions) {
  const unlinked = (Array.isArray(transactions) ? transactions : []).filter(
    isUnlinkedTransaction,
  );

  if (unlinked.length === 0) return [];

  const byPeriod = {};
  unlinked.forEach((transaction) => {
    const periodKey = getTransactionMonthYearKey(transaction?.tanggal);
    if (!byPeriod[periodKey]) {
      byPeriod[periodKey] = [];
    }
    byPeriod[periodKey].push(transaction);
  });

  return Object.entries(byPeriod)
    .map(([periodKey, periodTransactions]) => {
      const { dateRange, dateRangeStart, dateRangeEnd } =
        computeUploadDateRange(periodTransactions);

      return {
        periodKey,
        periodLabel: formatMonthYearKey(periodKey),
        transactions: periodTransactions,
        transactionCount: periodTransactions.length,
        dateRange,
        dateRangeStart,
        dateRangeEnd,
      };
    })
    .sort((a, b) => {
      if (a.periodKey === "unknown") return 1;
      if (b.periodKey === "unknown") return -1;
      const [monthA, yearA] = a.periodKey.split("/");
      const [monthB, yearB] = b.periodKey.split("/");
      const timeA = new Date(Number(yearA), Number(monthA) - 1, 1).getTime();
      const timeB = new Date(Number(yearB), Number(monthB) - 1, 1).getTime();
      return timeB - timeA;
    });
}

function loadParsedTransactions() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("parsedTransactions");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveParsedTransactions(transactions) {
  if (typeof window === "undefined") return;
  localStorage.setItem("parsedTransactions", JSON.stringify(transactions));
}

function groupTransactionsByAccountId(transactions) {
  const grouped = {};
  transactions.forEach((transaction) => {
    if (!transaction?.accountId) return;
    if (!grouped[transaction.accountId]) {
      grouped[transaction.accountId] = [];
    }
    grouped[transaction.accountId].push(transaction);
  });
  return grouped;
}

export function syncLegacyTransactionsAndHistory() {
  if (typeof window === "undefined") {
    return {
      transactionsUpdated: false,
      historyAdded: [],
      transactions: [],
    };
  }

  let transactions = loadParsedTransactions();
  const accounts = getAccounts();
  let transactionsUpdated = false;

  if (accounts.length === 1) {
    const accountId = accounts[0].id;
    const updatedTransactions = transactions.map((transaction) =>
      !transaction?.accountId ? { ...transaction, accountId } : transaction,
    );

    const hasLegacy = updatedTransactions.some(
      (transaction, index) =>
        transaction.accountId !== transactions[index]?.accountId,
    );

    if (hasLegacy) {
      transactions = updatedTransactions;
      saveParsedTransactions(transactions);
      transactionsUpdated = true;
    }
  }

  const history = getUploadHistory();
  const historyAccountIds = new Set(
    history.map((entry) => entry.accountId).filter(Boolean),
  );
  const grouped = groupTransactionsByAccountId(transactions);
  const historyAdded = [];

  Object.entries(grouped).forEach(([accountId, accountTransactions]) => {
    if (historyAccountIds.has(accountId) || accountTransactions.length === 0) {
      return;
    }

    const entry = addUploadHistoryEntry({
      accountId,
      fileName: "Statement (imported)",
      transactions: accountTransactions,
      transactionCount: accountTransactions.length,
    });

    if (entry) {
      historyAdded.push(entry);
      historyAccountIds.add(accountId);
    }
  });

  return {
    transactionsUpdated,
    historyAdded,
    transactions,
  };
}
