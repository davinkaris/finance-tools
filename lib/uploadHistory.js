import { generateId, getAccounts } from "./accounts";
import { parseTransactionDate } from "./transactions";
import { supabase } from "./supabase";

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

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("getAuthenticatedUser error:", error.message);
    return null;
  }

  return user;
}

function mapUploadHistoryRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    accountId: row.account_id,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    transactionCount: row.transaction_count,
    dateRange: row.date_range,
    dateRangeStart: row.date_range_start,
    dateRangeEnd: row.date_range_end,
  };
}

export async function getUploadHistory() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("upload_history")
    .select("*")
    .eq("user_id", user.id)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("getUploadHistory error:", error.message);
    return [];
  }

  return (data || []).map(mapUploadHistoryRow).filter(Boolean);
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

export async function addUploadHistoryEntry({
  accountId,
  fileName,
  transactions,
  transactionCount,
}) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const { dateRange, dateRangeStart, dateRangeEnd } =
    computeUploadDateRange(transactions);

  const payload = {
    id: generateId(),
    user_id: user.id,
    account_id: accountId,
    file_name: String(fileName || "statement.pdf"),
    uploaded_at: new Date().toISOString(),
    transaction_count:
      typeof transactionCount === "number"
        ? transactionCount
        : transactions?.length || 0,
    date_range: dateRange,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
  };

  const { data, error } = await supabase
    .from("upload_history")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("addUploadHistoryEntry error:", error.message);
    return null;
  }

  return mapUploadHistoryRow(data);
}

export async function deleteUploadHistoryEntry(id) {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("upload_history")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("deleteUploadHistoryEntry error:", error.message);
    return false;
  }

  return (data || []).length > 0;
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

export async function syncLegacyTransactionsAndHistory() {
  if (typeof window === "undefined") {
    return {
      transactionsUpdated: false,
      historyAdded: [],
      transactions: [],
    };
  }

  let transactions = loadParsedTransactions();
  const accounts = await getAccounts();
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

  const history = await getUploadHistory();
  const historyAccountIds = new Set(
    history.map((entry) => entry.accountId).filter(Boolean),
  );
  const grouped = groupTransactionsByAccountId(transactions);
  const historyAdded = [];

  for (const [accountId, accountTransactions] of Object.entries(grouped)) {
    if (historyAccountIds.has(accountId) || accountTransactions.length === 0) {
      continue;
    }

    const entry = await addUploadHistoryEntry({
      accountId,
      fileName: "Statement (imported)",
      transactions: accountTransactions,
      transactionCount: accountTransactions.length,
    });

    if (entry) {
      historyAdded.push(entry);
      historyAccountIds.add(accountId);
    }
  }

  return {
    transactionsUpdated,
    historyAdded,
    transactions,
  };
}
