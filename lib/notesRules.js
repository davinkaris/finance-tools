import { safeArray } from "./safeArray";
import { supabase } from "./supabase";

const getFirst4Words = (desc) =>
  String(desc || "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .toLowerCase();

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

function mapNotesRuleRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    keyword: row.keyword,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function loadNotesRules() {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notes_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadNotesRules error:", error.message);
    return [];
  }

  return (data || []).map(mapNotesRuleRow).filter(Boolean);
}

export async function saveNotesRule(keyword, notes) {
  const user = await getAuthenticatedUser();
  if (!user) return;

  const trimmedNotes = String(notes || "").trim();
  if (!trimmedNotes) return;

  const existingRules = await loadNotesRules();
  const prefix = getFirst4Words(keyword);
  const rulesToRemove = existingRules.filter(
    (rule) => getFirst4Words(rule.keyword) === prefix,
  );

  if (rulesToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("notes_rules")
      .delete()
      .in(
        "id",
        rulesToRemove.map((rule) => rule.id),
      )
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("saveNotesRule delete error:", deleteError.message);
      return;
    }
  }

  const { error } = await supabase.from("notes_rules").insert({
    user_id: user.id,
    keyword,
    notes: trimmedNotes,
  });

  if (error) {
    console.error("saveNotesRule insert error:", error.message);
  }
}

export async function deleteNotesRule(keyword) {
  const user = await getAuthenticatedUser();
  if (!user) return;

  const existingRules = await loadNotesRules();
  const prefix = getFirst4Words(keyword);
  const rulesToRemove = existingRules.filter(
    (rule) => getFirst4Words(rule.keyword) === prefix,
  );

  if (rulesToRemove.length === 0) return;

  const { error } = await supabase
    .from("notes_rules")
    .delete()
    .in(
      "id",
      rulesToRemove.map((rule) => rule.id),
    )
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteNotesRule error:", error.message);
  }
}

export async function applyNotesRulesWithCount(transactions, rules) {
  const ruleList =
    rules !== undefined && rules !== null
      ? safeArray(rules)
      : await loadNotesRules();
  if (ruleList.length === 0) {
    return { transactions, appliedCount: 0 };
  }

  let appliedCount = 0;
  const updated = transactions.map((transaction) => {
    if (String(transaction?.notes || "").trim()) return transaction;

    const prefix = getFirst4Words(transaction?.deskripsi);
    if (!prefix) return transaction;

    const matchedRule = ruleList.find(
      (rule) => getFirst4Words(rule.keyword) === prefix,
    );
    if (!matchedRule) return transaction;

    appliedCount += 1;
    return { ...transaction, notes: matchedRule.notes };
  });

  return { transactions: updated, appliedCount };
}

export async function applyNotesRules(transactions, rules) {
  const result = await applyNotesRulesWithCount(transactions, rules);
  return result.transactions;
}
