import { generateId } from "./accounts";
import { safeArray } from "./safeArray";
import { supabase } from "./supabase";
import {
  normalizeTransaction,
  normalizeTransactions,
  parseTransactionDate,
} from "./transactions";

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

function mapTransactionRow(row) {
  if (!row) return null;

  return normalizeTransaction({
    id: row.id,
    accountId: row.account_id,
    tanggal: row.tanggal,
    deskripsi: row.deskripsi,
    debit: row.debit,
    kredit: row.kredit,
    jenis: row.jenis,
    kategori: row.kategori,
    notes: row.notes,
    matchedTransactionId: row.matched_transaction_id,
    matchType: row.match_type,
    moveMoneyExcluded: row.move_money_excluded,
  });
}

function mapTransactionToRow(transaction, userId) {
  const normalized = normalizeTransaction(transaction);

  return {
    id: normalized.id || generateId(),
    user_id: userId,
    account_id: normalized.accountId ?? null,
    tanggal: String(normalized.tanggal || ""),
    deskripsi: String(normalized.deskripsi || ""),
    debit: normalized.debit ?? null,
    kredit: normalized.kredit ?? null,
    jenis: normalized.jenis ?? null,
    kategori: normalized.kategori ?? null,
    notes: normalized.notes ?? null,
    matched_transaction_id: normalized.matchedTransactionId ?? null,
    match_type: normalized.matchType ?? null,
    move_money_excluded: Boolean(normalized.moveMoneyExcluded),
  };
}

function matchesBulan(transaction, bulan) {
  if (!bulan) return true;

  const [day, month, year] = String(transaction?.tanggal || "").split("/");
  return Boolean(day && month && year && `${month}/${year}` === bulan);
}

function isTransactionInDateRange(transaction, dateRangeStart, dateRangeEnd) {
  const date = parseTransactionDate(transaction?.tanggal);
  if (!date || dateRangeStart == null || dateRangeEnd == null) {
    return false;
  }

  const time = date.getTime();
  return time >= dateRangeStart && time <= dateRangeEnd;
}

export async function getTransactions(filters = {}) {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  let query = supabase.from("transactions").select("*").eq("user_id", user.id);

  if (filters.accountId) {
    query = query.eq("account_id", filters.accountId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getTransactions error:", error.message);
    return [];
  }

  let transactions = safeArray(data)
    .map(mapTransactionRow)
    .filter(Boolean);

  if (filters.bulan) {
    transactions = transactions.filter((transaction) =>
      matchesBulan(transaction, filters.bulan),
    );
  }

  return transactions;
}

export async function saveTransactions(transactions) {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const list = normalizeTransactions(Array.isArray(transactions) ? transactions : []);
  if (list.length === 0) return true;

  const rows = list.map((transaction) => mapTransactionToRow(transaction, user.id));

  const { error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("saveTransactions error:", error.message);
    return false;
  }

  return true;
}

export async function updateTransaction(id, data) {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const updatePayload = {};

  if (data.accountId !== undefined) {
    updatePayload.account_id = data.accountId ?? null;
  }
  if (data.tanggal !== undefined) {
    updatePayload.tanggal = String(data.tanggal || "");
  }
  if (data.deskripsi !== undefined) {
    updatePayload.deskripsi = String(data.deskripsi || "");
  }
  if (data.debit !== undefined) {
    updatePayload.debit = data.debit ?? null;
  }
  if (data.kredit !== undefined) {
    updatePayload.kredit = data.kredit ?? null;
  }
  if (data.jenis !== undefined) {
    updatePayload.jenis = data.jenis ?? null;
  }
  if (data.kategori !== undefined) {
    updatePayload.kategori = data.kategori ?? null;
  }
  if (data.notes !== undefined) {
    updatePayload.notes = data.notes ?? null;
  }
  if (data.matchedTransactionId !== undefined) {
    updatePayload.matched_transaction_id = data.matchedTransactionId ?? null;
  }
  if (data.matchType !== undefined) {
    updatePayload.match_type = data.matchType ?? null;
  }
  if (data.moveMoneyExcluded !== undefined) {
    updatePayload.move_money_excluded = Boolean(data.moveMoneyExcluded);
  }

  if (Object.keys(updatePayload).length === 0) {
    const { data: existing, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("updateTransaction fetch error:", fetchError.message);
      return null;
    }

    return mapTransactionRow(existing);
  }

  const { data: row, error } = await supabase
    .from("transactions")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    console.error("updateTransaction error:", error.message);
    return null;
  }

  return mapTransactionRow(row);
}

export async function deleteTransactionsByUpload(
  accountId,
  dateRangeStart,
  dateRangeEnd,
) {
  const user = await getAuthenticatedUser();
  if (!user) return 0;

  const transactions = await getTransactions({ accountId });
  const idsToDelete = transactions
    .filter((transaction) =>
      isTransactionInDateRange(transaction, dateRangeStart, dateRangeEnd),
    )
    .map((transaction) => transaction.id)
    .filter(Boolean);

  if (idsToDelete.length === 0) return 0;

  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("id", idsToDelete)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteTransactionsByUpload error:", error.message);
    return 0;
  }

  return idsToDelete.length;
}

export async function deleteTransactionsByAccount(accountId) {
  const user = await getAuthenticatedUser();
  if (!user) return false;

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteTransactionsByAccount error:", error.message);
    return false;
  }

  return true;
}
