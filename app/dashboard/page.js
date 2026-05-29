"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  applyCategoryRules,
  deleteCategoryRule,
  extractKeyword,
  getMatchingIndices,
  loadCategoryRules,
  saveCategoryRule,
} from "../../lib/categoryRules";
import {
  deleteNotesRule,
  loadNotesRules,
  applyNotesRules,
  saveNotesRule,
} from "../../lib/notesRules";
import {
  getTransactionNoteKey,
  loadTransactionNotes,
  saveTransactionNote,
  syncNotesFromTransactions,
  truncateNote,
} from "../../lib/transactionNotes";
import {
  buildIncomeCategoryNames,
  inferJenisFromAmounts,
  processTransactions,
} from "../../lib/transactionJenis";
import { normalizeTransactions, shouldExcludeFromSpending } from "../../lib/transactions";
import {
  removeMoveMoneyMatch,
  runTransactionMatching,
} from "../../lib/transactionMatching";
import { getAccounts, saveAccount } from "../../lib/accounts";
import { safeArray } from "../../lib/safeArray";
import { getProfile } from "../../lib/profiles";
import { supabase } from "../../lib/supabase";
import {
  deleteTransactionsByUpload,
  getTransactions,
  saveTransactions,
} from "../../lib/transactionsStore";
import {
  getUserPreferences,
  saveUserPreferences,
} from "../../lib/userPreferences";
import {
  deleteUploadHistoryEntry,
  getUploadHistory,
  removeTransactionsForUploadEntry,
} from "../../lib/uploadHistory";
import Navbar from "../../components/Navbar";
import AddAccountUploadModal from "../../components/AddAccountUploadModal";

function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  const numeric = String(value).replace(/[^\d-]/g, "");
  if (!numeric) return 0;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

const formatRupiah = (angka) => {
  if (!angka || angka === 0) return "-";
  return new Intl.NumberFormat("id-ID").format(angka);
};

const formatAmount = (transaksi) => {
  const kredit = parseAmount(transaksi?.kredit);
  const debit = parseAmount(transaksi?.debit);
  const amount = kredit > 0 ? kredit : debit;

  if (transaksi?.matchType === "move_money") {
    if (amount === 0) {
      return { text: "-", className: "whitespace-nowrap text-[#8B92A5]" };
    }
    const formatted = new Intl.NumberFormat("id-ID").format(amount);
    const prefix = kredit > 0 ? "+" : "-";
    return {
      text: `${prefix}Rp ${formatted}`,
      className: "whitespace-nowrap font-semibold text-[#8B92A5]",
    };
  }

  if (amount === 0) {
    return { text: "-", className: "whitespace-nowrap text-[#8B92A5]" };
  }

  const formatted = new Intl.NumberFormat("id-ID").format(amount);
  const prefix = kredit > 0 ? "+" : "-";

  return {
    text: `${prefix}Rp ${formatted}`,
    className: `whitespace-nowrap font-semibold ${
      kredit > 0 ? "text-[#68D391]" : "text-[#FC8181]"
    }`,
  };
};

const getAccountShortLabel = (account) => {
  if (!account) return "";
  if (account.tipe === "cc") return account.bank || account.nama;
  const nama = String(account.nama || "").trim();
  if (!nama) return account.bank || "-";
  return nama.split(/\s+/)[0];
};

const resolveAccountForTransaction = (transaction, accountLookup, accounts) => {
  if (transaction?.accountId) {
    return accountLookup.get(transaction.accountId) || null;
  }

  if (accounts.length === 1) {
    return accounts[0];
  }

  return null;
};

const transactionMatchesAccountFilter = (
  transaction,
  selectedAccountId,
  accounts,
) => {
  if (!selectedAccountId) return true;

  if (transaction?.accountId) {
    return transaction.accountId === selectedAccountId;
  }

  if (accounts.length === 1 && accounts[0].id === selectedAccountId) {
    return true;
  }

  return false;
};

const categoryEmoji = {
  "Makanan & Minuman": "🍔",
  Transport: "🚗",
  Shopping: "🛍️",
  "Tagihan & Utilitas": "💡",
  Transfer: "💸",
  "Gaji & Pemasukan": "💰",
  Investasi: "📈",
  Hiburan: "🎮",
  Kesehatan: "🏥",
  Lainnya: "📦",
};

const CATEGORY_OPTIONS = [
  "Makanan & Minuman",
  "Transport",
  "Shopping",
  "Tagihan & Utilitas",
  "Transfer",
  "Gaji & Pemasukan",
  "Investasi",
  "Hiburan",
  "Kesehatan",
  "Lainnya",
];

const normalizeKategori = (k) => {
  const map = {
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
  const raw = String(k || "Lainnya").trim();
  return map[raw.toLowerCase()] || raw;
};

const incomeCategories = ["Gaji & Pemasukan", "Investasi"];

const INCOME_CATEGORIES = new Set(incomeCategories);

const DEFAULT_CATEGORY_COLORS = {
  Transfer: "#6366f1",
  "Makanan & Minuman": "#f97316",
  Transport: "#3b82f6",
  Shopping: "#ec4899",
  "Tagihan & Utilitas": "#eab308",
  Hiburan: "#8b5cf6",
  Kesehatan: "#10b981",
  Lainnya: "#94a3b8",
};

const EMOJI_OPTIONS = [
  "🏠", "🎓", "👶", "💊", "✈️", "🐾", "💍", "🎁", "📚", "🏋️",
  "🎨", "🎵", "🍕", "☕", "🛒", "💻", "📱", "🚿", "💈", "🌿",
];

const CUSTOM_COLOR_PALETTE = [
  "#14b8a6", "#f43f5e", "#a855f7", "#0ea5e9", "#84cc16",
  "#fb923c", "#64748b", "#d946ef", "#06b6d4", "#f59e0b",
];

const pickRandomColor = (usedColors) => {
  const available = CUSTOM_COLOR_PALETTE.filter((c) => !usedColors.includes(c));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
};

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

const EXPENSE_CATEGORY_COLORS = {
  Transfer: "#6366f1",
  "Tagihan & Utilitas": "#eab308",
  "Makanan & Minuman": "#f97316",
  Shopping: "#ec4899",
  Transport: "#3b82f6",
  Hiburan: "#8b5cf6",
  Kesehatan: "#10b981",
  Lainnya: "#94a3b8",
};

const EXPENSE_CATEGORY_ORDER = [
  "Transfer",
  "Tagihan & Utilitas",
  "Makanan & Minuman",
  "Shopping",
  "Transport",
  "Hiburan",
  "Kesehatan",
  "Lainnya",
];

const formatChartRupiah = (angka) =>
  new Intl.NumberFormat("id-ID").format(Math.round(angka || 0));

const formatYAxisRupiah = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)} jt`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(0)} rb`;
  }
  return String(num);
};

const INSIGHT_VARIANTS = [
  "rounded-xl border border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-[#63B3ED] bg-[rgba(99,179,237,0.05)]",
  "rounded-xl border border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-[#68D391] bg-[rgba(104,211,145,0.05)]",
  "rounded-xl border border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-[#F6AD55] bg-[rgba(246,173,85,0.05)]",
];

const AI_INSIGHT_COLLAPSED_KEY = "valeAiInsightCollapsed";

const BANK_OPTIONS = [
  "Jago",
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "CIMB",
  "OCBC",
  "Permata",
  "Danamon",
  "Lainnya",
];

const CC_OPTIONS = [
  "BCA CC",
  "Mandiri CC",
  "UOB CC",
  "CIMB CC",
  "HSBC CC",
  "Citibank CC",
  "Lainnya",
];

const COLOR_OPTIONS = [
  "#10b981",
  "#3b82f6",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#eab308",
  "#ef4444",
  "#63B3ED",
];

const QUICK_ACTION_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-[13px] font-semibold text-[#ECEEF2] transition hover:border-[rgba(99,179,237,0.3)] hover:bg-[rgba(99,179,237,0.1)]";


const SUGGESTION_BANKS = [
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "CIMB",
  "Jago",
  "OCBC",
  "Permata",
  "Danamon",
  "BSI",
  "GoPay",
  "OVO",
  "Dana",
];

const fuzzyMatchName = (text, name) => {
  const words = name.toLowerCase().split(" ");
  return words.some((word) => {
    if (word.length < 4) return false;
    const prefix = word.slice(0, 4);
    return text.toLowerCase().includes(prefix);
  });
};

const isTransferTransaction = (transaction) => {
  const kategori = normalizeKategori(transaction?.kategori);
  if (kategori === "Transfer") return true;
  const deskripsi = String(transaction?.deskripsi || "").toLowerCase();
  return /transfer|kirim|outgoing/.test(deskripsi);
};

const detectBanksInText = (text) => {
  const lower = String(text || "").toLowerCase();
  return SUGGESTION_BANKS.filter((bank) => lower.includes(bank.toLowerCase()));
};

const accountHasBank = (accounts, bankName) => {
  const target = bankName.toLowerCase();
  return accounts.some((account) => {
    const bank = String(account.bank || "").toLowerCase();
    return bank.includes(target) || target.includes(bank);
  });
};

const accountHasBankWithTransactions = (accounts, bankName, transactions) => {
  const target = bankName.toLowerCase();
  const matchingAccountIds = accounts
    .filter((account) => {
      const bank = String(account.bank || "").toLowerCase();
      return bank.includes(target) || target.includes(bank);
    })
    .map((account) => account.id);

  if (matchingAccountIds.length === 0) return false;

  return (Array.isArray(transactions) ? transactions : []).some(
    (transaction) =>
      transaction?.accountId &&
      matchingAccountIds.includes(transaction.accountId),
  );
};

const computeSmartStatementSuggestions = (
  transactions,
  accounts,
  userName,
  permanentlyDismissedBanks,
) => {
  if (!userName?.trim()) return [];

  const permanentlyDismissedSet = new Set(permanentlyDismissedBanks || []);
  const bankTransactions = new Map();
  const displayName = userName.trim();

  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    if (!isTransferTransaction(transaction)) return;

    const deskripsi = String(transaction?.deskripsi || "");
    if (!fuzzyMatchName(deskripsi, userName)) return;

    detectBanksInText(deskripsi).forEach((bank) => {
      if (permanentlyDismissedSet.has(bank)) return;
      if (accountHasBankWithTransactions(accounts, bank, transactions)) return;

      if (!bankTransactions.has(bank)) {
        bankTransactions.set(bank, []);
      }
      bankTransactions.get(bank).push(transaction);
    });
  });

  return Array.from(bankTransactions.entries()).map(([bank, matchedTransactions]) => ({
    bank,
    userName: displayName,
    transactions: matchedTransactions,
  }));
};

const StackedBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const validPayload = payload.filter((item) => Number(item.value) > 0);
  if (validPayload.length === 0) return null;

  const total = validPayload.reduce((sum, item) => sum + Number(item.value), 0);

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#20242E] px-3 py-2.5 text-sm shadow-lg text-[#ECEEF2]">
      <p className="mb-2 font-semibold text-[#ECEEF2]">{label}</p>
      <div className="space-y-1">
        {validPayload.map((item) => {
          const amount = Number(item.value);
          const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : "0.0";
          return (
            <p key={item.dataKey} className="text-[#8B92A5]">
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.dataKey}: Rp {formatChartRupiah(amount)} ({percent}%)
            </p>
          );
        })}
      </div>
    </div>
  );
};

