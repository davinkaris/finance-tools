"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
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
  PieChart,
  Pie,
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
  updateTransaction,
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

const GLASS_CARD_CLASS = "glass-card rounded-2xl";

const GLASS_TOOLTIP_STYLE = {
  background: "rgba(17, 19, 24, 0.95)",
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 12,
  color: "#ECEEF2",
  boxShadow:
    "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
};

const METRIC_CARD_CLASS = "glass-card rounded-2xl p-6";

const hexToRgba = (hex, alpha) => {
  if (!hex || !hex.startsWith("#")) return `rgba(148, 163, 184, ${alpha})`;
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getTransactionRowKey = (transaction, index) =>
  transaction?.id || `${transaction?.tanggal || "trx"}-${index}`;

const parseTransactionDate = (tanggal) => {
  const [day, month, year] = String(tanggal || "").split("/");
  if (!day || !month || !year) return null;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const getPreviousMonthKey = (monthKey) => {
  if (!monthKey) return null;
  const [month, year] = monthKey.split("/").map(Number);
  if (!month || !year) return null;
  const date = new Date(year, month - 2, 1);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
};

const sortCategorySummaryItems = (items, sortMode) => {
  const withTransactions = items.filter((item) => item.count > 0);
  const withoutTransactions = items.filter((item) => item.count === 0);

  const compareName = (a, b) =>
    a.kategori.localeCompare(b.kategori, "id", { sensitivity: "base" });

  if (sortMode === "az") {
    return [...items].sort((a, b) => {
      if (a.count === 0 && b.count > 0) return 1;
      if (a.count > 0 && b.count === 0) return -1;
      return compareName(a, b);
    });
  }

  const compareAmount =
    sortMode === "smallest"
      ? (a, b) => a.totalDebit - b.totalDebit
      : (a, b) => b.totalDebit - a.totalDebit;

  return [
    ...withTransactions.sort(compareAmount),
    ...withoutTransactions.sort(compareName),
  ];
};

const formatTrendPercent = (value) => {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
};

const DEFAULT_ACCOUNT_COLOR = "#63B3ED";

const PILL_ACTIVE_CLASS =
  "border border-[rgba(99,179,237,0.4)] bg-[rgba(99,179,237,0.15)] text-[#63B3ED]";

const PILL_INACTIVE_CLASS =
  "border border-transparent bg-[rgba(255,255,255,0.04)] text-[#8B92A5] hover:text-[#ECEEF2]";

const ACTION_CARD_ITEM_CLASS =
  "flex flex-1 flex-col items-center rounded-xl border border-transparent px-5 py-3 text-center transition hover:border-[rgba(99,179,237,0.2)] hover:bg-[rgba(99,179,237,0.08)]";

const TABLE_HEADER_CLASS =
  "bg-[rgba(255,255,255,0.02)] text-left text-sm text-[#8B92A5]";

const TABLE_ROW_CLASS =
  "transition-colors hover:bg-[rgba(255,255,255,0.03)]";

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
    <div className={`glass-card rounded-xl px-3 py-2.5 text-sm shadow-lg text-[#ECEEF2]`}>
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

function MetricCard({ icon, title, value, subtitle, trendLabel, trendPositive, iconBg }) {
  return (
    <div className={METRIC_CARD_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        {trendLabel ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              trendPositive
                ? "bg-[rgba(104,211,145,0.15)] text-[#68D391]"
                : "bg-[rgba(252,129,129,0.15)] text-[#FC8181]"
            }`}
          >
            {trendLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm font-medium text-[#8B92A5]">{title}</p>
      <p className="mt-1 text-2xl font-bold text-[#ECEEF2]">{value}</p>
      {subtitle ? (
        <p className="mt-1 text-xs text-[#8B92A5]">{subtitle}</p>
      ) : null}
    </div>
  );
}

const DonutSpendingChart = ({ data, getColor, emojiMap }) => {
  const chartData = data.filter((item) => item.totalDebit > 0);
  const total = chartData.reduce((sum, item) => sum + item.totalDebit, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-[#8B92A5]">
        Belum ada data pengeluaran untuk ditampilkan.
      </p>
    );
  }

  return (
    <>
      <div className="mx-auto h-[220px] w-full max-w-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="totalDebit"
              nameKey="kategori"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.kategori} fill={getColor(entry.kategori)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`Rp ${formatChartRupiah(value)}`, ""]}
              contentStyle={GLASS_TOOLTIP_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2.5">
        {chartData.map((item) => (
          <div
            key={item.kategori}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-[#8B92A5]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: getColor(item.kategori) }}
              />
              <span className="truncate">
                {emojiMap[item.kategori] || "📦"} {item.kategori}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-[#ECEEF2]">
              Rp {formatRupiah(item.totalDebit)}
            </span>
          </div>
        ))}
      </div>
    </>
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

function CategoryInlineEditor({
  transaction,
  categoryOptions,
  emojiMap,
  getCategoryColor,
  isOpen,
  onToggle,
  onClose,
  onSelectCategory,
  onCreateCategory,
  feedbackState,
  isMoveMoney,
  onClearMoveMoney,
}) {
  const dropdownRef = useRef(null);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const kategori = normalizeKategori(transaction?.kategori);
  const color = getCategoryColor(kategori);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setIsCreating(false);
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions.filter((category) => {
      const normalized = normalizeKategori(category);
      const emoji = emojiMap[normalized] || "📦";
      return (
        normalized.toLowerCase().includes(query) ||
        emoji.includes(query)
      );
    });
  }, [categoryOptions, emojiMap, search]);

  const showCreateOption =
    search.trim().length > 0 &&
    !categoryOptions.some(
      (category) =>
        normalizeKategori(category).toLowerCase() === search.trim().toLowerCase(),
    );

  const handleCreate = async () => {
    const name = search.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateCategory(name);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  if (isMoveMoney) {
    return (
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
          onClick={onClearMoveMoney}
          className="text-[11px] font-medium text-[#8B92A5] underline-offset-2 transition hover:text-[#ECEEF2] hover:underline"
        >
          Bukan move money?
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-flex max-w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
          feedbackState === "flash" ? "category-badge-flash" : ""
        }`}
        style={{
          backgroundColor: hexToRgba(color, 0.1),
          borderColor: hexToRgba(color, 0.3),
          color: "#ECEEF2",
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">{emojiMap[kategori] || "📦"}</span>
        <span className="max-w-[140px] truncate">{kategori}</span>
        {feedbackState === "check" ? (
          <span
            className="category-check-pop ml-0.5 text-[10px] text-[#68D391]"
            aria-hidden="true"
          >
            ✓
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="category-dropdown-enter glass-panel absolute left-0 top-full z-50 mt-1.5 min-w-[240px] overflow-hidden rounded-xl shadow-xl">
          <div className="border-b border-[rgba(255,255,255,0.06)] p-2">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kategori..."
              className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-3 py-1.5 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {filteredOptions.map((category) => {
              const normalizedCategory = normalizeKategori(category);
              const isSelected = normalizedCategory === kategori;
              return (
                <li key={normalizedCategory}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onSelectCategory(normalizedCategory)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-[#ECEEF2] transition hover:bg-[rgba(99,179,237,0.08)]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true">
                        {emojiMap[normalizedCategory] || "📦"}
                      </span>
                      <span className="truncate">{normalizedCategory}</span>
                    </span>
                    {isSelected ? (
                      <span className="shrink-0 text-[#68D391]" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {showCreateOption ? (
            <div className="border-t border-[rgba(255,255,255,0.06)] p-2">
              <p className="px-1 text-xs text-[#8B92A5]">Buat kategori baru:</p>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-2 py-1.5 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={isCreating || !search.trim()}
                  className="shrink-0 rounded-lg bg-[#63B3ED] px-3 py-1.5 text-xs font-semibold text-[#111318] transition hover:bg-[#90CDF4] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Buat
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DrawerTransactionNotesBar({
  note,
  isEditing,
  draftNote,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  inputRef,
  showSaveFlash = false,
}) {
  const hasNote = Boolean(note?.trim());

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
        className="note-input-enter w-full cursor-text rounded-lg border border-[#63B3ED] bg-[#1A1D25] px-3 py-1.5 text-xs text-[#ECEEF2] outline-none shadow-[0_0_0_3px_rgba(99,179,237,0.1)]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className={`flex w-full cursor-text items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition ${
        showSaveFlash ? "note-save-flash" : ""
      } ${
        hasNote
          ? "border border-[rgba(99,179,237,0.15)] bg-[rgba(99,179,237,0.06)] text-[#8B92A5]"
          : "border border-dashed border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#555D6E]"
      }`}
    >
      {hasNote ? (
        <>
          <span className="min-w-0 flex-1 truncate">{note}</span>
          <span className="shrink-0 text-[10px]" aria-hidden="true">
            ✏️
          </span>
        </>
      ) : (
        <span>✏️ Tambah catatan...</span>
      )}
    </button>
  );
}

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
  showSaveFlash = false,
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
        className="note-input-enter w-full min-w-[160px] rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-2 py-1 text-sm italic text-[#8B92A5] outline-none focus:border-[#63B3ED] focus:ring-1 focus:ring-[#63B3ED]"
      />
    );
  }

  return (
    <div
      className={`group/note flex min-w-[120px] items-center gap-1.5 rounded-lg px-1 py-0.5 ${
        showSaveFlash ? "note-save-flash" : ""
      }`}
    >
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
        className={`shrink-0 rounded p-0.5 text-xs text-[#8B92A5] transition-all duration-200 hover:text-[#63B3ED] ${
          note
            ? "opacity-0 group-hover/note:opacity-100"
            : "opacity-40 group-hover/note:opacity-100"
        }`}
        aria-label={note ? "Edit catatan" : "Tambah catatan"}
      >
        ✏️
      </button>
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <main className="flex-1 overflow-y-auto bg-transparent p-6 lg:p-8">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[rgba(255,255,255,0.04)]" />
      <div className="mt-6 flex gap-2">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-9 w-24 animate-pulse rounded-full bg-[rgba(255,255,255,0.04)]"
          />
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl bg-[rgba(255,255,255,0.04)]"
          />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="h-80 animate-pulse rounded-2xl bg-[rgba(255,255,255,0.04)] lg:col-span-3" />
        <div className="h-80 animate-pulse rounded-2xl bg-[rgba(255,255,255,0.04)] lg:col-span-2" />
      </div>
      <div className="mt-8 space-y-3">
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="h-14 animate-pulse rounded-xl bg-[rgba(255,255,255,0.04)]"
          />
        ))}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [categoryDrawerCategory, setCategoryDrawerCategory] = useState(null);
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
  const [isRefreshingInsights, setIsRefreshingInsights] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [permanentlyDismissed, setPermanentlyDismissed] = useState([]);
  const [confirmDismissBank, setConfirmDismissBank] = useState(null);
  const [expandedSuggestions, setExpandedSuggestions] = useState(() => new Set());
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [addCategoryInlineSection, setAddCategoryInlineSection] = useState(null);
  const [incomeCategorySort, setIncomeCategorySort] = useState("largest");
  const [expenseCategorySort, setExpenseCategorySort] = useState("largest");
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);
  const [removingCategory, setRemovingCategory] = useState(null);
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
  const [categoryRuleToast, setCategoryRuleToast] = useState(null);
  const [openCategoryDropdownKey, setOpenCategoryDropdownKey] = useState(null);
  const [categoryFeedback, setCategoryFeedback] = useState({});
  const [noteFeedback, setNoteFeedback] = useState({});
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
  const actionCardRef = useRef(null);
  const categoryRuleToastTimerRef = useRef(null);

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
    const uploadHistoryList = safeArray(uploadHistoryListRaw);
    const categoryRules = safeArray(categoryRulesRaw);
    const notesRules = safeArray(notesRulesRaw);

    setAccounts(accountList);
    setUploadHistory(uploadHistoryList);
    setSavedCategoryRules(categoryRules);
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

    const rawTransactions = safeArray(rawTransactionsRaw);
    if (rawTransactions.length === 0 && insightsData.length > 0) {
      await saveUserPreferences({ aiInsights: [] });
      insightsData = [];
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
        actionCardRef.current &&
        !actionCardRef.current.contains(event.target)
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
    const expenseOrder = EXPENSE_CATEGORY_ORDER.map(
      (cat) => categoryRenames[cat] || cat,
    );
    const map = new Map(
      displayCategorySummary
        .filter((item) => !incomeCategoryNames.has(item.kategori))
        .map((item) => [item.kategori, item]),
    );
    expenseOrder.forEach((name) => {
      if (!map.has(name)) {
        map.set(name, { kategori: name, totalDebit: 0, count: 0 });
      }
    });
    customCategories.forEach((cat) => {
      if (cat.type === "expense" && !map.has(cat.name)) {
        map.set(cat.name, { kategori: cat.name, totalDebit: 0, count: 0 });
      }
    });
    return Array.from(map.values());
  }, [
    displayCategorySummary,
    categoryRenames,
    incomeCategoryNames,
    customCategories,
  ]);

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

  const computeCategoryTotalsForMonth = (monthKey) => {
    const totals = {};

    transactions
      .map((transaction, originalIndex) => ({ transaction, originalIndex }))
      .filter(({ transaction }) =>
        transactionMatchesAccountFilter(transaction, selectedAccountId, accounts),
      )
      .filter(({ transaction }) => {
        if (!monthKey) return true;
        return filterByBulan([transaction], monthKey).length > 0;
      })
      .forEach(({ transaction }) => {
        if (shouldExcludeFromSpending(transaction)) return;

        const kategori = normalizeKategori(transaction?.kategori);
        const debit = parseAmount(transaction?.debit);
        const kredit = parseAmount(transaction?.kredit);
        const jenis =
          transaction?.jenis || inferJenisFromAmounts(debit, kredit);
        const amount = jenis === "income" ? kredit : debit;

        if (!totals[kategori]) {
          totals[kategori] = { total: 0, count: 0 };
        }
        totals[kategori].total += amount;
        totals[kategori].count += 1;
      });

    return totals;
  };

  const enrichCategorySummaryList = (items, isIncome, poolTotal) => {
    const trendMonthKey = selectedBulan || getCurrentMonthKey();
    const previousMonthKey = getPreviousMonthKey(trendMonthKey);
    const previousTotals = previousMonthKey
      ? computeCategoryTotalsForMonth(previousMonthKey)
      : {};

    return items.map((item) => {
      const poolTotalValue = poolTotal;
      const sharePercent =
        poolTotalValue > 0 ? (item.totalDebit / poolTotalValue) * 100 : 0;
      const prevTotal = previousTotals[item.kategori]?.total || 0;
      let trend = 0;
      if (prevTotal === 0) {
        trend = item.totalDebit > 0 ? 100 : 0;
      } else {
        trend = ((item.totalDebit - prevTotal) / prevTotal) * 100;
      }

      const normalized = normalizeKategori(item.kategori);
      const color = colorMap[normalized] || (isIncome ? "#68D391" : "#94a3b8");

      return {
        ...item,
        isIncome,
        sharePercent,
        trend,
        color,
        isCustom: customCategoryNames.has(item.kategori),
      };
    });
  };

  const incomeCategorySummaryEnriched = useMemo(
    () => enrichCategorySummaryList(displayIncomeCategorySummary, true, totalPemasukan),
    [
      displayIncomeCategorySummary,
      totalPemasukan,
      colorMap,
      customCategoryNames,
      transactions,
      selectedAccountId,
      accounts,
      selectedBulan,
    ],
  );

  const expenseCategorySummaryEnriched = useMemo(
    () =>
      enrichCategorySummaryList(
        displayExpenseCategorySummary,
        false,
        totalPengeluaran,
      ),
    [
      displayExpenseCategorySummary,
      totalPengeluaran,
      colorMap,
      customCategoryNames,
      transactions,
      selectedAccountId,
      accounts,
      selectedBulan,
    ],
  );

  const categorySummaryEnriched = useMemo(
    () => [...incomeCategorySummaryEnriched, ...expenseCategorySummaryEnriched],
    [incomeCategorySummaryEnriched, expenseCategorySummaryEnriched],
  );

  const drawerCategoryTransactions = useMemo(() => {
    if (!categoryDrawerCategory) return [];

    return monthFilteredTransactions
      .filter(
        ({ transaction }) =>
          normalizeKategori(transaction?.kategori) ===
            normalizeKategori(categoryDrawerCategory) &&
          !shouldExcludeFromSpending(transaction),
      )
      .sort((a, b) => {
        const dateA = parseTransactionDate(a.transaction?.tanggal);
        const dateB = parseTransactionDate(b.transaction?.tanggal);
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
      });
  }, [categoryDrawerCategory, monthFilteredTransactions]);

  const drawerCategoryRules = useMemo(() => {
    if (!categoryDrawerCategory) return [];
    return savedCategoryRules.filter(
      (rule) =>
        normalizeKategori(rule.kategori) ===
        normalizeKategori(categoryDrawerCategory),
    );
  }, [savedCategoryRules, categoryDrawerCategory]);

  const drawerCategorySummary = useMemo(() => {
    if (!categoryDrawerCategory) return null;
    return categorySummaryEnriched.find(
      (item) =>
        normalizeKategori(item.kategori) ===
        normalizeKategori(categoryDrawerCategory),
    );
  }, [categorySummaryEnriched, categoryDrawerCategory]);

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

  const computeTotalsForMonth = (monthKey) => {
    if (!monthKey) return { pemasukan: 0, pengeluaran: 0 };

    let pemasukan = 0;
    let pengeluaran = 0;

    transactions.forEach((transaction) => {
      if (!transactionMatchesAccountFilter(transaction, selectedAccountId, accounts)) {
        return;
      }
      if (filterByBulan([transaction], monthKey).length === 0) return;
      if (shouldExcludeFromSpending(transaction)) return;

      const kategori = normalizeKategori(transaction?.kategori);
      const debit = parseAmount(transaction?.debit);
      const kredit = parseAmount(transaction?.kredit);

      if (incomeCategoryNames.has(kategori)) {
        pemasukan += kredit;
      } else {
        pengeluaran += debit;
      }
    });

    return { pemasukan, pengeluaran };
  };

  const metricTrends = useMemo(() => {
    const currentMonthKey =
      selectedBulan || availableBulan[availableBulan.length - 1] || null;
    const previousMonthKey = getPreviousMonthKey(currentMonthKey);

    if (!currentMonthKey || !previousMonthKey) {
      return { incomeTrend: null, expenseTrend: null };
    }

    const current = computeTotalsForMonth(currentMonthKey);
    const previous = computeTotalsForMonth(previousMonthKey);

    const percentChange = (currentValue, previousValue) => {
      if (previousValue === 0) {
        if (currentValue === 0) return 0;
        return 100;
      }
      return ((currentValue - previousValue) / previousValue) * 100;
    };

    return {
      incomeTrend: percentChange(current.pemasukan, previous.pemasukan),
      expenseTrend: percentChange(current.pengeluaran, previous.pengeluaran),
    };
  }, [
    transactions,
    selectedAccountId,
    accounts,
    selectedBulan,
    availableBulan,
    incomeCategoryNames,
  ]);

  const savingRate = useMemo(() => {
    if (totalPemasukan <= 0) return 0;
    return Math.round(
      ((totalPemasukan - totalPengeluaran) / totalPemasukan) * 100,
    );
  }, [totalPemasukan, totalPengeluaran]);

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

    if (categoryDrawerCategory === oldName) setCategoryDrawerCategory(newName);
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
    setAddCategoryInlineSection(null);
    setNewCategoryName("");
    setSelectedEmoji("");
    setNewCategoryType("expense");
    showToast(`✅ Kategori ${name} berhasil ditambahkan`);
  };

  const handleDeleteCustomCategory = async (name) => {
    const lainnya = normalizeKategori("Lainnya");
    const indicesToUpdate = transactions
      .map((transaction, index) => ({ transaction, index }))
      .filter(
        ({ transaction }) => normalizeKategori(transaction?.kategori) === name,
      )
      .map(({ index }) => index);

    if (indicesToUpdate.length > 0) {
      const updates = indicesToUpdate.map((index) => ({
        index,
        patch: { kategori: lainnya },
      }));
      const saved = await persistTransactionsBatch(updates);
      if (!saved) return;
    }

    const updated = customCategories.filter((cat) => cat.name !== name);
    setCustomCategories(updated);
    await saveUserPreferences({ customCategories: updated });
    if (categoryDrawerCategory === name) setCategoryDrawerCategory(null);
    showToast(`✅ Kategori dihapus, transaksi dipindah ke ${lainnya}`);
  };

  const handleConfirmDeleteCategory = async (name) => {
    setDeleteCategoryConfirm(null);
    setRemovingCategory(name);
    window.setTimeout(async () => {
      await handleDeleteCustomCategory(name);
      setRemovingCategory(null);
    }, 300);
  };

  const openInlineAddCategory = (section) => {
    setNewCategoryType(section);
    setNewCategoryName("");
    setSelectedEmoji("");
    setAddCategoryInlineSection(section);
  };

  const closeInlineAddCategory = () => {
    setAddCategoryInlineSection(null);
    setNewCategoryName("");
    setSelectedEmoji("");
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setAddCategoryInlineSection(null);
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

  const handleRefreshInsights = async () => {
    if (isRefreshingInsights || transactions.length === 0) return;

    setIsRefreshingInsights(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showToast("Sesi login tidak valid. Silakan login ulang.");
        return;
      }

      const response = await fetch("/api/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: session.access_token }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        showToast(errorResult?.error || "Gagal memperbarui AI Insight.");
        return;
      }

      const result = await response.json();
      const newInsights = safeArray(result.insights);
      setInsights(newInsights);

      if (newInsights.length > 0) {
        showToast("✨ AI Insight diperbarui");
      } else {
        showToast("AI Insight belum tersedia untuk data ini.");
      }
    } catch {
      showToast("Gagal memperbarui AI Insight.");
    } finally {
      setIsRefreshingInsights(false);
    }
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
                        <div className="glass-panel mt-1 w-full rounded-xl px-4 py-3">
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

  const getCategoryColor = (categoryName) => {
    const normalized = normalizeKategori(categoryName);
    if (colorMap[normalized]) return colorMap[normalized];
    if (normalized === "Gaji & Pemasukan") return "#68D391";
    if (normalized === "Investasi") return "#10b981";
    return "#94a3b8";
  };

  const triggerCategorySaveFeedback = (rowKey) => {
    setCategoryFeedback((prev) => ({ ...prev, [rowKey]: "flash" }));
    window.setTimeout(() => {
      setCategoryFeedback((prev) => ({ ...prev, [rowKey]: "check" }));
      window.setTimeout(() => {
        setCategoryFeedback((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });
      }, 800);
    }, 400);
  };

  const dismissCategoryRuleToast = () => {
    if (categoryRuleToastTimerRef.current) {
      window.clearTimeout(categoryRuleToastTimerRef.current);
      categoryRuleToastTimerRef.current = null;
    }
    setCategoryRuleToast(null);
  };

  const showCategoryRuleToast = (payload) => {
    dismissCategoryRuleToast();
    setCategoryRuleToast(payload);
    categoryRuleToastTimerRef.current = window.setTimeout(() => {
      setCategoryRuleToast(null);
      categoryRuleToastTimerRef.current = null;
    }, 5000);
  };

  useEffect(
    () => () => {
      if (categoryRuleToastTimerRef.current) {
        window.clearTimeout(categoryRuleToastTimerRef.current);
      }
    },
    [],
  );

  const persistTransactionField = async (index, patch, previousSnapshot) => {
    const transaction = transactions[index];
    if (!transaction) return false;

    if (!transaction.id) {
      const updated = transactions.map((item, idx) =>
        idx === index ? { ...item, ...patch } : item,
      );
      setTransactions(updated);
      const saved = await saveTransactions(updated);
      if (!saved) {
        setTransactions((prev) =>
          prev.map((item, idx) => (idx === index ? previousSnapshot : item)),
        );
        showToast("Gagal menyimpan. Perubahan dibatalkan.");
        return false;
      }
      return true;
    }

    const result = await updateTransaction(transaction.id, patch);
    if (!result) {
      setTransactions((prev) =>
        prev.map((item, idx) => (idx === index ? previousSnapshot : item)),
      );
      showToast("Gagal menyimpan. Perubahan dibatalkan.");
      return false;
    }

    setTransactions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...result } : item)),
    );
    return true;
  };

  const persistTransactionsBatch = async (updates) => {
    const snapshots = updates.map(({ index }) => ({
      index,
      snapshot: { ...transactions[index] },
    }));

    setTransactions((prev) =>
      prev.map((item, idx) => {
        const update = updates.find((entry) => entry.index === idx);
        return update ? { ...item, ...update.patch } : item;
      }),
    );

    const results = await Promise.all(
      updates.map(async ({ index, patch }) => {
        const transaction = transactions[index];
        if (!transaction?.id) return { index, ok: false };
        const result = await updateTransaction(transaction.id, patch);
        return { index, ok: Boolean(result), result };
      }),
    );

    const failed = results.filter((entry) => !entry.ok);
    if (failed.length > 0) {
      setTransactions((prev) =>
        prev.map((item, idx) => {
          const snapshot = snapshots.find((entry) => entry.index === idx);
          return snapshot ? snapshot.snapshot : item;
        }),
      );
      showToast("Gagal menyimpan beberapa transaksi. Perubahan dibatalkan.");
      return false;
    }

    setTransactions((prev) =>
      prev.map((item, idx) => {
        const saved = results.find((entry) => entry.index === idx && entry.result);
        return saved ? { ...item, ...saved.result } : item;
      }),
    );
    return true;
  };

  const handleCreateCategoryInline = async (name, jenis) => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    if (
      allCategoryOptions.some(
        (category) => category.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      showToast("Kategori sudah ada.");
      return trimmed;
    }

    const usedColors = [
      ...Object.values(DEFAULT_CATEGORY_COLORS),
      ...customCategories.map((cat) => cat.color),
    ];
    const newCategory = {
      name: trimmed,
      emoji: "📦",
      color: pickRandomColor(usedColors),
      type: jenis === "income" ? "income" : "expense",
    };
    const updated = [...customCategories, newCategory];
    setCustomCategories(updated);
    await saveUserPreferences({ customCategories: updated });
    return trimmed;
  };

  const handleCategorySelect = async (index, nextCategory) => {
    if (index < 0) return;

    const transaction = transactions[index];
    const normalizedNext = normalizeKategori(nextCategory);
    const normalizedPrev = normalizeKategori(transaction?.kategori);
    if (normalizedNext === normalizedPrev) {
      setOpenCategoryDropdownKey(null);
      return;
    }

    const previousSnapshot = { ...transaction };
    const rowKey = getTransactionRowKey(transaction, index);
    const sourceJenis = transaction?.jenis;
    const otherMatches = getMatchingIndices(transactions, index).filter(
      (matchIndex) =>
        matchIndex !== index &&
        normalizeKategori(transactions[matchIndex]?.kategori) === normalizedPrev &&
        transactions[matchIndex]?.jenis === sourceJenis,
    );

    setOpenCategoryDropdownKey(null);
    setTransactions((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, kategori: normalizedNext } : item,
      ),
    );
    triggerCategorySaveFeedback(rowKey);

    const saved = await persistTransactionField(
      index,
      { kategori: normalizedNext },
      previousSnapshot,
    );
    if (!saved) return;

    if (otherMatches.length > 0) {
      showCategoryRuleToast({
        rowKey,
        transactionIndex: index,
        keyword: extractKeyword(transaction?.deskripsi),
        newCategory: normalizedNext,
        matchingIndices: otherMatches,
      });
    }
  };

  const handleSkipCategoryRuleToast = () => {
    dismissCategoryRuleToast();
  };

  const handleApplyCategoryRuleToast = async () => {
    if (!categoryRuleToast) return;

    const { matchingIndices, newCategory, keyword, transactionIndex } =
      categoryRuleToast;
    dismissCategoryRuleToast();

    const updates = matchingIndices.map((index) => ({
      index,
      patch: { kategori: newCategory },
    }));

    const saved = await persistTransactionsBatch(updates);
    if (!saved) return;

    await saveCategoryRule(
      keyword,
      newCategory,
      getNoteForTransaction(transactions[transactionIndex]),
    );
    showToast(`✅ ${matchingIndices.length} transaksi diupdate`);
  };

  const handleClearMoveMoneyMatch = async (originalIndex) => {
    const target = transactions[originalIndex];
    if (!target?.id || target.matchType !== "move_money") return;

    const updated = removeMoveMoneyMatch(transactions, target.id);
    await persistAllTransactions(updated);
  };

  const getNoteForTransaction = (transaction) => {
    const key = getTransactionNoteKey(transaction);
    return transactionNotes[key] || transaction?.notes || "";
  };

  const hasNoteForTransaction = (transaction) =>
    Boolean(getNoteForTransaction(transaction).trim());

  const triggerNoteSaveFeedback = (rowKey) => {
    setNoteFeedback((prev) => ({ ...prev, [rowKey]: true }));
    window.setTimeout(() => {
      setNoteFeedback((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    }, 500);
  };

  const persistSingleNoteUpdate = async (index, noteText) => {
    const trimmed = String(noteText || "").trim();
    const transaction = transactions[index];
    if (!transaction) return false;

    const previousSnapshot = { ...transaction };
    const previousNotesState = { ...transactionNotes };
    const key = getTransactionNoteKey(transaction);
    const previousNoteValue = getNoteForTransaction(transaction);

    const notes = saveTransactionNote(key, trimmed);
    setTransactionNotes({ ...notes });
    setTransactions((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, notes: trimmed || undefined } : item,
      ),
    );

    const saved = await persistTransactionField(
      index,
      { notes: trimmed || null },
      previousSnapshot,
    );

    if (!saved) {
      saveTransactionNote(key, previousNoteValue);
      setTransactionNotes(previousNotesState);
      return false;
    }

    triggerNoteSaveFeedback(getTransactionRowKey(transaction, index));
    return true;
  };

  const persistNotesToIndices = async (indices, noteText) => {
    const trimmed = String(noteText || "").trim();
    const updates = indices.map((index) => ({
      index,
      patch: { notes: trimmed || null },
    }));

    const snapshots = indices.map((index) => ({
      index,
      key: getTransactionNoteKey(transactions[index]),
      previousNote: getNoteForTransaction(transactions[index]),
      snapshot: { ...transactions[index] },
    }));

    let notes = loadTransactionNotes();
    snapshots.forEach(({ key }) => {
      notes = saveTransactionNote(key, trimmed);
    });
    setTransactionNotes({ ...notes });

    const saved = await persistTransactionsBatch(updates);
    if (!saved) {
      snapshots.forEach(({ key, previousNote }) => {
        saveTransactionNote(key, previousNote);
      });
      setTransactionNotes({ ...transactionNotes });
    }
  };

  const handleStartNoteEdit = (transaction, originalIndex) => {
    const key = getTransactionNoteKey(transaction);
    setEditingNoteKey(key);
    setEditingNoteIndex(originalIndex);
    setDraftNote(getNoteForTransaction(transaction));
  };

  const handleSaveNoteEdit = async () => {
    if (editingNoteKey === null || editingNoteIndex < 0) return;

    const trimmed = draftNote.trim();
    const index = editingNoteIndex;
    const transaction = transactions[index];

    setEditingNoteKey(null);
    setEditingNoteIndex(-1);
    setDraftNote("");

    if (!trimmed) {
      await persistSingleNoteUpdate(index, "");
      return;
    }

    const matchingIndices = getMatchingIndices(transactions, index).filter((i) => {
      if (i === index) return true;
      return !hasNoteForTransaction(transactions[i]);
    });
    const otherMatches = matchingIndices.filter((i) => i !== index);

    if (otherMatches.length === 0) {
      await persistSingleNoteUpdate(index, trimmed);
      return;
    }

    await persistSingleNoteUpdate(index, trimmed);

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

  const renderCategoryRuleToast = (rowKey, compact = false) => {
    if (categoryRuleToast?.rowKey !== rowKey) return null;

    return (
      <div className="glass-panel mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5">
        <p className="text-xs text-[#ECEEF2] sm:text-sm">
          {compact ? (
            <>
              Terapkan ke semua &apos;{categoryRuleToast.keyword}&apos;?
            </>
          ) : (
            <>
              Terapkan &apos;{categoryRuleToast.newCategory}&apos; ke semua
              transaksi &apos;{categoryRuleToast.keyword}&apos; lainnya?
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleApplyCategoryRuleToast()}
            className="rounded-full bg-[#63B3ED] px-3 py-1 text-xs font-semibold text-[#111318] transition hover:bg-[#90CDF4]"
          >
            Ya
          </button>
          <button
            type="button"
            onClick={handleSkipCategoryRuleToast}
            className="rounded-full border border-[rgba(255,255,255,0.08)] px-3 py-1 text-xs font-semibold text-[#8B92A5] transition hover:bg-[rgba(255,255,255,0.04)]"
          >
            Skip
          </button>
        </div>
      </div>
    );
  };

  const renderDrawerTransactionList = () =>
    drawerCategoryTransactions.map(({ transaction, originalIndex }, index) => {
      const rowKey = getTransactionRowKey(transaction, originalIndex);
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
      const categoryOptions =
        transaction?.jenis === "income"
          ? incomeCategoryOptions
          : expenseCategoryOptions;
      const accountColor = account?.warna || DEFAULT_ACCOUNT_COLOR;

      return (
        <div
          key={`drawer-${rowKey}-${index}`}
          className="border-b border-[rgba(255,255,255,0.06)] py-4 last:border-b-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[#8B92A5]">
                {transaction?.tanggal || "-"}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#ECEEF2]">
                {transaction?.deskripsi || "-"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {account ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: hexToRgba(accountColor, 0.12),
                      border: `1px solid ${hexToRgba(accountColor, 0.3)}`,
                      color: accountColor,
                    }}
                  >
                    {getAccountShortLabel(account)}
                  </span>
                ) : null}
                <CategoryInlineEditor
                  transaction={transaction}
                  categoryOptions={categoryOptions}
                  emojiMap={emojiMap}
                  getCategoryColor={getCategoryColor}
                  isOpen={openCategoryDropdownKey === rowKey}
                  onToggle={() =>
                    setOpenCategoryDropdownKey((prev) =>
                      prev === rowKey ? null : rowKey,
                    )
                  }
                  onClose={() => setOpenCategoryDropdownKey(null)}
                  onSelectCategory={(category) =>
                    void handleCategorySelect(originalIndex, category)
                  }
                  onCreateCategory={async (name) => {
                    const created = await handleCreateCategoryInline(
                      name,
                      transaction?.jenis,
                    );
                    if (created) {
                      await handleCategorySelect(originalIndex, created);
                    }
                  }}
                  feedbackState={categoryFeedback[rowKey]}
                  isMoveMoney={isMoveMoney}
                  onClearMoveMoney={() =>
                    void handleClearMoveMoneyMatch(originalIndex)
                  }
                />
              </div>
            </div>
            <span className={`shrink-0 text-sm ${amountDisplay.className}`}>
              {amountDisplay.text}
            </span>
          </div>
          <div
            ref={isEditingNote ? noteEditorRef : null}
            className="mt-3 w-full"
          >
            <DrawerTransactionNotesBar
              note={savedNote}
              isEditing={isEditingNote}
              draftNote={draftNote}
              onDraftChange={setDraftNote}
              onStartEdit={() =>
                handleStartNoteEdit(transaction, originalIndex)
              }
              onSave={() => void handleSaveNoteEdit()}
              onCancel={handleCancelNoteEdit}
              inputRef={noteInputRef}
              showSaveFlash={Boolean(noteFeedback[rowKey])}
            />
          </div>
          {renderCategoryRuleToast(rowKey, true)}
        </div>
      );
    });

  const renderCategorySortSelect = (value, onChange) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-3 py-1.5 text-xs font-semibold text-[#8B92A5] outline-none transition focus:border-[#63B3ED]"
      aria-label="Urutkan kategori"
    >
      <option value="largest">Urutkan: Terbesar ↓</option>
      <option value="smallest">Urutkan: Terkecil ↑</option>
      <option value="az">Urutkan: A-Z</option>
    </select>
  );

  const renderAddCategoryCard = (section) => (
    <button
      type="button"
      onClick={() => openInlineAddCategory(section)}
      className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(255,255,255,0.15)] bg-transparent p-5 text-center transition hover:border-[#63B3ED] hover:bg-[rgba(99,179,237,0.04)]"
    >
      <span className="text-3xl font-light text-[#63B3ED]" aria-hidden="true">
        +
      </span>
      <span className="mt-2 text-sm font-semibold text-[#8B92A5]">
        Tambah Kategori
      </span>
    </button>
  );

  const renderInlineAddCategoryModal = () => {
    if (!addCategoryInlineSection) return null;

    const isIncome = addCategoryInlineSection === "income";

    return (
      <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 px-4">
        <div className="vale-modal w-full max-w-md rounded-2xl p-6 shadow-xl">
          <h3 className="text-xl font-bold text-[#63B3ED]">Tambah Kategori</h3>
          <p className="mt-1 text-sm text-[#8B92A5]">
            Kategori {isIncome ? "pemasukan" : "pengeluaran"} baru
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

          <p className="mt-5 text-sm font-semibold text-[#8B92A5]">Jenis Kategori</p>
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
              💰 Income
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
              💸 Expense
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
              onClick={() => void handleCreateCategory()}
              className="btn-primary flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition"
            >
              Simpan
            </button>
            <button
              type="button"
              onClick={closeInlineAddCategory}
              className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCategorySummaryCard = (item) => {
    const borderColor = item.isIncome ? "#68D391" : item.color;
    const trendPositive = item.trend >= 0;
    const isEmpty = item.count === 0;
    const isRemoving = removingCategory === item.kategori;
    const isConfirmingDelete = deleteCategoryConfirm === item.kategori;

    return (
      <article
        key={item.kategori}
        role="button"
        tabIndex={isConfirmingDelete ? -1 : 0}
        onClick={() => {
          if (isConfirmingDelete || isRemoving) return;
          setCategoryDrawerCategory(item.kategori);
        }}
        onKeyDown={(event) => {
          if (isConfirmingDelete || isRemoving) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setCategoryDrawerCategory(item.kategori);
          }
        }}
        className={`category-summary-card glass-card relative rounded-2xl p-5 ${
          isEmpty ? "category-summary-card--empty" : ""
        } ${isRemoving ? "category-card-exit" : ""}`}
        style={{ borderLeft: `3px solid ${borderColor}` }}
      >
        {item.isCustom ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setDeleteCategoryConfirm(item.kategori);
            }}
            className="absolute right-3 top-3 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] text-xs text-[#8B92A5] opacity-0 transition hover:bg-[rgba(252,129,129,0.15)] hover:text-[#FC8181] group-hover/card:opacity-100 focus:opacity-100"
            aria-label={`Hapus kategori ${item.kategori}`}
          >
            ×
          </button>
        ) : null}

        {isConfirmingDelete ? (
          <div
            className="absolute inset-0 z-10 flex flex-col justify-center rounded-2xl bg-[rgba(13,17,23,0.95)] p-4 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <p className="text-sm text-[#ECEEF2]">
              Hapus kategori ini? Transaksi yang ada akan dipindah ke
              &apos;Lainnya&apos;
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleConfirmDeleteCategory(item.kategori);
                }}
                className="rounded-full bg-[#FC8181] px-3 py-1.5 text-xs font-semibold text-[#111318] transition hover:bg-[#FEB2B2]"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteCategoryConfirm(null);
                }}
                className="rounded-full border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs font-semibold text-[#8B92A5] transition hover:bg-[rgba(255,255,255,0.04)]"
              >
                Batal
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-sm font-semibold text-[#ECEEF2]">
          {emojiMap[item.kategori] || "📦"} {item.kategori}
        </p>
        <p className="mt-3 text-2xl font-bold text-[#ECEEF2]">
          {item.totalDebit > 0 ? `Rp ${formatRupiah(item.totalDebit)}` : "-"}
        </p>
        <p className="mt-1 text-sm text-[#8B92A5]">{item.count} transaksi</p>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(item.sharePercent, 100)}%`,
                backgroundColor: borderColor,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-[#8B92A5]">
            {item.sharePercent.toFixed(1)}% dari total{" "}
            {item.isIncome ? "pemasukan" : "pengeluaran"}
          </p>
        </div>
        <p
          className={`mt-2 text-xs font-semibold ${
            trendPositive ? "text-[#68D391]" : "text-[#FC8181]"
          }`}
        >
          {formatTrendPercent(item.trend)} vs bulan lalu
        </p>
        <span
          className="category-summary-card-hint pointer-events-none absolute bottom-4 right-4 text-sm font-semibold text-[#63B3ED]"
          aria-hidden="true"
        >
          →
        </span>
      </article>
    );
  };

  const renderCategorySummarySection = (
    sectionKey,
    title,
    totalAmount,
    totalColor,
    items,
    sortMode,
    onSortChange,
  ) => {
    const sortedItems = sortCategorySummaryItems(items, sortMode);

    return (
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-[#ECEEF2]">{title}</h3>
            <p className="mt-1 text-2xl font-bold" style={{ color: totalColor }}>
              {totalAmount > 0 ? `Rp ${formatRupiah(totalAmount)}` : "-"}
            </p>
          </div>
          {renderCategorySortSelect(sortMode, onSortChange)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedItems.map((item) => (
            <div key={item.kategori} className="group/card">
              {renderCategorySummaryCard(item)}
            </div>
          ))}
          {renderAddCategoryCard(sectionKey)}
        </div>
      </section>
    );
  };

  const renderCategorySummarySections = () => (
    <>
      {renderCategorySummarySection(
        "income",
        "💰 Pemasukan",
        totalPemasukan,
        "#68D391",
        incomeCategorySummaryEnriched,
        incomeCategorySort,
        setIncomeCategorySort,
      )}

      <div className="my-8 border-t border-[rgba(255,255,255,0.08)]" />

      {renderCategorySummarySection(
        "expense",
        "💸 Pengeluaran",
        totalPengeluaran,
        "#FC8181",
        expenseCategorySummaryEnriched,
        expenseCategorySort,
        setExpenseCategorySort,
      )}

      {renderInlineAddCategoryModal()}
    </>
  );

  const renderCategoryDrawer = () => {
    if (!categoryDrawerCategory) return null;

    const summary =
      drawerCategorySummary ||
      categorySummaryEnriched.find(
        (item) =>
          normalizeKategori(item.kategori) ===
          normalizeKategori(categoryDrawerCategory),
      );
    const isIncome = incomeCategoryNames.has(
      normalizeKategori(categoryDrawerCategory),
    );
    const accentColor = summary?.color || (isIncome ? "#68D391" : "#63B3ED");

    return (
      <>
        <button
          type="button"
          aria-label="Tutup panel kategori"
          onClick={() => setCategoryDrawerCategory(null)}
          className="fixed inset-0 z-[55] bg-black/40"
        />
        <aside
          className="category-drawer-panel fixed inset-y-0 right-0 z-[60] flex w-full max-w-[480px] flex-col border-l border-[rgba(255,255,255,0.1)] bg-[#0D1117] shadow-[-8px_0_32px_rgba(0,0,0,0.5)]"
          aria-label={`Detail kategori ${categoryDrawerCategory}`}
        >
          <div className="border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#ECEEF2]">
                  {emojiMap[categoryDrawerCategory] || "📦"}{" "}
                  {categoryDrawerCategory}
                </h3>
                <p className="mt-1 text-xl font-bold text-[#63B3ED]">
                  {summary?.totalDebit > 0
                    ? `Rp ${formatRupiah(summary.totalDebit)}`
                    : "-"}
                </p>
                <p className="mt-0.5 text-sm text-[#8B92A5]">
                  {summary?.count || drawerCategoryTransactions.length} transaksi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCategoryDrawerCategory(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] text-lg text-[#8B92A5] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[#ECEEF2]"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div
              className="mt-3 h-1 rounded-full"
              style={{ backgroundColor: hexToRgba(accentColor, 0.35) }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
            {drawerCategoryTransactions.length > 0 ? (
              renderDrawerTransactionList()
            ) : (
              <p className="py-8 text-center text-sm text-[#8B92A5]">
                Tidak ada transaksi dalam kategori ini untuk periode yang dipilih.
              </p>
            )}
          </div>

          <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4">
            <p className="text-sm font-semibold text-[#ECEEF2]">
              Aturan Otomatis untuk kategori ini:
            </p>
            {drawerCategoryRules.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {drawerCategoryRules.map((rule) => (
                  <li
                    key={rule.id || rule.keyword}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#ECEEF2]">
                        &quot;{rule.keyword}&quot;
                      </p>
                      <p className="text-xs text-[#8B92A5]">
                        → {rule.kategori}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategoryRule(rule.keyword)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-[#8B92A5] transition hover:bg-[rgba(252,129,129,0.12)] hover:text-[#FC8181]"
                      aria-label={`Hapus aturan ${rule.keyword}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#8B92A5]">
                Belum ada aturan otomatis untuk kategori ini.
              </p>
            )}
          </div>
        </aside>
      </>
    );
  };

  const renderAccountFilterPills = () => (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => setSelectedAccountId("")}
        className="inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-semibold transition"
        style={
          !selectedAccountId
            ? {
                backgroundColor: DEFAULT_ACCOUNT_COLOR,
                borderColor: DEFAULT_ACCOUNT_COLOR,
                color: "#111318",
              }
            : {
                backgroundColor: "transparent",
                borderColor: "rgba(255,255,255,0.15)",
                color: "#8B92A5",
              }
        }
      >
        Semua Akun
      </button>
      {accounts.map((account) => {
        const isActive = selectedAccountId === account.id;
        const accountColor = account.warna || DEFAULT_ACCOUNT_COLOR;
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => setSelectedAccountId(account.id)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition"
            style={
              isActive
                ? {
                    backgroundColor: accountColor,
                    borderColor: accountColor,
                    color: "#111318",
                  }
                : {
                    backgroundColor: "transparent",
                    borderColor: accountColor,
                    color: "#ECEEF2",
                  }
            }
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: isActive ? "rgba(255,255,255,0.95)" : accountColor,
              }}
              aria-hidden="true"
            />
            {account.nama}
          </button>
        );
      })}
      <button
        type="button"
        onClick={openCreateAccountModal}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-[rgba(255,255,255,0.15)] px-3 text-sm font-semibold text-[#8B92A5] transition hover:border-[#63B3ED] hover:text-[#63B3ED]"
        aria-label="Tambah akun baru"
      >
        <span className="text-base leading-none">+</span>
        Tambah
      </button>
    </div>
  );

  const renderActionCard = () => (
    <div
      ref={actionCardRef}
      className="glass-card mt-6 flex overflow-visible rounded-2xl px-6 py-4"
    >
      <div className="relative flex flex-1">
        <button
          type="button"
          onClick={handleUploadStatementAction}
          className={ACTION_CARD_ITEM_CLASS}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            📄
          </span>
          <span className="mt-2 text-sm font-bold text-[#ECEEF2]">
            Upload Statement
          </span>
          <span className="mt-1 text-xs text-[#8B92A5]">Tambah data baru</span>
        </button>
        {quickActionDropdown === "upload" ? (
          <div className="glass-panel absolute left-1/2 top-full z-30 mt-2 min-w-[220px] -translate-x-1/2 overflow-hidden rounded-xl py-1 shadow-xl">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => handleSelectUploadAccount(account.id)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#ECEEF2] transition hover:bg-[rgba(99,179,237,0.08)]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: account.warna || DEFAULT_ACCOUNT_COLOR }}
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

      <div
        className="mx-2 w-px shrink-0 self-stretch bg-[rgba(255,255,255,0.06)]"
        aria-hidden="true"
      />

      <div className="relative flex flex-1">
        <button
          type="button"
          onClick={() =>
            setQuickActionDropdown((prev) => (prev === "delete" ? null : "delete"))
          }
          className={ACTION_CARD_ITEM_CLASS}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            🗑️
          </span>
          <span className="mt-2 text-sm font-bold text-[#ECEEF2]">
            Hapus Statement
          </span>
          <span className="mt-1 text-xs text-[#8B92A5]">Kelola data</span>
        </button>
        {quickActionDropdown === "delete" ? (
          <div className="glass-panel absolute left-1/2 top-full z-30 mt-2 max-h-72 min-w-[280px] -translate-x-1/2 overflow-y-auto rounded-xl py-1 shadow-xl">
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
                    onClick={() => {
                      setQuickActionDropdown(null);
                      handleDeleteUploadClick(entry);
                    }}
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

      <div
        className="mx-2 w-px shrink-0 self-stretch bg-[rgba(255,255,255,0.06)]"
        aria-hidden="true"
      />

      <div className="relative flex flex-1">
        <button
          type="button"
          onClick={openCreateAccountModal}
          className={ACTION_CARD_ITEM_CLASS}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            🏦
          </span>
          <span className="mt-2 text-sm font-bold text-[#ECEEF2]">Tambah Akun</span>
          <span className="mt-1 text-xs text-[#8B92A5]">Bank atau kartu kredit</span>
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    if (isLoading || searchParams.get("openRules") !== "1") return;
    void openCategoryRulesModal();
    router.replace("/dashboard");
  }, [isLoading, searchParams, router]);

  return (
    <>
      {isLoading ? (
        <DashboardLoadingSkeleton />
      ) : (
        <>
          <main className="flex-1 overflow-y-auto bg-transparent p-6 lg:p-8">
              <div>
                <h1 className="font-serif-display text-2xl font-bold tracking-tight text-[#ECEEF2] md:text-3xl">
                  Dashboard Transaksi
                </h1>
                <div className="mt-3">{renderAccountFilterPills()}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-[#8B92A5]">
                    Filter Bulan:
                  </span>
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
              </div>

              {renderActionCard()}

              {showAccountEmptyState ? (
                <div>
                  {renderSmartSuggestionBanners()}
                  <section
                    className={`${METRIC_CARD_CLASS} mt-8 flex flex-col items-center justify-center px-6 py-16 text-center`}
                  >
                    <span className="text-5xl" aria-hidden="true">
                      📄
                    </span>
                    <h2 className="mt-6 text-xl font-bold text-[#ECEEF2]">
                      Belum ada statement
                    </h2>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8B92A5]">
                      Upload statement {selectedAccount?.bank || "bank"} kamu untuk
                      mulai analisa keuangan
                    </p>
                  </section>
                </div>
              ) : (
                <>
                  {renderSmartSuggestionBanners()}

                  {transactions.length > 0 && !selectedAccountId ? (
                    <section className={`${METRIC_CARD_CLASS} mt-8 overflow-hidden`}>
                      <div className="flex items-center justify-between gap-3 p-5">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <h2 className="text-xl font-bold text-[#63B3ED]">
                            ✨ AI Insight
                          </h2>
                          <button
                            type="button"
                            onClick={() => void handleRefreshInsights()}
                            disabled={isRefreshingInsights}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] text-sm text-[#8B92A5] transition hover:border-[rgba(99,179,237,0.3)] hover:text-[#63B3ED] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Refresh AI Insight"
                            title="Refresh AI Insight"
                          >
                            {isRefreshingInsights ? "…" : "🔄"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={toggleAiInsight}
                          className={`shrink-0 text-sm text-[#8B92A5] transition-transform duration-300 ${
                            aiInsightExpanded ? "rotate-180" : ""
                          }`}
                          aria-expanded={aiInsightExpanded}
                          aria-label={
                            aiInsightExpanded
                              ? "Tutup AI Insight"
                              : "Buka AI Insight"
                          }
                        >
                          ▼
                        </button>
                      </div>
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                          aiInsightExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t border-[rgba(255,255,255,0.06)] px-5 pb-5 pt-4">
                            {insights.length > 0 ? (
                              <>
                                <p className="text-sm text-[#8B92A5]">
                                  Analisa personal berdasarkan pola spending kamu
                                </p>
                                <ul className="mt-4 space-y-3">
                                  {insights.map((insight, index) => (
                                    <li
                                      key={`insight-${index}`}
                                      className={`glass-card ${INSIGHT_VARIANTS[index % INSIGHT_VARIANTS.length]} px-4 py-3 text-sm leading-relaxed text-[#8B92A5]`}
                                    >
                                      <span className="mr-2 font-bold text-[#63B3ED]">
                                        {index + 1}.
                                      </span>
                                      {insight}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="text-sm leading-relaxed text-[#8B92A5]">
                                ✨ AI Insight akan muncul setelah kamu upload bank
                                statement
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      icon="💰"
                      title="Total Pemasukan"
                      value={
                        totalPemasukan > 0
                          ? `Rp ${formatRupiah(totalPemasukan)}`
                          : "-"
                      }
                      trendLabel={
                        metricTrends.incomeTrend !== null
                          ? `${formatTrendPercent(metricTrends.incomeTrend)} vs bulan lalu`
                          : null
                      }
                      trendPositive={(metricTrends.incomeTrend ?? 0) >= 0}
                      iconBg="rgba(104,211,145,0.15)"
                    />
                    <MetricCard
                      icon="💸"
                      title="Total Pengeluaran"
                      value={
                        totalPengeluaran > 0
                          ? `Rp ${formatRupiah(totalPengeluaran)}`
                          : "-"
                      }
                      trendLabel={
                        metricTrends.expenseTrend !== null
                          ? `${formatTrendPercent(metricTrends.expenseTrend)} vs bulan lalu`
                          : null
                      }
                      trendPositive={(metricTrends.expenseTrend ?? 0) <= 0}
                      iconBg="rgba(252,129,129,0.15)"
                    />
                    <MetricCard
                      icon="↔️"
                      title="Move Money"
                      value={
                        moveMoneySummary.total > 0
                          ? `Rp ${formatRupiah(moveMoneySummary.total)}`
                          : "-"
                      }
                      subtitle={`${moveMoneySummary.count} transaksi`}
                      iconBg="rgba(139,146,165,0.15)"
                    />
                    <MetricCard
                      icon="📊"
                      title="Saving Rate"
                      value={totalPemasukan > 0 ? `${savingRate}%` : "-"}
                      subtitle="Pemasukan - Pengeluaran / Pemasukan"
                      iconBg="rgba(99,179,237,0.15)"
                    />
                  </div>

                  <div className="mt-8 grid gap-6 lg:grid-cols-5">
                    <div className={`${METRIC_CARD_CLASS} lg:col-span-3`}>
                      <h2 className="text-lg font-bold text-[#ECEEF2]">
                        Ringkasan per Bulan
                      </h2>
                      <div className="mt-6 space-y-8">
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
                    </div>
                    <div className={`${METRIC_CARD_CLASS} lg:col-span-2`}>
                      <h2 className="text-lg font-bold text-[#ECEEF2]">
                        Spending Breakdown
                      </h2>
                      <div className="mt-4">
                        <DonutSpendingChart
                          data={displayExpenseCategorySummary}
                          getColor={monthlyStackedCharts.getExpenseColor}
                          emojiMap={emojiMap}
                        />
                      </div>
                    </div>
                  </div>

                  <section className="mt-8">
                    <h2 className="text-lg font-bold text-[#ECEEF2]">
                      Ringkasan per Kategori
                    </h2>
                    <p className="mt-1 text-sm text-[#8B92A5]">
                      {selectedBulan
                        ? `Data ${formatBulanLabel(selectedBulan)}`
                        : "Semua periode — trend dibanding bulan lalu"}
                    </p>
                    <div className="mt-6">{renderCategorySummarySections()}</div>
                  </section>
                </>
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

      {renderCategoryDrawer()}

      {toastMessage ? (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 vale-toast rounded-lg px-5 py-3 text-sm font-semibold">
          {toastMessage}
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen ? (
          <div className="glass-panel flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
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
        </>
      )}
    </>
  );
}
