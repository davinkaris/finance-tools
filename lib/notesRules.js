const getFirst4Words = (desc) =>
  String(desc || "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .toLowerCase();

export function loadNotesRules() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("notesRules");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNotesRule(keyword, notes) {
  if (typeof window === "undefined") return;
  const trimmedNotes = String(notes || "").trim();
  if (!trimmedNotes) return;

  const rules = loadNotesRules().filter(
    (rule) => getFirst4Words(rule.keyword) !== getFirst4Words(keyword),
  );
  rules.push({
    keyword,
    notes: trimmedNotes,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("notesRules", JSON.stringify(rules));
}

export function deleteNotesRule(keyword) {
  if (typeof window === "undefined") return;
  const rules = loadNotesRules().filter(
    (rule) => getFirst4Words(rule.keyword) !== getFirst4Words(keyword),
  );
  localStorage.setItem("notesRules", JSON.stringify(rules));
}

export function applyNotesRulesWithCount(transactions, rules) {
  const ruleList =
    rules ?? (typeof window !== "undefined" ? loadNotesRules() : []);
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

export function applyNotesRules(transactions, rules) {
  return applyNotesRulesWithCount(transactions, rules).transactions;
}
