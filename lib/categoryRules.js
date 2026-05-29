import { safeArray } from "./safeArray";
import { supabase } from "./supabase";

const getFirstNWords = (desc, count) =>
  String(desc || "")
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(" ")
    .toLowerCase();

const getFirst4Words = (desc) => getFirstNWords(desc, 4);

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

function mapCategoryRuleRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    keyword: row.keyword,
    kategori: row.kategori,
    createdAt: row.created_at,
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

export function extractKeyword(deskripsi) {
  const words = String(deskripsi || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, 4).join(" ");
}

export function getMatchingIndices(transactions, sourceIndex) {
  const sourcePrefix = getFirst4Words(transactions[sourceIndex]?.deskripsi);
  if (!sourcePrefix) return [sourceIndex];

  return transactions
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => getFirst4Words(t?.deskripsi) === sourcePrefix)
    .map(({ index }) => index);
}

export function getPreviewGroups(transactions, indices) {
  const groups = {};
  indices.forEach((index) => {
    const desc = transactions[index]?.deskripsi || "-";
    groups[desc] = (groups[desc] || 0) + 1;
  });
  return Object.entries(groups).map(([deskripsi, count]) => ({
    deskripsi,
    count,
  }));
}

export async function loadCategoryRules() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("category_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadCategoryRules error:", error.message);
    return [];
  }

  return (data || []).map(mapCategoryRuleRow).filter(Boolean);
}

export async function saveCategoryRule(keyword, kategori, notes) {
  const user = await getAuthenticatedUser();
  if (!user) return;

  const existingRules = await loadCategoryRules();
  const trimmedNotes = String(notes || "").trim();
  const prefix = getFirst4Words(keyword);
  const rulesToRemove = existingRules.filter(
    (rule) => getFirst4Words(rule.keyword) === prefix,
  );

  if (rulesToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("category_rules")
      .delete()
      .in(
        "id",
        rulesToRemove.map((rule) => rule.id),
      )
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("saveCategoryRule delete error:", deleteError.message);
      return;
    }
  }

  const payload = {
    user_id: user.id,
    keyword,
    kategori,
    created_at: new Date().toISOString(),
    ...(trimmedNotes ? { notes: trimmedNotes } : { notes: null }),
  };

  const { error } = await supabase.from("category_rules").insert(payload);

  if (error) {
    console.error("saveCategoryRule insert error:", error.message);
  }
}

export async function deleteCategoryRule(keyword) {
  const user = await getAuthenticatedUser();
  if (!user) return;

  const existingRules = await loadCategoryRules();
  const prefix = getFirst4Words(keyword);
  const rulesToRemove = existingRules.filter(
    (rule) => getFirst4Words(rule.keyword) === prefix,
  );

  if (rulesToRemove.length === 0) return;

  const { error } = await supabase
    .from("category_rules")
    .delete()
    .in(
      "id",
      rulesToRemove.map((rule) => rule.id),
    )
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteCategoryRule error:", error.message);
  }
}

function isMerchantKeyword(keyword) {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length <= 2;
}

function isMerchantMatch(deskripsi, keyword) {
  if (!isMerchantKeyword(keyword)) return false;

  const merchant = String(keyword || "").trim().toLowerCase();
  const descLower = String(deskripsi || "").toLowerCase();
  if (!merchant || !descLower) return false;

  const escaped = merchant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundaryMatch = new RegExp(`\\b${escaped}\\b`, "i").test(descLower);
  return wordBoundaryMatch || descLower.includes(merchant);
}

function findMatchingRule(transaction, ruleList) {
  const deskripsi = transaction?.deskripsi;
  if (!deskripsi || ruleList.length === 0) return null;

  const prefix4 = getFirstNWords(deskripsi, 4);
  if (prefix4) {
    const match4 = ruleList.find(
      (rule) => getFirstNWords(rule.keyword, 4) === prefix4,
    );
    if (match4) return match4;
  }

  const prefix3 = getFirstNWords(deskripsi, 3);
  if (prefix3) {
    const matches3 = ruleList.filter(
      (rule) => getFirstNWords(rule.keyword, 3) === prefix3,
    );
    if (matches3.length === 1) return matches3[0];
  }

  const merchantMatches = ruleList.filter((rule) =>
    isMerchantMatch(deskripsi, rule.keyword),
  );
  if (merchantMatches.length === 1) return merchantMatches[0];
  if (merchantMatches.length > 1) {
    return merchantMatches.sort(
      (a, b) => String(b.keyword).length - String(a.keyword).length,
    )[0];
  }

  return null;
}

function applyRuleToTransaction(transaction, matchedRule) {
  const nextKategori = matchedRule.kategori;
  const currentKategori = String(transaction?.kategori || "");
  if (currentKategori.toLowerCase() === String(nextKategori).toLowerCase()) {
    return { transaction, applied: false };
  }

  const trimmedNotes = String(matchedRule.notes || "").trim();
  return {
    transaction: {
      ...transaction,
      kategori: nextKategori,
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    },
    applied: true,
  };
}

export async function applyCategoryRulesWithCount(transactions, rules) {
  const ruleList =
    rules !== undefined && rules !== null
      ? safeArray(rules)
      : await loadCategoryRules();
  if (ruleList.length === 0) {
    return { transactions, appliedCount: 0 };
  }

  let appliedCount = 0;
  const updated = transactions.map((transaction) => {
    const matchedRule = findMatchingRule(transaction, ruleList);
    if (!matchedRule) return transaction;

    const { transaction: nextTransaction, applied } = applyRuleToTransaction(
      transaction,
      matchedRule,
    );
    if (applied) appliedCount += 1;
    return nextTransaction;
  });

  return { transactions: updated, appliedCount };
}

export async function applyCategoryRules(transactions, rules) {
  const result = await applyCategoryRulesWithCount(transactions, rules);
  return result.transactions;
}