const MonthlyStackedBarChart = ({
  title,
  data,
  stackKeys,
  getColor,
  selectedBulan,
}) => {
  const hasData = data.length > 0 && stackKeys.length > 0;

  return (
    <div className="min-w-0 flex-1">
      <h3 className="text-base font-bold text-[#ECEEF2]">{title}</h3>
      {hasData ? (
        <div className="mt-3 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#8B92A5" }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxisRupiah}
                tick={{ fontSize: 12, fill: "#8B92A5" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<StackedBarTooltip />} />
              <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              {stackKeys.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  stackId="stack"
                  fill={getColor(key)}
                >
                  {data.map((entry) => (
                    <Cell
                      key={`${key}-${entry.monthKey}`}
                      fill={getColor(key)}
                      fillOpacity={
                        !selectedBulan || entry.monthKey === selectedBulan ? 1 : 0.35
                      }
                      stroke={
                        selectedBulan && entry.monthKey === selectedBulan
                          ? "#63B3ED"
                          : "none"
                      }
                      strokeWidth={selectedBulan && entry.monthKey === selectedBulan ? 1.5 : 0}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#8B92A5]">Belum ada data untuk ditampilkan.</p>
      )}
    </div>
  );
};
const BULAN_LABEL = {
  "01": "Januari",
  "02": "Februari",
  "03": "Maret",
  "04": "April",
  "05": "Mei",
  "06": "Juni",
  "07": "Juli",
  "08": "Agustus",
  "09": "September",
  "10": "Oktober",
  "11": "November",
  "12": "Desember",
};

const filterByBulan = (transaksi, bulan) => {
  if (!bulan) return transaksi;
  return transaksi.filter((t) => {
    const [day, month, year] = String(t?.tanggal || "").split("/");
    return day && month && year && `${month}/${year}` === bulan;
  });
};

const formatBulanLabel = (bulan) => {
  const [month, year] = bulan.split("/");
  return `${BULAN_LABEL[month] || month} ${year}`;
};

const MAX_CHAT_MESSAGES = 20;
const OPENING_CHAT_MESSAGE =
  "Halo! Saya advisor keuangan pribadi kamu. Saya sudah analisa data spending kamu dan siap bantu. Mau tanya apa?";
const CHAT_LIMIT_MESSAGE =
  "Kamu sudah mencapai batas chat gratis. Upgrade ke Premium untuk chat unlimited!";

function TransactionNoteCell({
  transaction,
  note,
  isEditing,
  draftNote,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  inputRef,
}) {
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draftNote}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="Tambah catatan..."
        className="w-full min-w-[160px] rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-2 py-1 text-sm italic text-[#8B92A5] outline-none focus:border-[#63B3ED] focus:ring-1 focus:ring-[#63B3ED]"
      />
    );
  }

  return (
    <div className="flex min-w-[120px] items-center gap-1.5">
      {note ? (
        <span
          title={note}
          className="max-w-[180px] truncate text-sm italic text-[#8B92A5]"
        >
          {truncateNote(note)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onStartEdit}
        className={`shrink-0 text-sm transition-opacity duration-200 ${
          note
            ? "opacity-70 hover:opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label={note ? "Edit catatan" : "Tambah catatan"}
      >
        📝
      </button>
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
      <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-[#20242E]" />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-[#20242E]"
          />
        ))}
      </div>
      <div className="mt-8 h-14 animate-pulse rounded-2xl bg-[#20242E]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-[#20242E]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[#20242E]" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-2xl bg-[#20242E]"
          />
        ))}
      </div>
      <div className="mt-8 space-y-3">
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="h-14 animate-pulse rounded-xl bg-[#20242E]"
          />
        ))}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedBulan, setSelectedBulan] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [createdAccountSuccess, setCreatedAccountSuccess] = useState(null);
  const [formNama, setFormNama] = useState("");
  const [formTipe, setFormTipe] = useState("bank");
  const [formBank, setFormBank] = useState(BANK_OPTIONS[0]);
  const [formWarna, setFormWarna] = useState("#63B3ED");
  const [uploadHistory, setUploadHistory] = useState([]);
  const [deleteUploadConfirm, setDeleteUploadConfirm] = useState(null);
  const [quickActionDropdown, setQuickActionDropdown] = useState(null);
  const [aiInsightExpanded, setAiInsightExpanded] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [permanentlyDismissed, setPermanentlyDismissed] = useState([]);
  const [confirmDismissBank, setConfirmDismissBank] = useState(null);
  const [expandedSuggestions, setExpandedSuggestions] = useState(() => new Set());
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState("expense");
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryType, setEditCategoryType] = useState("expense");
  const [editCategoryInitialType, setEditCategoryInitialType] = useState("expense");
  const [showCategoryTypeWarning, setShowCategoryTypeWarning] = useState(false);
  const [categoryTypeWarningTransactions, setCategoryTypeWarningTransactions] = useState([]);
  const [selectedEmoji, setSelectedEmoji] = useState("");
  const [editSelectedEmoji, setEditSelectedEmoji] = useState("");
  const [categoryRenames, setCategoryRenames] = useState({});
  const [categoryEmojiOverrides, setCategoryEmojiOverrides] = useState({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [categoryRulePrompt, setCategoryRulePrompt] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [showCategoryRulesModal, setShowCategoryRulesModal] = useState(false);
  const [savedCategoryRules, setSavedCategoryRules] = useState([]);
  const [savedNotesRules, setSavedNotesRules] = useState([]);
  const [rulesSettingsTab, setRulesSettingsTab] = useState("category");
  const [notesRulePrompt, setNotesRulePrompt] = useState(null);
  const [transactionNotes, setTransactionNotes] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAssignAccountModal, setShowAssignAccountModal] = useState(false);
  const [assignAccountId, setAssignAccountId] = useState("");
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [editingNoteIndex, setEditingNoteIndex] = useState(-1);
  const [draftNote, setDraftNote] = useState("");
  const chatEndRef = useRef(null);
  const noteInputRef = useRef(null);
  const noteEditorRef = useRef(null);
  const quickActionsRef = useRef(null);

  const bankOptions = formTipe === "cc" ? CC_OPTIONS : BANK_OPTIONS;

  const applyTransactionMatching = async (
    transactionList,
    userName = "",
    accountList = accounts,
  ) => {
    const resolvedName = userName || userFullName || "";
    const result = runTransactionMatching(transactionList, accountList, {
      userName: resolvedName,
    });
    await saveTransactions(result.transactions);
    return result.transactions;
  };

  const persistAllTransactions = async (updatedTransactions) => {
    setTransactions(updatedTransactions);
    await saveTransactions(updatedTransactions);
  };

  const refreshDashboardData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    const [
      accountListRaw,
      rawTransactionsRaw,
      uploadHistoryListRaw,
      categoryRulesRaw,
      notesRulesRaw,
      preferences,
      profile,
    ] = await Promise.all([
      getAccounts(),
      getTransactions(),
      getUploadHistory(),
      loadCategoryRules(),
      loadNotesRules(),
      getUserPreferences(),
      getProfile(),
    ]);

    const accountList = safeArray(accountListRaw);
    const rawTransactions = safeArray(rawTransactionsRaw);
    const uploadHistoryList = safeArray(uploadHistoryListRaw);
    const categoryRules = safeArray(categoryRulesRaw);
    const notesRules = safeArray(notesRulesRaw);

    setAccounts(accountList);
    setUploadHistory(uploadHistoryList);
    setCustomCategories(safeArray(preferences.customCategories));
    setCategoryRenames(
      preferences.categoryRenames && typeof preferences.categoryRenames === "object"
        ? preferences.categoryRenames
        : {},
    );
    setCategoryEmojiOverrides(
      preferences.categoryEmojiOverrides &&
        typeof preferences.categoryEmojiOverrides === "object"
        ? preferences.categoryEmojiOverrides
        : {},
    );
    setPermanentlyDismissed(safeArray(preferences.permanentlyDismissed));

    let insightsData = safeArray(preferences.aiInsights);
    if (typeof window !== "undefined") {
      try {
        const rawInsights = localStorage.getItem("aiInsights");
        if (rawInsights) {
          const parsed = JSON.parse(rawInsights);
          if (Array.isArray(parsed) && parsed.length > 0) {
            insightsData = parsed;
            await saveUserPreferences({ aiInsights: parsed });
            localStorage.removeItem("aiInsights");
          }
        }
      } catch {
        // ignore invalid insights cache from upload flow
      }
    }
    setInsights(insightsData);

    const resolvedName =
      profile?.full_name?.trim() ||
      session.user?.user_metadata?.full_name?.trim() ||
      "";
    if (resolvedName) {
      setUserFullName(resolvedName);
    }

    const incomeNames = buildIncomeCategoryNames(
      preferences.categoryRenames,
      preferences.customCategories,
    );

    const processed = processTransactions(
      rawTransactions.map((item) => ({
        ...item,
        kategori: normalizeKategori(item?.kategori),
      })),
      incomeNames,
    );
    const withCategories = await applyCategoryRules(processed, categoryRules);
    const withNotes = await applyNotesRules(withCategories, notesRules);
    const mergedNotes = {
      ...loadTransactionNotes(),
      ...syncNotesFromTransactions(withNotes),
    };
    setTransactionNotes(mergedNotes);

    const matched = await applyTransactionMatching(
      normalizeTransactions(withNotes),
      resolvedName,
      accountList,
    );
    setTransactions(matched);
  };

  useEffect(() => {
    let mounted = true;

    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (mounted) setIsLoading(false);
          return;
        }

        await refreshDashboardData();
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadDashboardData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AI_INSIGHT_COLLAPSED_KEY);
      if (stored === "expanded") {
        setAiInsightExpanded(true);
      }
    } catch {
      // ignore invalid preference
    }
  }, []);

  useEffect(() => {
    if (!userFullName || transactions.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const matched = await applyTransactionMatching(
          transactions,
          userFullName,
          accounts,
        );
        if (!cancelled) setTransactions(matched);
      } catch (error) {
        console.error("Failed to re-run transaction matching:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userFullName]);

  useEffect(() => {
    if (transactions.length === 0 || accounts.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const matched = await applyTransactionMatching(
          transactions,
          userFullName,
          accounts,
        );
        if (!cancelled) setTransactions(matched);
      } catch (error) {
        console.error("Failed to re-run transaction matching:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accounts.length]);

  useEffect(() => {
    if (!quickActionDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (
        quickActionsRef.current &&
        !quickActionsRef.current.contains(event.target)
      ) {
        setQuickActionDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [quickActionDropdown]);

  const emojiMap = useMemo(() => {
    const map = { ...categoryEmoji };
    Object.entries(categoryRenames).forEach(([orig, renamed]) => {
      if (categoryEmojiOverrides[renamed]) {
        map[renamed] = categoryEmojiOverrides[renamed];
      } else if (map[orig]) {
        map[renamed] = map[orig];
      }
    });
    Object.entries(categoryEmojiOverrides).forEach(([name, emoji]) => {
      map[name] = emoji;
    });
    customCategories.forEach((cat) => {
      map[cat.name] = cat.emoji;
    });
    return map;
  }, [customCategories, categoryRenames, categoryEmojiOverrides]);

  const colorMap = useMemo(() => {
    const map = { ...DEFAULT_CATEGORY_COLORS };
    Object.entries(categoryRenames).forEach(([orig, renamed]) => {
      if (map[orig]) map[renamed] = map[orig];
    });
    customCategories.forEach((cat) => {
      map[cat.name] = cat.color;
    });
    return map;
  }, [customCategories, categoryRenames]);

  const incomeCategoryNames = useMemo(() => {
    const names = new Set();
    INCOME_CATEGORIES.forEach((orig) => {
      names.add(categoryRenames[orig] || orig);
    });
    customCategories.forEach((cat) => {
      if (cat.type === "income") {
        names.add(cat.name);
      }
    });
    return names;
  }, [categoryRenames, customCategories]);

  const allCategoryOptions = useMemo(() => {
    const defaultNames = CATEGORY_OPTIONS.map((cat) => categoryRenames[cat] || cat);
    const customNames = customCategories.map((cat) => cat.name);
    const merged = [...defaultNames];
    customNames.forEach((name) => {
      if (!merged.some((c) => c.toLowerCase() === name.toLowerCase())) {
        merged.push(name);
      }
    });
    return merged;
  }, [customCategories, categoryRenames]);

  const incomeCategoryOptions = useMemo(
    () =>
      allCategoryOptions.filter((cat) =>
        incomeCategoryNames.has(normalizeKategori(cat)),
      ),
    [allCategoryOptions, incomeCategoryNames],
  );

  const expenseCategoryOptions = useMemo(
    () =>
      allCategoryOptions.filter(
        (cat) => !incomeCategoryNames.has(normalizeKategori(cat)),
      ),
    [allCategoryOptions, incomeCategoryNames],
  );

  const customCategoryNames = useMemo(
    () => new Set(customCategories.map((cat) => cat.name)),
    [customCategories],
  );

  const accountFilteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        transactionMatchesAccountFilter(transaction, selectedAccountId, accounts),
      ),
    [transactions, selectedAccountId, accounts],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || null,
    [accounts, selectedAccountId],
  );

  const selectedAccountHasTransactions = accountFilteredTransactions.length > 0;
  const showAccountEmptyState =
    Boolean(selectedAccountId) && !selectedAccountHasTransactions;

  const smartStatementSuggestions = useMemo(
    () =>
      computeSmartStatementSuggestions(
        transactions,
        accounts,
        userFullName,
        permanentlyDismissed,
      ),
    [transactions, accounts, userFullName, permanentlyDismissed],
  );

  const suggestionBankKeys = useMemo(
    () => smartStatementSuggestions.map((item) => item.bank).join("|"),
    [smartStatementSuggestions],
  );

  useEffect(() => {
    const banks = suggestionBankKeys.split("|").filter(Boolean);
    if (banks.length === 1) {
      setExpandedSuggestions(new Set([banks[0]]));
      return;
    }
    setExpandedSuggestions(new Set());
  }, [suggestionBankKeys]);

  const availableBulan = useMemo(() => {
    const bulanSet = new Set(
      accountFilteredTransactions
        .map((item) => {
          const [day, month, year] = String(item?.tanggal || "").split("/");
          if (!day || !month || !year) return null;
          return `${month}/${year}`;
        })
        .filter(Boolean),
    );

    return Array.from(bulanSet).sort((a, b) => {
      const [monthA, yearA] = a.split("/");
      const [monthB, yearB] = b.split("/");
      const dateA = new Date(Number(yearA), Number(monthA) - 1, 1).getTime();
      const dateB = new Date(Number(yearB), Number(monthB) - 1, 1).getTime();
      return dateB - dateA;
    });
  }, [accountFilteredTransactions]);

  const monthFilteredTransactions = useMemo(() => {
    return transactions
      .map((transaction, originalIndex) => ({ transaction, originalIndex }))
      .filter(({ transaction }) =>
        transactionMatchesAccountFilter(transaction, selectedAccountId, accounts),
      )
      .filter(
        ({ transaction }) => filterByBulan([transaction], selectedBulan).length > 0,
      );
  }, [transactions, selectedAccountId, accounts, selectedBulan]);

  const categorySummary = useMemo(() => {
    const grouped = monthFilteredTransactions.reduce((acc, item) => {
      if (shouldExcludeFromSpending(item.transaction)) return acc;

      const kategori = normalizeKategori(item.transaction?.kategori);
      const debit = parseAmount(item.transaction?.debit);
      const kredit = parseAmount(item.transaction?.kredit);
      const jenis =
        item.transaction?.jenis ||
        inferJenisFromAmounts(debit, kredit);
      const totalAmount = jenis === "income" ? kredit : debit;
      if (!acc[kategori]) {
        acc[kategori] = { totalDebit: 0, count: 0 };
      }
      acc[kategori].totalDebit += totalAmount;
      acc[kategori].count += 1;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([kategori, value]) => ({
        kategori,
        totalDebit: value.totalDebit,
        count: value.count,
      }))
      .sort((a, b) => b.totalDebit - a.totalDebit);
  }, [monthFilteredTransactions]);

  const displayCategorySummary = useMemo(() => {
    const map = new Map(categorySummary.map((item) => [item.kategori, item]));
    customCategories.forEach((cat) => {
      if (!map.has(cat.name)) {
        map.set(cat.name, { kategori: cat.name, totalDebit: 0, count: 0 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalDebit - a.totalDebit);
  }, [categorySummary, customCategories]);

  const displayIncomeCategorySummary = useMemo(() => {
    const gajiName = categoryRenames["Gaji & Pemasukan"] || "Gaji & Pemasukan";
    const investasiName = categoryRenames["Investasi"] || "Investasi";
    const map = new Map(
      displayCategorySummary
        .filter((item) => incomeCategoryNames.has(item.kategori))
        .map((item) => [item.kategori, item]),
    );
    [gajiName, investasiName].forEach((name) => {
      if (!map.has(name)) {
        map.set(name, { kategori: name, totalDebit: 0, count: 0 });
      }
    });
    customCategories.forEach((cat) => {
      if (cat.type === "income" && !map.has(cat.name)) {
        map.set(cat.name, { kategori: cat.name, totalDebit: 0, count: 0 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalDebit - a.totalDebit);
  }, [displayCategorySummary, categoryRenames, incomeCategoryNames, customCategories]);

  const displayExpenseCategorySummary = useMemo(() => {
    return displayCategorySummary
      .filter((item) => !incomeCategoryNames.has(item.kategori))
      .sort((a, b) => b.totalDebit - a.totalDebit);
  }, [displayCategorySummary, incomeCategoryNames]);

  const totalPemasukan = useMemo(
    () =>
      displayIncomeCategorySummary.reduce((sum, item) => sum + item.totalDebit, 0),
    [displayIncomeCategorySummary],
  );

  const totalPengeluaran = useMemo(
    () =>
      displayExpenseCategorySummary.reduce((sum, item) => sum + item.totalDebit, 0),
    [displayExpenseCategorySummary],
  );

  const moveMoneySummary = useMemo(() => {
    const seenPairKeys = new Set();
    let total = 0;
    let pairCount = 0;

    monthFilteredTransactions.forEach(({ transaction }) => {
      if (transaction?.matchType !== "move_money") return;

      const pairKey = [transaction.id, transaction.matchedTransactionId]
        .filter(Boolean)
        .sort()
        .join("|");
      if (seenPairKeys.has(pairKey)) return;

      seenPairKeys.add(pairKey);
      pairCount += 1;
      total += parseAmount(transaction?.debit) || parseAmount(transaction?.kredit);
    });

    return { total, count: pairCount * 2, pairCount };
  }, [monthFilteredTransactions]);

  const accountLookup = useMemo(() => {
    const lookup = new Map();
    accounts.forEach((account) => {
      lookup.set(account.id, account);
    });
    return lookup;
  }, [accounts]);

  const legacyTransactionCount = useMemo(
    () => transactions.filter((transaction) => !transaction?.accountId).length,
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    return monthFilteredTransactions
      .filter(({ transaction }) =>
        activeCategory === "all"
          ? true
          : normalizeKategori(transaction?.kategori) === normalizeKategori(activeCategory),
      );
  }, [monthFilteredTransactions, activeCategory]);

  const monthlyStackedCharts = useMemo(() => {
    const gajiName = categoryRenames["Gaji & Pemasukan"] || "Gaji & Pemasukan";
    const investasiName = categoryRenames["Investasi"] || "Investasi";
    const expenseOrder = EXPENSE_CATEGORY_ORDER.map(
      (cat) => categoryRenames[cat] || cat,
    );
    const customNames = customCategories.map((cat) => cat.name);

    const monthBuckets = new Map();
    const incomeKeys = new Set();
    const expenseKeys = new Set();

    accountFilteredTransactions.forEach((transaction) => {
      if (shouldExcludeFromSpending(transaction)) return;

      const [day, month, year] = String(transaction?.tanggal || "").split("/");
      if (!day || !month || !year) return;

      const monthKey = `${month}/${year}`;
      const label = `${BULAN_SHORT[month] || month} ${year}`;

      if (!monthBuckets.has(monthKey)) {
        monthBuckets.set(monthKey, {
          monthKey,
          label,
          income: {},
          expense: {},
        });
      }
      const row = monthBuckets.get(monthKey);
      const kategori = normalizeKategori(transaction?.kategori);
      const debit = parseAmount(transaction?.debit);
      const kredit = parseAmount(transaction?.kredit);

      if (kredit > 0) {
        row.income[kategori] = (row.income[kategori] || 0) + kredit;
        incomeKeys.add(kategori);
      }

      if (debit > 0 && !incomeCategoryNames.has(kategori)) {
        row.expense[kategori] = (row.expense[kategori] || 0) + debit;
        expenseKeys.add(kategori);
      }
    });

    const sortMonths = (a, b) => {
      const [monthA, yearA] = a.monthKey.split("/");
      const [monthB, yearB] = b.monthKey.split("/");
      return (
        new Date(Number(yearA), Number(monthA) - 1, 1).getTime() -
        new Date(Number(yearB), Number(monthB) - 1, 1).getTime()
      );
    };

    const allRows = Array.from(monthBuckets.values()).sort(sortMonths);

    const pemasukanKeys = [
      ...[gajiName, investasiName].filter((name) => incomeKeys.has(name)),
      ...Array.from(incomeKeys)
        .filter((name) => name !== gajiName && name !== investasiName)
        .sort((a, b) => a.localeCompare(b, "id")),
    ];

    const pengeluaranKeys = [
      ...expenseOrder.filter((name) => expenseKeys.has(name)),
      ...customNames.filter((name) => expenseKeys.has(name)),
      ...Array.from(expenseKeys)
        .filter(
          (name) =>
            !expenseOrder.includes(name) &&
            !customNames.includes(name),
        )
        .sort((a, b) => a.localeCompare(b, "id")),
    ];

    const buildChartRows = (keys, sourceKey) =>
      allRows.map((row) => {
        const chartRow = { monthKey: row.monthKey, label: row.label };
        const source = row[sourceKey];
        keys.forEach((key) => {
          chartRow[key] = source[key] || 0;
        });
        return chartRow;
      });

    const pemasukanChartData = buildChartRows(pemasukanKeys, "income");
    const pengeluaranChartData = buildChartRows(pengeluaranKeys, "expense");

    const getIncomeColor = (kategori) => {
      if (kategori === gajiName) return "#10b981";
      if (kategori === investasiName) return "#3b82f6";
      return "#94a3b8";
    };

    const getExpenseColor = (kategori) =>
      colorMap[kategori] || EXPENSE_CATEGORY_COLORS[kategori] || "#94a3b8";

    const hasPemasukanData = pemasukanChartData.some((row) =>
      pemasukanKeys.some((key) => row[key] > 0),
    );
    const hasPengeluaranData = pengeluaranChartData.some((row) =>
      pengeluaranKeys.some((key) => row[key] > 0),
    );

    return {
      pemasukanChartData: hasPemasukanData ? pemasukanChartData : [],
      pengeluaranChartData: hasPengeluaranData ? pengeluaranChartData : [],
      pemasukanKeys: hasPemasukanData ? pemasukanKeys : [],
      pengeluaranKeys: hasPengeluaranData ? pengeluaranKeys : [],
      getIncomeColor,
      getExpenseColor,
    };
  }, [
    accountFilteredTransactions,
    categoryRenames,
    customCategories,
    incomeCategoryNames,
    colorMap,
  ]);

  const chatSummaryData = useMemo(() => {
    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    const breakdownMap = {};
    const dates = [];

    accountFilteredTransactions.forEach((t) => {
      if (shouldExcludeFromSpending(t)) return;

      const kategori = normalizeKategori(t?.kategori);
      const debit = parseAmount(t?.debit);
      const kredit = parseAmount(t?.kredit);

      if (incomeCategoryNames.has(kategori)) {
        totalPemasukan += kredit;
      } else {
        totalPengeluaran += debit;
        if (debit > 0) {
          breakdownMap[kategori] = (breakdownMap[kategori] || 0) + debit;
        }
      }

      const [day, month, year] = String(t?.tanggal || "").split("/");
      if (day && month && year) {
        dates.push(new Date(Number(year), Number(month) - 1, Number(day)));
      }
    });

    dates.sort((a, b) => a - b);
    let periode = "Tidak diketahui";
    if (dates.length > 0) {
      const formatDate = (d) =>
        `${BULAN_LABEL[String(d.getMonth() + 1).padStart(2, "0")]} ${d.getFullYear()}`;
      const first = formatDate(dates[0]);
      const last = formatDate(dates[dates.length - 1]);
      periode = first === last ? first : `${first} - ${last}`;
    }

    const transaksiTerbesar = [...accountFilteredTransactions]
      .filter((t) => !shouldExcludeFromSpending(t))
      .map((t) => ({
        tanggal: t?.tanggal,
        deskripsi: t?.deskripsi,
        debit: parseAmount(t?.debit),
        kategori: normalizeKategori(t?.kategori),
      }))
      .filter((t) => t.debit > 0)
      .sort((a, b) => b.debit - a.debit)
      .slice(0, 3);

    return {
      totalPemasukan,
      totalPengeluaran,
      breakdownPerKategori: Object.entries(breakdownMap).map(([nama, total]) => ({
        nama,
        total,
      })),
      periode,
      transaksiTerbesar,
    };
  }, [accountFilteredTransactions, incomeCategoryNames]);

  const userMessageCount = useMemo(
    () => chatMessages.filter((msg) => msg.role === "user").length,
    [chatMessages],
  );

  const isChatLimitReached = userMessageCount >= MAX_CHAT_MESSAGES;

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen, isChatLoading]);

  const openChat = () => {
    setIsChatOpen(true);
    if (chatMessages.length === 0) {
      setChatMessages([{ role: "assistant", content: OPENING_CHAT_MESSAGE }]);
    }
  };

  const handleSendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isChatLoading || isChatLimitReached) return;

    const userMessage = { role: "user", content: trimmed };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const history = updatedMessages.slice(0, -1).slice(-5);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          summaryData: chatSummaryData,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Gagal mengirim pesan.");
      }

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply || "Maaf, tidak ada respons." },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan.";
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Maaf, terjadi error: ${message}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const resolveDefaultOrigin = (name) => {
    for (const [orig, renamed] of Object.entries(categoryRenames)) {
      if (renamed === name) return orig;
    }
    return CATEGORY_OPTIONS.includes(name) ? name : null;
  };

  const getCategoryType = (categoryName) => {
    const customCat = customCategories.find((cat) => cat.name === categoryName);
    if (customCat?.type === "income") return "income";
    if (customCat?.type === "expense") return "expense";
    return incomeCategoryNames.has(categoryName) ? "income" : "expense";
  };

  const openEditCategoryModal = (categoryName) => {
    const currentType = getCategoryType(categoryName);
    setEditingCategoryName(categoryName);
    setEditCategoryName(categoryName);
    setEditSelectedEmoji(emojiMap[categoryName] || "📦");
    setEditCategoryType(currentType);
    setEditCategoryInitialType(currentType);
    setShowCategoryTypeWarning(false);
    setShowEditCategoryModal(true);
  };

  const closeEditCategoryModal = () => {
    setShowEditCategoryModal(false);
    setEditingCategoryName("");
    setEditCategoryName("");
    setEditSelectedEmoji("");
    setEditCategoryType("expense");
    setEditCategoryInitialType("expense");
    setShowCategoryTypeWarning(false);
    setCategoryTypeWarningTransactions([]);
  };

  const handleDismissCategoryTypeWarning = () => {
    setEditCategoryType(editCategoryInitialType);
    setShowCategoryTypeWarning(false);
    setCategoryTypeWarningTransactions([]);
  };

  const handleSaveEditCategory = async () => {
    const oldName = editingCategoryName;
    const newName = editCategoryName.trim();

    if (!oldName) return;
    if (!newName) {
      alert("Nama kategori wajib diisi.");
      return;
    }
    if (!editSelectedEmoji) {
      alert("Pilih emoji untuk kategori.");
      return;
    }
    if (
      newName.toLowerCase() !== oldName.toLowerCase() &&
      allCategoryOptions.some((cat) => cat.toLowerCase() === newName.toLowerCase())
    ) {
      alert("Kategori sudah ada.");
      return;
    }

    const typeChanged = editCategoryType !== editCategoryInitialType;
    if (typeChanged) {
      const usingTransactions = transactions.filter(
        (item) => normalizeKategori(item.kategori) === oldName,
      );
      if (usingTransactions.length > 0) {
        setCategoryTypeWarningTransactions(usingTransactions);
        setShowCategoryTypeWarning(true);
        return;
      }
    }

    const updatedTransactions = transactions.map((item) =>
      normalizeKategori(item.kategori) === oldName
        ? { ...item, kategori: newName }
        : item,
    );
    setTransactions(updatedTransactions);
    await persistAllTransactions(updatedTransactions);

    const isCustom = customCategories.some((cat) => cat.name === oldName);
    if (isCustom) {
      const updatedCustom = customCategories.map((cat) =>
        cat.name === oldName
          ? {
              ...cat,
              name: newName,
              emoji: editSelectedEmoji,
              type: editCategoryType,
            }
          : cat,
      );
      setCustomCategories(updatedCustom);
      await saveUserPreferences({ customCategories: updatedCustom });
    } else {
      const defaultOrigin =
        resolveDefaultOrigin(oldName) ||
        (CATEGORY_OPTIONS.includes(oldName) ? oldName : oldName);

      if (newName !== defaultOrigin) {
        const updatedRenames = { ...categoryRenames, [defaultOrigin]: newName };
        setCategoryRenames(updatedRenames);
        await saveUserPreferences({ categoryRenames: updatedRenames });
      }

      const updatedEmojiOverrides = {
        ...categoryEmojiOverrides,
        [newName]: editSelectedEmoji,
      };
      if (newName !== oldName) delete updatedEmojiOverrides[oldName];
      setCategoryEmojiOverrides(updatedEmojiOverrides);
      await saveUserPreferences({
        categoryEmojiOverrides: updatedEmojiOverrides,
      });
    }

    if (activeCategory === oldName) setActiveCategory(newName);
    closeEditCategoryModal();
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert("Nama kategori wajib diisi.");
      return;
    }
    if (!selectedEmoji) {
      alert("Pilih emoji untuk kategori.");
      return;
    }
    if (
      allCategoryOptions.some((cat) => cat.toLowerCase() === name.toLowerCase())
    ) {
      alert("Kategori sudah ada.");
      return;
    }

    const usedColors = [
      ...Object.values(DEFAULT_CATEGORY_COLORS),
      ...customCategories.map((cat) => cat.color),
    ];
    const newCategory = {
      name,
      emoji: selectedEmoji,
      color: pickRandomColor(usedColors),
      type: newCategoryType,
    };
    const updated = [...customCategories, newCategory];
    setCustomCategories(updated);
    await saveUserPreferences({ customCategories: updated });
    setShowCategoryModal(false);
    setNewCategoryName("");
    setSelectedEmoji("");
    setNewCategoryType("expense");
  };

  const handleDeleteCustomCategory = async (name) => {
    const inUse = transactions.some(
      (t) => normalizeKategori(t.kategori) === name,
    );
    if (inUse) {
      alert("Kategori masih digunakan oleh transaksi.");
      return;
    }

    const updated = customCategories.filter((cat) => cat.name !== name);
    setCustomCategories(updated);
    await saveUserPreferences({ customCategories: updated });
    if (activeCategory === name) setActiveCategory("all");
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setNewCategoryName("");
    setSelectedEmoji("");
    setNewCategoryType("expense");
  };

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const openAssignAccountModal = () => {
    setAssignAccountId(accounts[0]?.id || "");
    setShowAssignAccountModal(true);
  };

  const handleAssignLegacyTransactions = async () => {
    if (!assignAccountId) {
      alert("Pilih akun dulu.");
      return;
    }

    const count = legacyTransactionCount;
    if (count === 0) {
      setShowAssignAccountModal(false);
      return;
    }

    const updated = transactions.map((transaction) =>
      !transaction?.accountId
        ? { ...transaction, accountId: assignAccountId }
        : transaction,
    );

    await persistAllTransactions(updated);
    setShowAssignAccountModal(false);
    showToast(`✅ ${count} transaksi berhasil di-assign ke akun`);
  };

  const handleAddAccountModalComplete = async (account) => {
    setShowAddAccountModal(false);
    await refreshDashboardData();
    if (account?.id) {
      setSelectedAccountId(account.id);
    }

    const raw = localStorage.getItem("autoCategoryNotification");
    if (raw) {
      localStorage.removeItem("autoCategoryNotification");
      const count = Number(raw);
      if (count > 0) {
        showToast(
          `✅ ${count} transaksi dikategorisasi otomatis berdasarkan riwayat kamu`,
        );
      }
    }
  };

  const toggleAiInsight = () => {
    setAiInsightExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          AI_INSIGHT_COLLAPSED_KEY,
          next ? "expanded" : "collapsed",
        );
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const getUploadDeleteCount = (entry) => {
    if (!entry) return 0;
    return transactions.filter((transaction) => {
      const kept = removeTransactionsForUploadEntry(entry, [transaction]);
      return kept.length === 0;
    }).length;
  };

  const handleConfirmDeleteUpload = async () => {
    if (!deleteUploadConfirm) return;

    const { entry } = deleteUploadConfirm;
    await deleteTransactionsByUpload(
      entry.accountId,
      entry.dateRangeStart,
      entry.dateRangeEnd,
    );
    await deleteUploadHistoryEntry(entry.id);
    setDeleteUploadConfirm(null);
    await refreshDashboardData();
    showToast("🗑️ Statement berhasil dihapus");
  };

  const handleDeleteUploadClick = (entry) => {
    setQuickActionDropdown(null);
    setDeleteUploadConfirm({
      entry,
      count: getUploadDeleteCount(entry),
    });
  };

  const openCreateAccountModal = () => {
    setCreatedAccountSuccess(null);
    setFormNama("");
    setFormTipe("bank");
    setFormBank(BANK_OPTIONS[0]);
    setFormWarna("#63B3ED");
    setShowCreateAccountModal(true);
    setQuickActionDropdown(null);
  };

  const closeCreateAccountModal = () => {
    setShowCreateAccountModal(false);
    setCreatedAccountSuccess(null);
  };

  const handleCreateAccountTipeChange = (tipe) => {
    setFormTipe(tipe);
    setFormBank(tipe === "cc" ? CC_OPTIONS[0] : BANK_OPTIONS[0]);
  };

  const handleSaveCreateAccount = async () => {
    const nama = formNama.trim();
    if (!nama) {
      alert("Nama akun wajib diisi.");
      return;
    }
    if (!formBank) {
      alert("Pilih bank.");
      return;
    }

    const newAccount = await saveAccount({
      nama,
      tipe: formTipe,
      bank: formBank,
      warna: formWarna,
    });

    if (!newAccount) {
      alert("Gagal menyimpan akun.");
      return;
    }

    await refreshDashboardData();
    setCreatedAccountSuccess({
      id: newAccount.id,
      nama: newAccount.nama,
    });
  };

  const handleCreateAccountUploadNow = () => {
    if (!createdAccountSuccess) return;
    router.push(`/upload?accountId=${createdAccountSuccess.id}`);
  };

  const resolveUploadAccountId = () => {
    if (selectedAccountId) return selectedAccountId;
    if (accounts.length === 1) return accounts[0].id;
    return null;
  };

  const handleUploadStatementAction = () => {
    const directAccountId = resolveUploadAccountId();
    if (directAccountId) {
      router.push(`/upload?accountId=${directAccountId}`);
      setQuickActionDropdown(null);
      return;
    }

    if (accounts.length === 0) {
      openCreateAccountModal();
      return;
    }

    setQuickActionDropdown((prev) => (prev === "upload" ? null : "upload"));
  };

  const handleSelectUploadAccount = (accountId) => {
    setQuickActionDropdown(null);
    router.push(`/upload?accountId=${accountId}`);
  };

  const handlePermanentlyDismissSuggestion = (bank) => {
    setPermanentlyDismissed((prev) => {
      if (prev.includes(bank)) return prev;
      const next = [...prev, bank];
      void saveUserPreferences({ permanentlyDismissed: next });
      return next;
    });
    setConfirmDismissBank(null);
  };

  const toggleSuggestionExpanded = (bank) => {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(bank)) {
        next.delete(bank);
      } else {
        next.add(bank);
      }
      return next;
    });
  };

  const renderSmartSuggestionBanners = () => {
    if (smartStatementSuggestions.length === 0) return null;

    return (
      <div className="mt-4 space-y-3">
        {smartStatementSuggestions.map(({ bank, userName, transactions: matchedTransactions }) => {
          const isExpanded = expandedSuggestions.has(bank);

          return (
            <div
              key={bank}
              className="overflow-hidden rounded-2xl border transition-colors hover:bg-[rgba(251,191,36,0.11)]"
              style={{
                background: "rgba(251,191,36,0.08)",
                borderColor: "rgba(251,191,36,0.2)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleSuggestionExpanded(bank)}
                className={`flex w-full cursor-pointer items-start justify-between gap-3 text-left transition ${
                  isExpanded ? "p-4 pb-0" : "px-4 py-3"
                }`}
                aria-expanded={isExpanded}
              >
                <p className="text-sm font-semibold leading-relaxed text-[#ECEEF2]">
                  💡 Kami deteksi transfer ke {bank} atas nama {userName}
                </p>
                <span
                  className={`mt-0.5 shrink-0 text-xs text-[#F6AD55] transition-transform duration-300 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-[rgba(255,255,255,0.06)] p-4">
                    <p className="text-sm leading-relaxed text-[#8B92A5]">
                      Upload statement {bank} kamu untuk analisa keuangan yang lebih
                      lengkap.
                    </p>

                    <div className="mt-4 overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.06)]">
                      <table className="min-w-full text-left text-[12px]">
                        <thead className="border-b border-[rgba(255,255,255,0.06)] text-[#8B92A5]">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Tanggal</th>
                            <th className="px-3 py-2 font-semibold">Deskripsi</th>
                            <th className="px-3 py-2 font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                          {matchedTransactions.map((transaction, index) => {
                            const amountDisplay = formatAmount(transaction);
                            return (
                              <tr key={`${transaction?.tanggal || "trx"}-${index}`}>
                                <td className="whitespace-nowrap px-3 py-2 text-[#8B92A5]">
                                  {transaction?.tanggal || "-"}
                                </td>
                                <td className="max-w-[200px] truncate px-3 py-2 text-[#ECEEF2] sm:max-w-xs">
                                  {transaction?.deskripsi || "-"}
                                </td>
                                <td className={`px-3 py-2 ${amountDisplay.className}`}>
                                  {amountDisplay.text}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 flex flex-col items-start gap-2">
                      <Link
                        href={`/upload?suggestBank=${encodeURIComponent(bank)}`}
                        className="inline-flex items-center rounded-full bg-[rgba(251,191,36,0.15)] px-4 py-2 text-sm font-semibold text-[#F6AD55] transition hover:bg-[rgba(251,191,36,0.25)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Upload Statement {bank} →
                      </Link>
                      {confirmDismissBank === bank ? (
                        <div className="mt-1 w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                          <p className="text-sm text-[#8B92A5]">
                            Yakin? Suggestion ini tidak akan muncul lagi untuk{" "}
                            {bank}.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handlePermanentlyDismissSuggestion(bank);
                              }}
                              className="text-sm font-semibold text-[#FC8181] transition hover:text-[#FEB2B2]"
                            >
                              Ya, sembunyikan
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setConfirmDismissBank(null);
                              }}
                              className="text-sm font-semibold text-[#8B92A5] transition hover:text-[#ECEEF2]"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmDismissBank(bank);
                          }}
                          className="text-xs font-medium text-[#8B92A5] transition hover:text-[#ECEEF2]"
                        >
                          Ini bukan rekening saya
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    const messages = [];

    const uploadRaw = localStorage.getItem("uploadNotification");
    if (uploadRaw) {
      localStorage.removeItem("uploadNotification");
      try {
        const data = JSON.parse(uploadRaw);
        const addedCount = Number(data.transactionCount || 0);
        const dupCount = Number(data.duplicateCount || 0);

        if (dupCount > 0) {
          messages.push(
            `✅ ${addedCount} transaksi baru ditambahkan. ${dupCount} transaksi duplikat diabaikan.`,
          );
        } else if (addedCount > 0) {
          messages.push(`✅ ${addedCount} transaksi baru berhasil ditambahkan.`);
        }
        if (data.moveMoneyCount > 0) {
          messages.push(
            `↔️ ${data.moveMoneyCount} pasangan Move Money ditemukan`,
          );
        }
        if (data.payBillCount > 0) {
          messages.push(
            `💳 ${data.payBillCount} pasangan Pay Bill CC ditemukan`,
          );
        }
      } catch {
        // ignore invalid notification payload
      }
    }

    const raw = localStorage.getItem("autoCategoryNotification");
    if (raw) {
      localStorage.removeItem("autoCategoryNotification");
      const count = Number(raw);
      if (count > 0) {
        messages.push(
          `✅ ${count} transaksi dikategorisasi otomatis berdasarkan riwayat kamu`,
        );
      }
    }

    if (messages.length === 0) return;

    messages.forEach((message, index) => {
      setTimeout(() => showToast(message), index * 3200);
    });
  }, []);

  const applyCategoryToIndices = async (indices, category) => {
    const indexSet = new Set(indices);
    const updated = transactions.map((item, idx) =>
      indexSet.has(idx)
        ? { ...item, kategori: normalizeKategori(category) }
        : item,
    );
    setTransactions(updated);
    await saveTransactions(updated);
  };

  const handleClearMoveMoneyMatch = async (originalIndex) => {
    const target = transactions[originalIndex];
    if (!target?.id || target.matchType !== "move_money") return;

    const updated = removeMoveMoneyMatch(transactions, target.id);
    await persistAllTransactions(updated);
  };

  const handleCategoryChange = (index, nextCategory, previousCategory) => {
    if (index < 0) return;

    const normalizedNext = normalizeKategori(nextCategory);
    const normalizedPrev = normalizeKategori(
      previousCategory || transactions[index]?.kategori,
    );

    if (normalizedNext === normalizedPrev) return;

    const sourceJenis = transactions[index]?.jenis;
    const matchingIndices = getMatchingIndices(transactions, index).filter(
      (i) =>
        normalizeKategori(transactions[i]?.kategori) === normalizedPrev &&
        transactions[i]?.jenis === sourceJenis,
    );
    const otherMatches = matchingIndices.filter((i) => i !== index);

    if (otherMatches.length === 0) {
      applyCategoryToIndices([index], normalizedNext);
      return;
    }

    const keyword = extractKeyword(transactions[index]?.deskripsi);
    setCategoryRulePrompt({
      index,
      newCategory: normalizedNext,
      keyword,
      matchingIndices,
      selectedIndices: [...matchingIndices],
    });
  };

  const handleToggleSelectAll = (checked) => {
    setCategoryRulePrompt((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selectedIndices: checked ? [...prev.matchingIndices] : [],
      };
    });
  };

  const handleToggleTransactionSelection = (transactionIndex, checked) => {
    setCategoryRulePrompt((prev) => {
      if (!prev) return prev;
      const selectedIndices = checked
        ? [...prev.selectedIndices, transactionIndex]
        : prev.selectedIndices.filter((i) => i !== transactionIndex);
      return { ...prev, selectedIndices };
    });
  };

  const handleApplyCategoryRule = async () => {
    if (!categoryRulePrompt) return;
    const { selectedIndices, newCategory, keyword } = categoryRulePrompt;
    if (selectedIndices.length === 0) return;
    await applyCategoryToIndices(selectedIndices, newCategory);
    await saveCategoryRule(
      keyword,
      newCategory,
      getNoteForTransaction(transactions[categoryRulePrompt.index]),
    );
    showToast(`✅ ${selectedIndices.length} transaksi berhasil dikategorisasi`);
    setCategoryRulePrompt(null);
  };

  const handleApplyThisTransactionOnly = async () => {
    if (!categoryRulePrompt) return;
    const { index, newCategory, keyword } = categoryRulePrompt;
    await applyCategoryToIndices([index], newCategory);
    await saveCategoryRule(
      keyword,
      newCategory,
      getNoteForTransaction(transactions[index]),
    );
    setCategoryRulePrompt(null);
  };

  const handleCancelCategoryRule = () => {
    setCategoryRulePrompt(null);
  };

  const getNoteForTransaction = (transaction) => {
    const key = getTransactionNoteKey(transaction);
    return transactionNotes[key] || transaction?.notes || "";
  };

  const hasNoteForTransaction = (transaction) =>
    Boolean(getNoteForTransaction(transaction).trim());

  const persistNotesToIndices = async (indices, noteText) => {
    const trimmed = String(noteText || "").trim();
    const indexSet = new Set(indices);
    let notes = loadTransactionNotes();
    const updated = transactions.map((item, idx) => {
      if (!indexSet.has(idx)) return item;
      const key = getTransactionNoteKey(item);
      notes = saveTransactionNote(key, trimmed);
      return { ...item, notes: trimmed || undefined };
    });
    setTransactionNotes({ ...notes });
    setTransactions(updated);
    await saveTransactions(updated);
  };

  const handleStartNoteEdit = (transaction, originalIndex) => {
    const key = getTransactionNoteKey(transaction);
    setEditingNoteKey(key);
    setEditingNoteIndex(originalIndex);
    setDraftNote(getNoteForTransaction(transaction));
  };

  const handleSaveNoteEdit = () => {
    if (editingNoteKey === null || editingNoteIndex < 0) return;

    const trimmed = draftNote.trim();
    const index = editingNoteIndex;
    const transaction = transactions[index];

    setEditingNoteKey(null);
    setEditingNoteIndex(-1);
    setDraftNote("");

    if (!trimmed) {
      persistNotesToIndices([index], "");
      return;
    }

    const matchingIndices = getMatchingIndices(transactions, index).filter((i) => {
      if (i === index) return true;
      return !hasNoteForTransaction(transactions[i]);
    });
    const otherMatches = matchingIndices.filter((i) => i !== index);

    if (otherMatches.length === 0) {
      persistNotesToIndices([index], trimmed);
      return;
    }

    const keyword = extractKeyword(transaction?.deskripsi);
    setNotesRulePrompt({
      index,
      newNotes: trimmed,
      keyword,
      matchingIndices,
      selectedIndices: [...matchingIndices],
    });
  };

  const handleCancelNoteEdit = () => {
    setEditingNoteKey(null);
    setEditingNoteIndex(-1);
    setDraftNote("");
  };

  useEffect(() => {
    if (!editingNoteKey) return;
    noteInputRef.current?.focus();
  }, [editingNoteKey]);

  useEffect(() => {
    if (!editingNoteKey) return;

    const handleClickOutside = (event) => {
      if (noteEditorRef.current?.contains(event.target)) return;
      handleSaveNoteEdit();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingNoteKey, draftNote, editingNoteIndex]);

  const handleToggleNoteSelectAll = (checked) => {
    setNotesRulePrompt((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        selectedIndices: checked ? [...prev.matchingIndices] : [],
      };
    });
  };

  const handleToggleNoteTransactionSelection = (transactionIndex, checked) => {
    setNotesRulePrompt((prev) => {
      if (!prev) return prev;
      const selectedIndices = checked
        ? [...prev.selectedIndices, transactionIndex]
        : prev.selectedIndices.filter((i) => i !== transactionIndex);
      return { ...prev, selectedIndices };
    });
  };

  const handleApplyNotesRule = async () => {
    if (!notesRulePrompt) return;
    const { selectedIndices, newNotes, keyword } = notesRulePrompt;
    if (selectedIndices.length === 0) return;
    await persistNotesToIndices(selectedIndices, newNotes);
    await saveNotesRule(keyword, newNotes);
    showToast(`✅ Notes diterapkan ke ${selectedIndices.length} transaksi`);
    setNotesRulePrompt(null);
  };

  const handleApplyThisNoteOnly = async () => {
    if (!notesRulePrompt) return;
    const { index, newNotes, keyword } = notesRulePrompt;
    await persistNotesToIndices([index], newNotes);
    await saveNotesRule(keyword, newNotes);
    setNotesRulePrompt(null);
  };

  const handleCancelNotesRule = () => {
    setNotesRulePrompt(null);
  };

  const openCategoryRulesModal = async () => {
    setSavedCategoryRules(safeArray(await loadCategoryRules()));
    setSavedNotesRules(safeArray(await loadNotesRules()));
    setRulesSettingsTab("category");
    setShowCategoryRulesModal(true);
  };

  const handleDeleteCategoryRule = async (keyword) => {
    await deleteCategoryRule(keyword);
    setSavedCategoryRules(safeArray(await loadCategoryRules()));
    showToast("Aturan kategori dihapus");
  };

  const handleDeleteNotesRule = async (keyword) => {
    await deleteNotesRule(keyword);
    setSavedNotesRules(safeArray(await loadNotesRules()));
    showToast("Aturan notes dihapus");
  };

  const renderCategoryCards = (items, emptyMessage) => {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] p-4 text-[#8B92A5]">
          {emptyMessage}
        </div>
      );
    }

    return items.map((item) => {
      const isCustom = customCategoryNames.has(item.kategori);
      const canDelete = isCustom && item.count === 0;

      return (
        <button
          key={item.kategori}
          type="button"
          onClick={() => setActiveCategory(item.kategori)}
          className={`group relative rounded-2xl border p-4 text-left transition ${
            activeCategory === item.kategori
              ? "vale-pill-active"
              : "vale-card text-[#ECEEF2] hover:border-[rgba(99,179,237,0.25)] hover:bg-[#1E2129]"
          }`}
        >
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              openEditCategoryModal(item.kategori);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                openEditCategoryModal(item.kategori);
              }
            }}
            className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-xs opacity-0 transition-opacity group-hover:opacity-100 ${
              activeCategory === item.kategori
                ? "bg-[#1A1D25]/20 hover:bg-[#1A1D25]/30"
                : "bg-[#20242E] hover:bg-[#1A1D25]/20"
            }`}
            aria-label={`Edit kategori ${item.kategori}`}
          >
            ✏️
          </span>
          {canDelete ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteCustomCategory(item.kategori);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  handleDeleteCustomCategory(item.kategori);
                }
              }}
              className={`absolute right-11 top-3 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold opacity-0 transition-opacity group-hover:opacity-100 ${
                activeCategory === item.kategori
                  ? "bg-[#1A1D25]/20 text-white hover:bg-[#1A1D25]/30"
                  : "bg-[#20242E] text-[#8B92A5] hover:bg-[#1A1D25]/20"
              }`}
              aria-label={`Hapus kategori ${item.kategori}`}
            >
              ×
            </span>
          ) : null}
          <p
            className={`text-sm font-medium ${
              activeCategory === item.kategori ? "text-white/90" : "text-[#8B92A5]"
            }`}
          >
            {emojiMap[item.kategori] || "📦"} {item.kategori}
          </p>
          <p
            className={`mt-1 text-xl font-bold ${
              activeCategory === item.kategori ? "text-white" : "text-[#63B3ED]"
            }`}
          >
            {formatRupiah(item.totalDebit)}
          </p>
          <p
            className={`mt-1 text-sm ${
              activeCategory === item.kategori ? "text-white/90" : "text-[#8B92A5]"
            }`}
          >
            {item.count} transaksi
          </p>
        </button>
      );
    });
  };

  return (
    <div className="vale-page font-body relative min-h-screen">
      <Navbar />

      {isLoading ? <DashboardLoadingSkeleton /> : null}

      {!isLoading && (
        <div>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
          <h1 className="font-serif-display text-3xl tracking-tight text-[#ECEEF2] md:text-4xl">
          Dashboard Transaksi
          {selectedAccount ? (
            <span className="font-serif-display font-normal text-[#ECEEF2]">
              {" "}
              — {selectedAccount.nama}
            </span>
          ) : null}
        </h1>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedAccountId("")}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-semibold transition ${
                !selectedAccountId
                  ? "btn-primary"
                  : "vale-pill-inactive"
              }`}
            >
              Semua Akun
            </button>

            {accounts.map((account) => {
              const isActive = selectedAccountId === account.id;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition ${
                    isActive ? "vale-pill-active" : "vale-pill-inactive"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: account.warna || "#63B3ED" }}
                    aria-hidden="true"
                  />
                  {account.nama}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowAddAccountModal(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] text-lg font-semibold text-[#8B92A5] transition hover:border-[#63B3ED] hover:text-[#63B3ED]"
              aria-label="Tambah akun dan upload statement"
            >
              +
            </button>
          </div>
        </div>

        {showAccountEmptyState ? (
          <div>
            <div ref={quickActionsRef} className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleUploadStatementAction}
                className="btn-primary inline-flex items-center gap-2 rounded-[10px] px-6 py-3 text-[15px] font-semibold transition"
              >
                📄 Upload Statement →
              </button>
            </div>

            {renderSmartSuggestionBanners()}

            <section className="vale-card mt-8 flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
              <span className="text-5xl" aria-hidden="true">
                📄
              </span>
              <h2 className="mt-6 text-xl font-bold text-[#ECEEF2]">
                Belum ada statement
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8B92A5]">
                Upload statement {selectedAccount?.bank || "bank"} kamu untuk mulai
                analisa keuangan
              </p>
            </section>
          </div>
        ) : (
          <div>
        <div ref={quickActionsRef} className="mt-4 flex flex-wrap gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={handleUploadStatementAction}
              className={QUICK_ACTION_BUTTON_CLASS}
            >
              📄 Upload Statement
            </button>
            {quickActionDropdown === "upload" ? (
              <div className="absolute left-0 top-full z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] py-1 shadow-xl">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleSelectUploadAccount(account.id)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#ECEEF2] transition hover:bg-[rgba(99,179,237,0.08)]"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: account.warna || "#63B3ED" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{account.nama}</span>
                      <span className="block truncate text-xs text-[#8B92A5]">
                        {account.bank}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openCreateAccountModal}
            className={QUICK_ACTION_BUTTON_CLASS}
          >
            🏦 Tambah Akun
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setQuickActionDropdown((prev) =>
                  prev === "delete" ? null : "delete",
                )
              }
              className={QUICK_ACTION_BUTTON_CLASS}
            >
              🗑️ Hapus Statement
            </button>
            {quickActionDropdown === "delete" ? (
              <div className="absolute left-0 top-full z-30 mt-2 max-h-72 min-w-[280px] overflow-y-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] py-1 shadow-xl">
                {uploadHistory.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-[#8B92A5]">
                    Belum ada statement diupload
                  </p>
                ) : (
                  uploadHistory.map((entry) => {
                    const account = accountLookup.get(entry.accountId);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleDeleteUploadClick(entry)}
                        className="flex w-full flex-col px-4 py-2.5 text-left transition hover:bg-[rgba(99,179,237,0.08)]"
                      >
                        <span className="truncate text-sm font-semibold text-[#ECEEF2]">
                          {entry.fileName}
                        </span>
                        <span className="mt-0.5 text-xs text-[#8B92A5]">
                          {entry.dateRange} · {entry.transactionCount} transaksi
                          {account ? ` · ${account.nama}` : ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          <Link href="/accounts" className={QUICK_ACTION_BUTTON_CLASS}>
            ⚙️ Kelola Akun
          </Link>
        </div>

        {renderSmartSuggestionBanners()}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-[#63B3ED]">Filter Bulan:</p>
          <select
            value={selectedBulan}
            onChange={(event) => setSelectedBulan(event.target.value)}
            className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-4 py-2 text-sm font-semibold text-[#ECEEF2] outline-none transition focus:border-[#63B3ED]"
          >
            <option value="">Semua Bulan</option>
            {availableBulan.map((bulan) => (
              <option key={bulan} value={bulan}>
                {formatBulanLabel(bulan)}
              </option>
            ))}
          </select>
        </div>

        {insights.length > 0 && !selectedAccountId ? (
          <section className="vale-card mt-8 overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={toggleAiInsight}
              className="flex w-full items-center justify-between gap-3 p-5 text-left transition hover:bg-[rgba(255,255,255,0.02)]"
              aria-expanded={aiInsightExpanded}
            >
              <h2 className="text-xl font-bold text-[#63B3ED]">✨ AI Insight</h2>
              <span
                className={`shrink-0 text-sm text-[#8B92A5] transition-transform duration-300 ${
                  aiInsightExpanded ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                aiInsightExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="border-t border-[rgba(255,255,255,0.06)] px-5 pb-5 pt-4">
                  <p className="text-sm text-[#8B92A5]">
                    Analisa personal berdasarkan pola spending kamu
                  </p>
                  <ul className="mt-4 space-y-3">
                    {insights.map((insight, index) => (
                      <li
                        key={`insight-${index}`}
                        className={`${INSIGHT_VARIANTS[index % INSIGHT_VARIANTS.length]} px-4 py-3 text-sm leading-relaxed text-[#8B92A5]`}
                      >
                        <span className="mr-2 font-bold text-[#63B3ED]">
                          {index + 1}.
                        </span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="vale-card mt-8 rounded-2xl p-5">
          <h2 className="text-xl font-bold text-[#63B3ED]">
            Ringkasan Keuangan per Bulan
          </h2>
          <div className="mt-4 flex flex-col gap-8 lg:flex-row">
            <MonthlyStackedBarChart
              title="Pemasukan"
              data={monthlyStackedCharts.pemasukanChartData}
              stackKeys={monthlyStackedCharts.pemasukanKeys}
              getColor={monthlyStackedCharts.getIncomeColor}
              selectedBulan={selectedBulan}
            />
            <MonthlyStackedBarChart
              title="Pengeluaran"
              data={monthlyStackedCharts.pengeluaranChartData}
              stackKeys={monthlyStackedCharts.pengeluaranKeys}
              getColor={monthlyStackedCharts.getExpenseColor}
              selectedBulan={selectedBulan}
            />
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="rounded-full border border-[rgba(99,179,237,0.3)] px-4 py-2 text-sm font-semibold text-[#63B3ED] transition btn-primary"
            >
              + Tambah Kategori
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeCategory === "all"
                  ? "btn-primary"
                  : "border border-[rgba(99,179,237,0.3)] text-[#63B3ED] btn-primary"
              }`}
            >
              Semua Transaksi
            </button>
          </div>

          <div className="mt-8">
            {moveMoneySummary.pairCount > 0 ? (
              <div
                className="mb-6 rounded-xl border px-4 py-3"
                style={{
                  background: "rgba(139,146,165,0.1)",
                  borderColor: "rgba(139,146,165,0.2)",
                }}
              >
                <p className="text-sm font-semibold text-[#8B92A5]">
                  ↔️ Move Money: {formatRupiah(moveMoneySummary.total)}
                </p>
                <p className="mt-1 text-xs text-[#8B92A5]">
                  {moveMoneySummary.count} transaksi antar rekening sendiri tidak
                  dihitung sebagai pengeluaran
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold text-[#68D391]">💰 Pemasukan</h2>
              <p className="text-xl font-bold text-[#68D391]">
                {formatRupiah(totalPemasukan)}
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderCategoryCards(
                displayIncomeCategorySummary,
                "Belum ada data pemasukan untuk ditampilkan.",
              )}
            </div>
          </div>

          <div className="mt-10 border-t border-[rgba(255,255,255,0.08)] pt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold text-[#FC8181]">💸 Pengeluaran</h2>
              <p className="text-xl font-bold text-[#FC8181]">
                {formatRupiah(totalPengeluaran)}
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderCategoryCards(
                displayExpenseCategorySummary,
                "Belum ada data pengeluaran untuk ditampilkan.",
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 vale-card overflow-hidden rounded-2xl">
          {legacyTransactionCount > 0 ? (
            <div className="flex justify-end border-b border-[rgba(255,255,255,0.08)] bg-[#20242E] px-4 py-3">
              <button
                type="button"
                onClick={openAssignAccountModal}
                className="rounded-full border border-[rgba(99,179,237,0.3)] px-4 py-2 text-sm font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.06)]"
              >
                ⚙️ Assign Akun ke Transaksi Lama
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[rgba(255,255,255,0.04)] bg-[#1A1D25]">
              <thead className="vale-table-header text-left text-sm">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Akun</th>
                  <th className="px-4 py-3">Deskripsi</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)] bg-[#1A1D25] text-sm">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map(({ transaction, originalIndex }, index) => {
                    const noteKey = getTransactionNoteKey(transaction);
                    const savedNote = getNoteForTransaction(transaction);
                    const isEditingNote = editingNoteKey === noteKey;
                    const account = resolveAccountForTransaction(
                      transaction,
                      accountLookup,
                      accounts,
                    );
                    const amountDisplay = formatAmount(transaction);
                    const isMoveMoney = transaction?.matchType === "move_money";

                    return (
                    <tr
                      key={`${transaction?.tanggal || "trx"}-${originalIndex}-${index}`}
                      className="group transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                    >
                      <td className="px-4 py-3 text-[#8B92A5]">
                        {transaction?.tanggal || "-"}
                      </td>
                      <td className="px-4 py-3 text-[#8B92A5]">
                        {account ? (
                          <span className="vale-account-badge inline-flex items-center">
                            {getAccountShortLabel(account)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#8B92A5]">
                        {transaction?.deskripsi || "-"}
                      </td>
                      <td className={`px-4 py-3 ${amountDisplay.className}`}>
                        {amountDisplay.text}
                      </td>
                      <td className="px-4 py-3 text-[#8B92A5]">
                        {isMoveMoney ? (
                          <div className="flex flex-col items-start gap-1.5">
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold text-[#8B92A5]"
                              style={{
                                background: "rgba(139,146,165,0.1)",
                                border: "1px solid rgba(139,146,165,0.2)",
                              }}
                            >
                              ↔️ Move Money
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleClearMoveMoneyMatch(originalIndex)
                              }
                              className="text-[11px] font-medium text-[#8B92A5] underline-offset-2 transition hover:text-[#ECEEF2] hover:underline"
                            >
                              Bukan move money?
                            </button>
                          </div>
                        ) : (
                          <select
                            value={normalizeKategori(transaction?.kategori)}
                            onChange={(event) =>
                              handleCategoryChange(
                                originalIndex,
                                event.target.value,
                                transaction?.kategori,
                              )
                            }
                            className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-2 py-1 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]"
                          >
                            {(transaction?.jenis === "income"
                              ? incomeCategoryOptions
                              : expenseCategoryOptions
                            ).map((category) => {
                              const normalizedCategory = normalizeKategori(category);
                              return (
                                <option key={normalizedCategory} value={normalizedCategory}>
                                  {emojiMap[normalizedCategory] || "📦"} {normalizedCategory}
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </td>
                      <td
                        ref={isEditingNote ? noteEditorRef : null}
                        className="px-4 py-3 text-[#8B92A5]"
                      >
                        <TransactionNoteCell
                          transaction={transaction}
                          note={savedNote}
                          isEditing={isEditingNote}
                          draftNote={draftNote}
                          onDraftChange={setDraftNote}
                          onStartEdit={() =>
                            handleStartNoteEdit(transaction, originalIndex)
                          }
                          onSave={handleSaveNoteEdit}
                          onCancel={handleCancelNoteEdit}
                          inputRef={noteInputRef}
                        />
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#8B92A5]">
                      {monthFilteredTransactions.length > 0
                        ? "Tidak ada transaksi pada kategori ini."
                        : "Belum ada data transaksi. Silakan upload statement terlebih dahulu."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
          </div>
        )}
      </main>

      <AddAccountUploadModal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onComplete={handleAddAccountModalComplete}
      />

      {showCreateAccountModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="vale-modal w-full max-w-md rounded-2xl p-6 shadow-xl">
            {createdAccountSuccess ? (
              <>
                <p className="text-center text-lg font-semibold leading-relaxed text-[#ECEEF2]">
                  ✅ Akun {createdAccountSuccess.nama} berhasil ditambahkan!
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleCreateAccountUploadNow}
                    className="btn-primary w-full rounded-full px-4 py-2.5 text-sm font-semibold transition"
                  >
                    📄 Upload Statement Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (createdAccountSuccess?.id) {
                        setSelectedAccountId(createdAccountSuccess.id);
                      }
                      closeCreateAccountModal();
                      void refreshDashboardData();
                    }}
                    className="w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                  >
                    Nanti Saja
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#63B3ED]">Tambah Akun</h3>

                <label className="mt-5 block text-sm font-semibold text-[#8B92A5]">
                  Nama Akun
                  <input
                    type="text"
                    value={formNama}
                    onChange={(event) => setFormNama(event.target.value)}
                    placeholder="Contoh: Jago Utama"
                    className="mt-2 w-full rounded-xl border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm outline-none focus:border-[#63B3ED]"
                  />
                </label>

                <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Tipe Akun</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCreateAccountTipeChange("bank")}
                    className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      formTipe === "bank"
                        ? "vale-toggle-active"
                        : "vale-toggle-inactive"
                    }`}
                  >
                    🏦 Bank Account
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateAccountTipeChange("cc")}
                    className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      formTipe === "cc"
                        ? "vale-toggle-active"
                        : "vale-toggle-inactive"
                    }`}
                  >
                    💳 Credit Card
                  </button>
                </div>

                <label className="mt-5 block text-sm font-semibold text-[#8B92A5]">
                  Bank
                  <select
                    value={formBank}
                    onChange={(event) => setFormBank(event.target.value)}
                    className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                  >
                    {bankOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Warna Akun</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormWarna(color)}
                      className={`h-9 w-9 rounded-full transition ${
                        formWarna === color
                          ? "vale-color-selected"
                          : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Pilih warna ${color}`}
                    />
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={handleSaveCreateAccount}
                    className="btn-primary flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateAccountModal}
                    className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deleteUploadConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="vale-modal w-full max-w-md rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#63B3ED]">Hapus Statement?</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
              Hapus statement ini? {deleteUploadConfirm.count} transaksi dari periode
              ini akan dihapus dari dashboard.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDeleteUpload}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={() => setDeleteUploadConfirm(null)}
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignAccountModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#63B3ED]">Assign Akun</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
              {legacyTransactionCount} transaksi belum punya akun. Assign ke akun
              mana?
            </p>

            {accounts.length > 0 ? (
              <>
                <label className="mt-5 block text-sm font-semibold text-[#8B92A5]">
                  Pilih Akun
                  <select
                    value={assignAccountId}
                    onChange={(event) => setAssignAccountId(event.target.value)}
                    className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.nama} ({account.bank})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={handleAssignLegacyTransactions}
                    className="flex-1 btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAssignAccountModal(false)}
                    className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-[#8B92A5]">
                  Belum ada akun. Tambah akun dulu di halaman Akun.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAssignAccountModal(false)}
                  className="mt-6 w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#63B3ED]">Buat Kategori Baru</h3>
            <p className="mt-1 text-sm text-[#8B92A5]">
              Tambahkan kategori custom untuk transaksi kamu
            </p>

            <label className="mt-5 block text-sm font-semibold text-[#8B92A5]">
              Nama Kategori
              <input
                type="text"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Contoh: Pendidikan Anak"
                className="mt-2 w-full rounded-xl border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm outline-none focus:border-[#63B3ED]"
              />
            </label>

            <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Jenis Kategori:</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setNewCategoryType("income")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  newCategoryType === "income"
                    ? "btn-primary"
                    : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                }`}
              >
                💰 Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setNewCategoryType("expense")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  newCategoryType === "expense"
                    ? "btn-primary"
                    : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                }`}
              >
                💸 Pengeluaran
              </button>
            </div>

            <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Pilih Emoji</p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`rounded-xl border p-2 text-xl transition ${
                    selectedEmoji === emoji
                      ? "border-[#63B3ED] bg-[#63B3ED]/10"
                      : "border-[rgba(255,255,255,0.08)] hover:border-[#63B3ED]/40"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleCreateCategory}
                className="flex-1 btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
              >
                Buat Kategori
              </button>
              <button
                type="button"
                onClick={closeCategoryModal}
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#63B3ED]">Edit Kategori</h3>
            <p className="mt-1 text-sm text-[#8B92A5]">
              Ubah nama dan emoji kategori
            </p>

            <label className="mt-5 block text-sm font-semibold text-[#8B92A5]">
              Nama Kategori
              <input
                type="text"
                value={editCategoryName}
                onChange={(event) => setEditCategoryName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm outline-none focus:border-[#63B3ED]"
              />
            </label>

            <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Jenis Kategori:</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditCategoryType("income")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  editCategoryType === "income"
                    ? "btn-primary"
                    : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                }`}
              >
                💰 Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setEditCategoryType("expense")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  editCategoryType === "expense"
                    ? "btn-primary"
                    : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                }`}
              >
                💸 Pengeluaran
              </button>
            </div>

            <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Pilih Emoji</p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={`edit-${emoji}`}
                  type="button"
                  onClick={() => setEditSelectedEmoji(emoji)}
                  className={`rounded-xl border p-2 text-xl transition ${
                    editSelectedEmoji === emoji
                      ? "border-[#63B3ED] bg-[#63B3ED]/10"
                      : "border-[rgba(255,255,255,0.08)] hover:border-[#63B3ED]/40"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleSaveEditCategory}
                className="flex-1 btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={closeEditCategoryModal}
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCategoryTypeWarning ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#63B3ED]">
              ⚠️ Tidak Bisa Ganti Jenis Kategori
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
              Kategori &apos;{editingCategoryName}&apos; masih digunakan oleh{" "}
              {categoryTypeWarningTransactions.length} transaksi. Tolong pindahkan
              semua transaksi ke kategori lain sebelum mengganti jenisnya.
            </p>
            <ul className="mt-4 space-y-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#20242E] p-3 text-sm">
              {categoryTypeWarningTransactions.slice(0, 5).map((transaction, index) => {
                const debit = parseAmount(transaction?.debit);
                const kredit = parseAmount(transaction?.kredit);
                return (
                  <li
                    key={`${transaction?.tanggal || "trx"}-${index}`}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="shrink-0 text-[#8B92A5]">
                      {transaction?.tanggal || "-"}
                    </span>
                    <span className="min-w-0 flex-1 text-[#ECEEF2]">
                      {transaction?.deskripsi || "-"}
                    </span>
                    <span className="shrink-0 font-medium">
                      {debit > 0 ? (
                        <span className="text-[#FC8181]">{formatRupiah(debit)}</span>
                      ) : kredit > 0 ? (
                        <span className="text-[#68D391]">{formatRupiah(kredit)}</span>
                      ) : (
                        <span className="text-[#8B92A5]">-</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {categoryTypeWarningTransactions.length > 5 ? (
              <p className="mt-2 text-sm text-[#8B92A5]">
                dan {categoryTypeWarningTransactions.length - 5} transaksi lainnya
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleDismissCategoryTypeWarning}
              className="mt-6 w-full btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
            >
              OK, Mengerti
            </button>
          </div>
        </div>
      ) : null}

      {showCategoryRulesModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="flex w-full max-w-lg max-h-[500px] flex-col overflow-hidden vale-modal rounded-2xl shadow-xl">
            <div className="border-b border-[rgba(255,255,255,0.08)] px-6 py-5">
              <h3 className="text-lg font-bold text-[#63B3ED]">Aturan Tersimpan</h3>
              <p className="mt-1 text-sm text-[#8B92A5]">
                Aturan ini diterapkan otomatis saat upload statement baru
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRulesSettingsTab("category")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    rulesSettingsTab === "category"
                      ? "btn-primary"
                      : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                  }`}
                >
                  Aturan Kategori
                </button>
                <button
                  type="button"
                  onClick={() => setRulesSettingsTab("notes")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    rulesSettingsTab === "notes"
                      ? "btn-primary"
                      : "border border-[rgba(255,255,255,0.08)] text-[#8B92A5] hover:bg-[#20242E]"
                  }`}
                >
                  Aturan Notes
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {rulesSettingsTab === "category" ? (
                savedCategoryRules.length > 0 ? (
                  <ul className="space-y-2">
                    {savedCategoryRules.map((rule) => (
                      <li
                        key={`${rule.keyword}-${rule.createdAt || rule.kategori}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] px-4 py-3 transition hover:bg-[#20242E]"
                      >
                        <span className="min-w-0 flex-1 text-sm text-[#ECEEF2]">
                          {rule.keyword} → {rule.kategori}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryRule(rule.keyword)}
                          className="shrink-0 rounded-full px-2 py-1 text-[#8B92A5] transition hover:bg-red-50 hover:text-[#FC8181]"
                          aria-label={`Hapus aturan ${rule.keyword}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#8B92A5]">
                    Belum ada aturan kategori tersimpan. Aturan dibuat otomatis saat
                    kamu menerapkan kategori ke transaksi serupa.
                  </p>
                )
              ) : savedNotesRules.length > 0 ? (
                <ul className="space-y-2">
                  {savedNotesRules.map((rule) => (
                    <li
                      key={`${rule.keyword}-${rule.createdAt || rule.notes}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] px-4 py-3 transition hover:bg-[#20242E]"
                    >
                      <span className="min-w-0 flex-1 text-sm text-[#ECEEF2]">
                        {rule.keyword} → &apos;{rule.notes}&apos;
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotesRule(rule.keyword)}
                        className="shrink-0 rounded-full px-2 py-1 text-[#8B92A5] transition hover:bg-red-50 hover:text-[#FC8181]"
                        aria-label={`Hapus aturan notes ${rule.keyword}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#8B92A5]">
                  Belum ada aturan notes tersimpan. Aturan dibuat otomatis saat kamu
                  menerapkan notes ke transaksi serupa.
                </p>
              )}
            </div>

            <div className="border-t border-[rgba(255,255,255,0.08)] px-6 py-4">
              <button
                type="button"
                onClick={() => setShowCategoryRulesModal(false)}
                className="w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notesRulePrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="flex w-full max-w-2xl max-h-[500px] flex-col overflow-hidden vale-modal rounded-2xl shadow-xl">
            <div className="border-b border-[rgba(255,255,255,0.08)] px-6 py-5">
              <h3 className="text-lg font-bold text-[#63B3ED]">
                Terapkan Notes ke Transaksi Serupa?
              </h3>
              <p className="mt-1 text-sm text-[#8B92A5]">
                Pilih transaksi yang mau diberi catatan &apos;{notesRulePrompt.newNotes}&apos;
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-[#20242E]">
                <input
                  type="checkbox"
                  checked={
                    notesRulePrompt.selectedIndices.length ===
                      notesRulePrompt.matchingIndices.length &&
                    notesRulePrompt.matchingIndices.length > 0
                  }
                  onChange={(event) => handleToggleNoteSelectAll(event.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#63B3ED]"
                />
                <span className="text-sm font-semibold text-[#ECEEF2]">Pilih Semua</span>
              </label>

              <div className="mt-1 divide-y divide-[rgba(255,255,255,0.04)]">
                {notesRulePrompt.matchingIndices.map((transactionIndex) => {
                  const transaction = transactions[transactionIndex];
                  const debit = parseAmount(transaction?.debit);
                  const kredit = parseAmount(transaction?.kredit);
                  const isSelected = notesRulePrompt.selectedIndices.includes(
                    transactionIndex,
                  );

                  return (
                    <label
                      key={transactionIndex}
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-[#20242E]"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          handleToggleNoteTransactionSelection(
                            transactionIndex,
                            event.target.checked,
                          )
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#63B3ED]"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <span className="shrink-0 text-[#8B92A5]">
                            {transaction?.tanggal || "-"}
                          </span>
                          <span className="min-w-0 flex-1 text-[#ECEEF2]">
                            {transaction?.deskripsi || "-"}
                          </span>
                          <span className="shrink-0 font-medium">
                            {debit > 0 ? (
                              <span className="text-[#FC8181]">{formatRupiah(debit)}</span>
                            ) : kredit > 0 ? (
                              <span className="text-[#68D391]">{formatRupiah(kredit)}</span>
                            ) : (
                              <span className="text-[#8B92A5]">-</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[rgba(255,255,255,0.08)] px-6 py-4">
              <span className="text-sm text-[#8B92A5]">
                [{notesRulePrompt.selectedIndices.length}] transaksi dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyThisNoteOnly}
                  className="rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Transaksi Ini Saja
                </button>
                <button
                  type="button"
                  onClick={handleCancelNotesRule}
                  className="rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyNotesRule}
                  disabled={notesRulePrompt.selectedIndices.length === 0}
                  className="btn-primary rounded-full px-4 py-2 text-sm font-semibold transition btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {categoryRulePrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="flex w-full max-w-2xl max-h-[500px] flex-col overflow-hidden vale-modal rounded-2xl shadow-xl">
            <div className="border-b border-[rgba(255,255,255,0.08)] px-6 py-5">
              <h3 className="text-lg font-bold text-[#63B3ED]">
                Terapkan Kategori ke Transaksi Serupa?
              </h3>
              <p className="mt-1 text-sm text-[#8B92A5]">
                Pilih transaksi yang mau dikategorikan sebagai &apos;
                {categoryRulePrompt.newCategory}&apos;
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-[#20242E]">
                <input
                  type="checkbox"
                  checked={
                    categoryRulePrompt.selectedIndices.length ===
                      categoryRulePrompt.matchingIndices.length &&
                    categoryRulePrompt.matchingIndices.length > 0
                  }
                  onChange={(event) => handleToggleSelectAll(event.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#63B3ED]"
                />
                <span className="text-sm font-semibold text-[#ECEEF2]">Pilih Semua</span>
              </label>

              <div className="mt-1 divide-y divide-[rgba(255,255,255,0.04)]">
                {categoryRulePrompt.matchingIndices.map((transactionIndex) => {
                  const transaction = transactions[transactionIndex];
                  const debit = parseAmount(transaction?.debit);
                  const kredit = parseAmount(transaction?.kredit);
                  const isSelected = categoryRulePrompt.selectedIndices.includes(
                    transactionIndex,
                  );

                  return (
                    <label
                      key={transactionIndex}
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-[#20242E]"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          handleToggleTransactionSelection(
                            transactionIndex,
                            event.target.checked,
                          )
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#63B3ED]"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <span className="shrink-0 text-[#8B92A5]">
                            {transaction?.tanggal || "-"}
                          </span>
                          <span className="min-w-0 flex-1 text-[#ECEEF2]">
                            {transaction?.deskripsi || "-"}
                          </span>
                          <span className="shrink-0 font-medium">
                            {debit > 0 ? (
                              <span className="text-[#FC8181]">{formatRupiah(debit)}</span>
                            ) : kredit > 0 ? (
                              <span className="text-[#68D391]">{formatRupiah(kredit)}</span>
                            ) : (
                              <span className="text-[#8B92A5]">-</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[rgba(255,255,255,0.08)] px-6 py-4">
              <span className="text-sm text-[#8B92A5]">
                [{categoryRulePrompt.selectedIndices.length}] transaksi dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyThisTransactionOnly}
                  className="rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Transaksi Ini Saja
                </button>
                <button
                  type="button"
                  onClick={handleCancelCategoryRule}
                  className="rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyCategoryRule}
                  disabled={categoryRulePrompt.selectedIndices.length === 0}
                  className="btn-primary rounded-full px-4 py-2 text-sm font-semibold transition btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 vale-toast rounded-lg px-5 py-3 text-sm font-semibold">
          {toastMessage}
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen ? (
          <div className="flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-[#20242E] px-4 py-3">
              <div>
                <p className="font-semibold text-[#ECEEF2]">💰 Financial Advisor</p>
                <p className="text-xs text-[#8B92A5]">
                  {userMessageCount}/{MAX_CHAT_MESSAGES}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] text-lg text-[#8B92A5] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#ECEEF2]"
                aria-label="Tutup chat"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[#1A1D25] p-4">
              {chatMessages.map((msg, index) => (
                <div
                  key={`chat-${index}`}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#63B3ED] text-[#111318] font-medium"
                        : "bg-[#20242E] text-[#ECEEF2]"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[#20242E] px-3 py-2 text-sm text-[#8B92A5]">
                    Sedang mengetik...
                  </div>
                </div>
              ) : null}
              {isChatLimitReached ? (
                <div className="rounded-xl border border-[rgba(246,173,85,0.3)] bg-[rgba(246,173,85,0.05)] px-3 py-2 text-sm text-[#F6AD55]">
                  {CHAT_LIMIT_MESSAGE}
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-[rgba(255,255,255,0.08)] bg-[#1A1D25] p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSendChat();
                  }}
                  disabled={isChatLoading || isChatLimitReached}
                  placeholder={
                    isChatLimitReached ? "Batas chat tercapai" : "Tanya tentang keuanganmu..."
                  }
                  className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm outline-none focus:border-[#63B3ED] disabled:bg-[#20242E]"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  disabled={isChatLoading || isChatLimitReached || !chatInput.trim()}
                  className="btn-primary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed"
                >
                  Kirim
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => (isChatOpen ? setIsChatOpen(false) : openChat())}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#63B3ED] text-2xl text-[#111318] shadow-[0_4px_12px_rgba(99,179,237,0.2)] transition hover:bg-[#90CDF4]"
          aria-label="Buka chat financial advisor"
        >
          💬
        </button>
      </div>
        </div>
      )}
    </div>
  );
}
