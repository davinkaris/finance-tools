import { getAccountById } from "./accounts";
import {
  getDaysDifference,
  getTransactionAmount,
  normalizeTransactions,
  parseTransactionDate,
} from "./transactions";

const MAX_MOVE_MONEY_DAYS = 3;
const MAX_PAY_BILL_DAYS = 5;

const SELF_TRANSFER_PHRASES = ["own transfer", "transfer sendiri"];

function buildSelfTransferMatcher(userName, accounts = []) {
  const words = String(userName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const ownedBankNames = accounts
    .map((account) => String(account?.bank || "").trim().toLowerCase())
    .filter(Boolean);

  return (description) => {
    const desc = String(description || "").toLowerCase();
    if (!desc) return false;

    if (SELF_TRANSFER_PHRASES.some((phrase) => desc.includes(phrase))) {
      return true;
    }

    if (ownedBankNames.some((bank) => desc.includes(bank))) {
      return true;
    }

    return words.some((word) => {
      if (word.length < 3) return false;
      const prefix = word.slice(0, 4);
      return desc.includes(prefix);
    });
  };
}

function isSelfTransferPair(debitTxn, creditTxn, isSelfTransfer) {
  return (
    isSelfTransfer(debitTxn?.deskripsi) || isSelfTransfer(creditTxn?.deskripsi)
  );
}

function buildAccountLookup(accounts) {
  const lookup = new Map();
  accounts.forEach((account) => {
    lookup.set(account.id, account);
  });
  return lookup;
}

function getAccountForTransaction(transaction, accountLookup) {
  if (!transaction?.accountId) return null;
  return accountLookup.get(transaction.accountId) || getAccountById(transaction.accountId);
}

function isEligibleForMatching(transaction) {
  return !transaction?.matchedTransactionId && !transaction?.moveMoneyExcluded;
}

function clearMoveMoneyMatches(transactions) {
  const idsToClear = new Set();

  transactions.forEach((transaction) => {
    if (transaction?.matchType !== "move_money" || transaction?.moveMoneyExcluded) {
      return;
    }
    idsToClear.add(transaction.id);
    if (transaction.matchedTransactionId) {
      idsToClear.add(transaction.matchedTransactionId);
    }
  });

  if (idsToClear.size === 0) return transactions;

  return transactions.map((transaction) => {
    if (!idsToClear.has(transaction.id)) return transaction;
    return {
      ...transaction,
      matchType: null,
      matchedTransactionId: null,
    };
  });
}

function applyMatch(updatedTransactions, debitIndex, creditIndex, matchType) {
  const debitTxn = updatedTransactions[debitIndex];
  const creditTxn = updatedTransactions[creditIndex];

  updatedTransactions[debitIndex] = {
    ...debitTxn,
    matchedTransactionId: creditTxn.id,
    matchType,
  };
  updatedTransactions[creditIndex] = {
    ...creditTxn,
    matchedTransactionId: debitTxn.id,
    matchType,
  };

  return {
    matchType,
    debitTransaction: updatedTransactions[debitIndex],
    creditTransaction: updatedTransactions[creditIndex],
    debitIndex,
    creditIndex,
  };
}

function findPairs({
  transactions,
  accountLookup,
  usedIndices,
  maxDays,
  validatePair,
}) {
  const pairs = [];

  for (let debitIndex = 0; debitIndex < transactions.length; debitIndex += 1) {
    if (usedIndices.has(debitIndex)) continue;

    const debitTxn = transactions[debitIndex];
    if (!isEligibleForMatching(debitTxn)) continue;

    const debitAccount = getAccountForTransaction(debitTxn, accountLookup);
    const { debit } = getTransactionAmount(debitTxn);
    if (debit <= 0) continue;

    const debitDate = parseTransactionDate(debitTxn.tanggal);
    if (!debitDate) continue;

    for (let creditIndex = 0; creditIndex < transactions.length; creditIndex += 1) {
      if (creditIndex === debitIndex || usedIndices.has(creditIndex)) continue;

      const creditTxn = transactions[creditIndex];
      if (!isEligibleForMatching(creditTxn)) continue;

      const creditAccount = getAccountForTransaction(creditTxn, accountLookup);
      const { kredit } = getTransactionAmount(creditTxn);
      if (kredit <= 0) continue;

      if (debit !== kredit) continue;

      const creditDate = parseTransactionDate(creditTxn.tanggal);
      if (!creditDate) continue;

      if (getDaysDifference(debitDate, creditDate) > maxDays) continue;

      if (
        !validatePair({
          debitTxn,
          creditTxn,
          debitAccount,
          creditAccount,
        })
      ) {
        continue;
      }

      pairs.push({ debitIndex, creditIndex });
      usedIndices.add(debitIndex);
      usedIndices.add(creditIndex);
      break;
    }
  }

  return pairs;
}

export function detectMoveMoney(transactions, accounts = [], options = {}) {
  const { userName = "" } = options;
  const isSelfTransfer = buildSelfTransferMatcher(userName, accounts);
  const normalized = normalizeTransactions(transactions);
  const accountLookup = buildAccountLookup(accounts);
  const usedIndices = new Set();

  const pairIndices = findPairs({
    transactions: normalized,
    accountLookup,
    usedIndices,
    maxDays: MAX_MOVE_MONEY_DAYS,
    validatePair: ({ debitAccount, creditAccount, debitTxn, creditTxn }) => {
      if (!debitAccount || !creditAccount) return false;
      if (debitAccount.tipe !== "bank" || creditAccount.tipe !== "bank") return false;
      if (debitTxn.accountId === creditTxn.accountId) return false;
      if (debitTxn.moveMoneyExcluded || creditTxn.moveMoneyExcluded) return false;
      return isSelfTransferPair(debitTxn, creditTxn, isSelfTransfer);
    },
  });

  const updatedTransactions = normalized.map((transaction) => ({ ...transaction }));
  const matches = pairIndices.map(({ debitIndex, creditIndex }) =>
    applyMatch(updatedTransactions, debitIndex, creditIndex, "move_money"),
  );

  return { matches, transactions: updatedTransactions };
}

export function detectPayBill(transactions, accounts = []) {
  const normalized = normalizeTransactions(transactions);
  const accountLookup = buildAccountLookup(accounts);
  const usedIndices = new Set();

  normalized.forEach((transaction, index) => {
    if (transaction.matchedTransactionId) {
      usedIndices.add(index);
    }
  });

  const pairIndices = findPairs({
    transactions: normalized,
    accountLookup,
    usedIndices,
    maxDays: MAX_PAY_BILL_DAYS,
    validatePair: ({ debitAccount, creditAccount }) => {
      if (!debitAccount || !creditAccount) return false;
      return debitAccount.tipe === "bank" && creditAccount.tipe === "cc";
    },
  });

  const updatedTransactions = normalized.map((transaction) => ({ ...transaction }));
  const matches = pairIndices.map(({ debitIndex, creditIndex }) =>
    applyMatch(updatedTransactions, debitIndex, creditIndex, "pay_bill"),
  );

  return { matches, transactions: updatedTransactions };
}

export function removeMoveMoneyMatch(transactions, transactionId) {
  const normalized = normalizeTransactions(transactions);
  const target = normalized.find((transaction) => transaction.id === transactionId);
  if (!target || target.matchType !== "move_money") return normalized;

  const pairId = target.matchedTransactionId;

  return normalized.map((transaction) => {
    if (transaction.id !== transactionId && transaction.id !== pairId) {
      return transaction;
    }

    return {
      ...transaction,
      matchType: null,
      matchedTransactionId: null,
      moveMoneyExcluded: true,
    };
  });
}

export function runTransactionMatching(transactions, accounts = [], options = {}) {
  const cleared = clearMoveMoneyMatches(normalizeTransactions(transactions));
  const moveMoneyResult = detectMoveMoney(cleared, accounts, options);
  const payBillResult = detectPayBill(moveMoneyResult.transactions, accounts);

  return {
    transactions: payBillResult.transactions,
    moveMoneyMatches: moveMoneyResult.matches,
    payBillMatches: payBillResult.matches,
    moveMoneyCount: moveMoneyResult.matches.length,
    payBillCount: payBillResult.matches.length,
  };
}
