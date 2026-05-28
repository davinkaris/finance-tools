"use client";

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
import { normalizeTransactions } from "../../lib/transactions";
import { getAccounts } from "../../lib/accounts";
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

  if (amount === 0) {
    return { text: "-", className: "whitespace-nowrap text-slate-700" };
  }

  const formatted = new Intl.NumberFormat("id-ID").format(amount);
  const prefix = kredit > 0 ? "+" : "-";

  return {
    text: `${prefix}Rp ${formatted}`,
    className: `whitespace-nowrap font-semibold ${
      kredit > 0 ? "text-green-600" : "text-red-500"
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

const StackedBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const validPayload = payload.filter((item) => Number(item.value) > 0);
  if (validPayload.length === 0) return null;

  const total = validPayload.reduce((sum, item) => sum + Number(item.value), 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-lg">
      <p className="mb-2 font-semibold text-slate-800">{label}</p>
      <div className="space-y-1">
        {validPayload.map((item) => {
          const amount = Number(item.value);
          const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : "0.0";
          return (
            <p key={item.dataKey} className="text-slate-700">
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
      <h3 className="text-base font-bold text-[#1B4332]">{title}</h3>
      {hasData ? (
        <div className="mt-3 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxisRupiah}
                tick={{ fontSize: 12, fill: "#64748b" }}
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
                          ? "#1B4332"
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
        <p className="mt-3 text-sm text-slate-500">Belum ada data untuk ditampilkan.</p>
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
        className="w-full min-w-[160px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm italic text-slate-700 outline-none focus:border-[#1B4332] focus:ring-1 focus:ring-[#1B4332]"
      />
    );
  }

  return (
    <div className="flex min-w-[120px] items-center gap-1.5">
      {note ? (
        <span
          title={note}
          className="max-w-[180px] truncate text-sm italic text-slate-600"
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

export default function DashboardPage() {
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedBulan, setSelectedBulan] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
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
  const [showAssignAccountModal, setShowAssignAccountModal] = useState(false);
  const [assignAccountId, setAssignAccountId] = useState("");
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [editingNoteIndex, setEditingNoteIndex] = useState(-1);
  const [draftNote, setDraftNote] = useState("");
  const chatEndRef = useRef(null);
  const noteInputRef = useRef(null);
  const noteEditorRef = useRef(null);

  const loadTransactionsAndInsights = () => {
    setAccounts(getAccounts());

    const raw = localStorage.getItem("parsedTransactions");
    const rawInsights = localStorage.getItem("aiInsights");

    if (!raw) {
      setTransactions([]);
    } else {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          let categoryRenamesLocal = {};
          let customCats = [];
          try {
            const rawRenames = localStorage.getItem("categoryRenames");
            if (rawRenames) categoryRenamesLocal = JSON.parse(rawRenames);
            const rawCustom = localStorage.getItem("customCategories");
            if (rawCustom) customCats = JSON.parse(rawCustom);
          } catch {
            categoryRenamesLocal = {};
            customCats = [];
          }

          const incomeNames = buildIncomeCategoryNames(
            categoryRenamesLocal,
            customCats,
          );
          const processed = processTransactions(
            parsed.map((item) => ({
              ...item,
              kategori: normalizeKategori(item?.kategori),
            })),
            incomeNames,
          );
          const withCategories = applyCategoryRules(processed);
          const withNotes = applyNotesRules(withCategories);
          const mergedNotes = syncNotesFromTransactions(withNotes);
          setTransactionNotes(mergedNotes);
          setTransactions(normalizeTransactions(withNotes));
        }
      } catch {
        setTransactions([]);
      }
    }

    try {
      const parsedInsights = rawInsights ? JSON.parse(rawInsights) : [];
      setInsights(Array.isArray(parsedInsights) ? parsedInsights : []);
    } catch {
      setInsights([]);
    }
  };

  useEffect(() => {
    try {
      const rawCustom = localStorage.getItem("customCategories");
      if (rawCustom) {
        const parsed = JSON.parse(rawCustom);
        if (Array.isArray(parsed)) setCustomCategories(parsed);
      }
      const rawRenames = localStorage.getItem("categoryRenames");
      if (rawRenames) {
        const parsed = JSON.parse(rawRenames);
        if (parsed && typeof parsed === "object") setCategoryRenames(parsed);
      }
      const rawEmojiOverrides = localStorage.getItem("categoryEmojiOverrides");
      if (rawEmojiOverrides) {
        const parsed = JSON.parse(rawEmojiOverrides);
        if (parsed && typeof parsed === "object") setCategoryEmojiOverrides(parsed);
      }
      setTransactionNotes(loadTransactionNotes());
      setAccounts(getAccounts());
    } catch {
      setCustomCategories([]);
      setCategoryRenames({});
      setCategoryEmojiOverrides({});
    }
  }, []);

  useEffect(() => {
    loadTransactionsAndInsights();
  }, []);

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

  const handleSaveEditCategory = () => {
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
    localStorage.setItem("parsedTransactions", JSON.stringify(updatedTransactions));

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
      localStorage.setItem("customCategories", JSON.stringify(updatedCustom));
    } else {
      const defaultOrigin =
        resolveDefaultOrigin(oldName) ||
        (CATEGORY_OPTIONS.includes(oldName) ? oldName : oldName);

      if (newName !== defaultOrigin) {
        const updatedRenames = { ...categoryRenames, [defaultOrigin]: newName };
        setCategoryRenames(updatedRenames);
        localStorage.setItem("categoryRenames", JSON.stringify(updatedRenames));
      }

      const updatedEmojiOverrides = {
        ...categoryEmojiOverrides,
        [newName]: editSelectedEmoji,
      };
      if (newName !== oldName) delete updatedEmojiOverrides[oldName];
      setCategoryEmojiOverrides(updatedEmojiOverrides);
      localStorage.setItem(
        "categoryEmojiOverrides",
        JSON.stringify(updatedEmojiOverrides),
      );
    }

    if (activeCategory === oldName) setActiveCategory(newName);
    closeEditCategoryModal();
  };

  const handleCreateCategory = () => {
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
    localStorage.setItem("customCategories", JSON.stringify(updated));
    setShowCategoryModal(false);
    setNewCategoryName("");
    setSelectedEmoji("");
    setNewCategoryType("expense");
  };

  const handleDeleteCustomCategory = (name) => {
    const inUse = transactions.some(
      (t) => normalizeKategori(t.kategori) === name,
    );
    if (inUse) {
      alert("Kategori masih digunakan oleh transaksi.");
      return;
    }

    const updated = customCategories.filter((cat) => cat.name !== name);
    setCustomCategories(updated);
    localStorage.setItem("customCategories", JSON.stringify(updated));
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

  const handleAssignLegacyTransactions = () => {
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

    setTransactions(updated);
    localStorage.setItem("parsedTransactions", JSON.stringify(updated));
    setShowAssignAccountModal(false);
    showToast(`✅ ${count} transaksi berhasil di-assign ke akun`);
  };

  const handleAddAccountModalComplete = (account) => {
    setShowAddAccountModal(false);
    loadTransactionsAndInsights();
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

  const applyCategoryToIndices = (indices, category) => {
    const indexSet = new Set(indices);
    setTransactions((prev) => {
      const updated = prev.map((item, idx) =>
        indexSet.has(idx)
          ? { ...item, kategori: normalizeKategori(category) }
          : item,
      );
      localStorage.setItem("parsedTransactions", JSON.stringify(updated));
      return updated;
    });
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

  const handleApplyCategoryRule = () => {
    if (!categoryRulePrompt) return;
    const { selectedIndices, newCategory, keyword } = categoryRulePrompt;
    if (selectedIndices.length === 0) return;
    applyCategoryToIndices(selectedIndices, newCategory);
    saveCategoryRule(
      keyword,
      newCategory,
      getNoteForTransaction(transactions[categoryRulePrompt.index]),
    );
    showToast(`✅ ${selectedIndices.length} transaksi berhasil dikategorisasi`);
    setCategoryRulePrompt(null);
  };

  const handleApplyThisTransactionOnly = () => {
    if (!categoryRulePrompt) return;
    const { index, newCategory, keyword } = categoryRulePrompt;
    applyCategoryToIndices([index], newCategory);
    saveCategoryRule(
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

  const persistNotesToIndices = (indices, noteText) => {
    const trimmed = String(noteText || "").trim();
    setTransactions((prev) => {
      const indexSet = new Set(indices);
      let notes = loadTransactionNotes();
      const updated = prev.map((item, idx) => {
        if (!indexSet.has(idx)) return item;
        const key = getTransactionNoteKey(item);
        notes = saveTransactionNote(key, trimmed);
        return { ...item, notes: trimmed || undefined };
      });
      localStorage.setItem("parsedTransactions", JSON.stringify(updated));
      setTransactionNotes({ ...notes });
      return updated;
    });
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

  const handleApplyNotesRule = () => {
    if (!notesRulePrompt) return;
    const { selectedIndices, newNotes, keyword } = notesRulePrompt;
    if (selectedIndices.length === 0) return;
    persistNotesToIndices(selectedIndices, newNotes);
    saveNotesRule(keyword, newNotes);
    showToast(`✅ Notes diterapkan ke ${selectedIndices.length} transaksi`);
    setNotesRulePrompt(null);
  };

  const handleApplyThisNoteOnly = () => {
    if (!notesRulePrompt) return;
    const { index, newNotes, keyword } = notesRulePrompt;
    persistNotesToIndices([index], newNotes);
    saveNotesRule(keyword, newNotes);
    setNotesRulePrompt(null);
  };

  const handleCancelNotesRule = () => {
    setNotesRulePrompt(null);
  };

  const openCategoryRulesModal = () => {
    setSavedCategoryRules(loadCategoryRules());
    setSavedNotesRules(loadNotesRules());
    setRulesSettingsTab("category");
    setShowCategoryRulesModal(true);
  };

  const handleDeleteCategoryRule = (keyword) => {
    deleteCategoryRule(keyword);
    setSavedCategoryRules(loadCategoryRules());
    showToast("Aturan kategori dihapus");
  };

  const handleDeleteNotesRule = (keyword) => {
    deleteNotesRule(keyword);
    setSavedNotesRules(loadNotesRules());
    showToast("Aturan notes dihapus");
  };

  const renderCategoryCards = (items, emptyMessage) => {
    if (items.length === 0) {
      return (
        <div className="rounded-2xl border border-slate-200 p-4 text-slate-500">
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
              ? "border-[#1B4332] bg-[#1B4332] text-white"
              : "border-[#1B4332]/20 bg-[#1B4332]/5 text-slate-900"
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
                ? "bg-white/20 hover:bg-white/30"
                : "bg-slate-200 hover:bg-slate-300"
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
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
              }`}
              aria-label={`Hapus kategori ${item.kategori}`}
            >
              ×
            </span>
          ) : null}
          <p
            className={`text-sm font-medium ${
              activeCategory === item.kategori ? "text-white/90" : "text-slate-600"
            }`}
          >
            {emojiMap[item.kategori] || "📦"} {item.kategori}
          </p>
          <p
            className={`mt-1 text-xl font-bold ${
              activeCategory === item.kategori ? "text-white" : "text-[#1B4332]"
            }`}
          >
            {formatRupiah(item.totalDebit)}
          </p>
          <p
            className={`mt-1 text-sm ${
              activeCategory === item.kategori ? "text-white/90" : "text-slate-600"
            }`}
          >
            {item.count} transaksi
          </p>
        </button>
      );
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1B4332] md:text-4xl">
          Dashboard Transaksi
          {selectedAccount ? (
            <span className="font-extrabold text-[#1B4332]">
              {" "}
              — {selectedAccount.nama}
            </span>
          ) : null}
        </h1>

        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedAccountId("")}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-semibold transition ${
              !selectedAccountId
                ? "border-transparent bg-[#1B4332] text-white"
                : "border-slate-300 text-slate-500 hover:border-slate-400"
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
                  isActive
                    ? "border-transparent text-white"
                    : "border-slate-300 text-slate-500 hover:border-slate-400"
                }`}
                style={
                  isActive
                    ? { backgroundColor: account.warna || "#1B4332" }
                    : undefined
                }
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: account.warna || "#1B4332" }}
                  aria-hidden="true"
                />
                {account.nama}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowAddAccountModal(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 text-lg font-semibold text-slate-600 transition hover:border-[#1B4332] hover:text-[#1B4332]"
            aria-label="Tambah akun dan upload statement"
          >
            +
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-[#1B4332]">Filter Bulan:</p>
          <select
            value={selectedBulan}
            onChange={(event) => setSelectedBulan(event.target.value)}
            className="rounded-full border border-[#1B4332] bg-white px-4 py-2 text-sm font-semibold text-[#1B4332] outline-none transition hover:bg-[#1B4332] hover:text-white focus:bg-white focus:text-[#1B4332]"
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
          <section className="mt-8 rounded-2xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5">
            <h2 className="text-xl font-bold text-[#1B4332]">✨ AI Insight</h2>
            <p className="mt-1 text-sm text-slate-600">
              Analisa personal berdasarkan pola spending kamu
            </p>
            <ul className="mt-4 space-y-3">
              {insights.map((insight, index) => (
                <li
                  key={`insight-${index}`}
                  className="rounded-xl border border-[#1B4332]/15 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  <span className="mr-2 font-bold text-[#1B4332]">{index + 1}.</span>
                  {insight}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5">
          <h2 className="text-xl font-bold text-[#1B4332]">
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
              className="rounded-full border border-[#1B4332] px-4 py-2 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332] hover:text-white"
            >
              + Tambah Kategori
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeCategory === "all"
                  ? "bg-[#1B4332] text-white"
                  : "border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white"
              }`}
            >
              Semua Transaksi
            </button>
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold text-[#1B4332]">💰 Pemasukan</h2>
              <p className="text-xl font-bold text-[#1B4332]">
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

          <div className="mt-10 border-t border-slate-200 pt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold text-[#1B4332]">💸 Pengeluaran</h2>
              <p className="text-xl font-bold text-[#1B4332]">
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

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          {legacyTransactionCount > 0 ? (
            <div className="flex justify-end border-b border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={openAssignAccountModal}
                className="rounded-full border border-[#1B4332] px-4 py-2 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332]/5"
              >
                ⚙️ Assign Akun ke Transaksi Lama
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-[#1B4332] text-left text-sm font-semibold text-white">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Akun</th>
                  <th className="px-4 py-3">Deskripsi</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
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

                    return (
                    <tr
                      key={`${transaction?.tanggal || "trx"}-${originalIndex}-${index}`}
                      className="group transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-slate-700">
                        {transaction?.tanggal || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {account ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                            style={{ backgroundColor: account.warna || "#1B4332" }}
                          >
                            {getAccountShortLabel(account)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transaction?.deskripsi || "-"}
                      </td>
                      <td className={`px-4 py-3 ${amountDisplay.className}`}>
                        {amountDisplay.text}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <select
                          value={normalizeKategori(transaction?.kategori)}
                          onChange={(event) =>
                            handleCategoryChange(
                              originalIndex,
                              event.target.value,
                              transaction?.kategori,
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-[#1B4332]"
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
                      </td>
                      <td
                        ref={isEditingNote ? noteEditorRef : null}
                        className="px-4 py-3 text-slate-700"
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
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
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
      </main>

      <AddAccountUploadModal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onComplete={handleAddAccountModalComplete}
      />

      {showAssignAccountModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#1B4332]">Assign Akun</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {legacyTransactionCount} transaksi belum punya akun. Assign ke akun
              mana?
            </p>

            {accounts.length > 0 ? (
              <>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Pilih Akun
                  <select
                    value={assignAccountId}
                    onChange={(event) => setAssignAccountId(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1B4332]"
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
                    className="flex-1 rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAssignAccountModal(false)}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-600">
                  Belum ada akun. Tambah akun dulu di halaman Akun.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAssignAccountModal(false)}
                  className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#1B4332]">Buat Kategori Baru</h3>
            <p className="mt-1 text-sm text-slate-600">
              Tambahkan kategori custom untuk transaksi kamu
            </p>

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Nama Kategori
              <input
                type="text"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Contoh: Pendidikan Anak"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1B4332]"
              />
            </label>

            <p className="mt-5 text-sm font-semibold text-slate-700">Jenis Kategori:</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setNewCategoryType("income")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  newCategoryType === "income"
                    ? "bg-[#1B4332] text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                💰 Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setNewCategoryType("expense")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  newCategoryType === "expense"
                    ? "bg-[#1B4332] text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                💸 Pengeluaran
              </button>
            </div>

            <p className="mt-5 text-sm font-semibold text-slate-700">Pilih Emoji</p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`rounded-xl border p-2 text-xl transition ${
                    selectedEmoji === emoji
                      ? "border-[#1B4332] bg-[#1B4332]/10"
                      : "border-slate-200 hover:border-[#1B4332]/40"
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
                className="flex-1 rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
              >
                Buat Kategori
              </button>
              <button
                type="button"
                onClick={closeCategoryModal}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#1B4332]">Edit Kategori</h3>
            <p className="mt-1 text-sm text-slate-600">
              Ubah nama dan emoji kategori
            </p>

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Nama Kategori
              <input
                type="text"
                value={editCategoryName}
                onChange={(event) => setEditCategoryName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1B4332]"
              />
            </label>

            <p className="mt-5 text-sm font-semibold text-slate-700">Jenis Kategori:</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setEditCategoryType("income")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  editCategoryType === "income"
                    ? "bg-[#1B4332] text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                💰 Pemasukan
              </button>
              <button
                type="button"
                onClick={() => setEditCategoryType("expense")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  editCategoryType === "expense"
                    ? "bg-[#1B4332] text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                💸 Pengeluaran
              </button>
            </div>

            <p className="mt-5 text-sm font-semibold text-slate-700">Pilih Emoji</p>
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={`edit-${emoji}`}
                  type="button"
                  onClick={() => setEditSelectedEmoji(emoji)}
                  className={`rounded-xl border p-2 text-xl transition ${
                    editSelectedEmoji === emoji
                      ? "border-[#1B4332] bg-[#1B4332]/10"
                      : "border-slate-200 hover:border-[#1B4332]/40"
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
                className="flex-1 rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={closeEditCategoryModal}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCategoryTypeWarning ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B4332]">
              ⚠️ Tidak Bisa Ganti Jenis Kategori
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Kategori &apos;{editingCategoryName}&apos; masih digunakan oleh{" "}
              {categoryTypeWarningTransactions.length} transaksi. Tolong pindahkan
              semua transaksi ke kategori lain sebelum mengganti jenisnya.
            </p>
            <ul className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              {categoryTypeWarningTransactions.slice(0, 5).map((transaction, index) => {
                const debit = parseAmount(transaction?.debit);
                const kredit = parseAmount(transaction?.kredit);
                return (
                  <li
                    key={`${transaction?.tanggal || "trx"}-${index}`}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="shrink-0 text-slate-500">
                      {transaction?.tanggal || "-"}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-800">
                      {transaction?.deskripsi || "-"}
                    </span>
                    <span className="shrink-0 font-medium">
                      {debit > 0 ? (
                        <span className="text-red-600">{formatRupiah(debit)}</span>
                      ) : kredit > 0 ? (
                        <span className="text-green-600">{formatRupiah(kredit)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {categoryTypeWarningTransactions.length > 5 ? (
              <p className="mt-2 text-sm text-slate-500">
                dan {categoryTypeWarningTransactions.length - 5} transaksi lainnya
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleDismissCategoryTypeWarning}
              className="mt-6 w-full rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
            >
              OK, Mengerti
            </button>
          </div>
        </div>
      ) : null}

      {showCategoryRulesModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-lg max-h-[500px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-lg font-bold text-[#1B4332]">Aturan Tersimpan</h3>
              <p className="mt-1 text-sm text-slate-600">
                Aturan ini diterapkan otomatis saat upload statement baru
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRulesSettingsTab("category")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    rulesSettingsTab === "category"
                      ? "bg-[#1B4332] text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Aturan Kategori
                </button>
                <button
                  type="button"
                  onClick={() => setRulesSettingsTab("notes")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    rulesSettingsTab === "notes"
                      ? "bg-[#1B4332] text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-50"
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
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                      >
                        <span className="min-w-0 flex-1 text-sm text-slate-800">
                          {rule.keyword} → {rule.kategori}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryRule(rule.keyword)}
                          className="shrink-0 rounded-full px-2 py-1 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Hapus aturan ${rule.keyword}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    Belum ada aturan kategori tersimpan. Aturan dibuat otomatis saat
                    kamu menerapkan kategori ke transaksi serupa.
                  </p>
                )
              ) : savedNotesRules.length > 0 ? (
                <ul className="space-y-2">
                  {savedNotesRules.map((rule) => (
                    <li
                      key={`${rule.keyword}-${rule.createdAt || rule.notes}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 text-sm text-slate-800">
                        {rule.keyword} → &apos;{rule.notes}&apos;
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotesRule(rule.keyword)}
                        className="shrink-0 rounded-full px-2 py-1 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Hapus aturan notes ${rule.keyword}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  Belum ada aturan notes tersimpan. Aturan dibuat otomatis saat kamu
                  menerapkan notes ke transaksi serupa.
                </p>
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowCategoryRulesModal(false)}
                className="w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notesRulePrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-2xl max-h-[500px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-lg font-bold text-[#1B4332]">
                Terapkan Notes ke Transaksi Serupa?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Pilih transaksi yang mau diberi catatan &apos;{notesRulePrompt.newNotes}&apos;
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={
                    notesRulePrompt.selectedIndices.length ===
                      notesRulePrompt.matchingIndices.length &&
                    notesRulePrompt.matchingIndices.length > 0
                  }
                  onChange={(event) => handleToggleNoteSelectAll(event.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#1B4332]"
                />
                <span className="text-sm font-semibold text-slate-800">Pilih Semua</span>
              </label>

              <div className="mt-1 divide-y divide-slate-100">
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
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-100"
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
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#1B4332]"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <span className="shrink-0 text-slate-500">
                            {transaction?.tanggal || "-"}
                          </span>
                          <span className="min-w-0 flex-1 text-slate-800">
                            {transaction?.deskripsi || "-"}
                          </span>
                          <span className="shrink-0 font-medium">
                            {debit > 0 ? (
                              <span className="text-red-600">{formatRupiah(debit)}</span>
                            ) : kredit > 0 ? (
                              <span className="text-green-600">{formatRupiah(kredit)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
              <span className="text-sm text-slate-600">
                [{notesRulePrompt.selectedIndices.length}] transaksi dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyThisNoteOnly}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Transaksi Ini Saja
                </button>
                <button
                  type="button"
                  onClick={handleCancelNotesRule}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyNotesRule}
                  disabled={notesRulePrompt.selectedIndices.length === 0}
                  className="rounded-full bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163728] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {categoryRulePrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-2xl max-h-[500px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-lg font-bold text-[#1B4332]">
                Terapkan Kategori ke Transaksi Serupa?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Pilih transaksi yang mau dikategorikan sebagai &apos;
                {categoryRulePrompt.newCategory}&apos;
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={
                    categoryRulePrompt.selectedIndices.length ===
                      categoryRulePrompt.matchingIndices.length &&
                    categoryRulePrompt.matchingIndices.length > 0
                  }
                  onChange={(event) => handleToggleSelectAll(event.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#1B4332]"
                />
                <span className="text-sm font-semibold text-slate-800">Pilih Semua</span>
              </label>

              <div className="mt-1 divide-y divide-slate-100">
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
                      className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-100"
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
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#1B4332]"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <span className="shrink-0 text-slate-500">
                            {transaction?.tanggal || "-"}
                          </span>
                          <span className="min-w-0 flex-1 text-slate-800">
                            {transaction?.deskripsi || "-"}
                          </span>
                          <span className="shrink-0 font-medium">
                            {debit > 0 ? (
                              <span className="text-red-600">{formatRupiah(debit)}</span>
                            ) : kredit > 0 ? (
                              <span className="text-green-600">{formatRupiah(kredit)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
              <span className="text-sm text-slate-600">
                [{categoryRulePrompt.selectedIndices.length}] transaksi dipilih
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyThisTransactionOnly}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Transaksi Ini Saja
                </button>
                <button
                  type="button"
                  onClick={handleCancelCategoryRule}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplyCategoryRule}
                  disabled={categoryRulePrompt.selectedIndices.length === 0}
                  className="rounded-full bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163728] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen ? (
          <div className="flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#1B4332] px-4 py-3 text-white">
              <div>
                <p className="font-semibold">💰 Financial Advisor</p>
                <p className="text-xs text-white/80">
                  {userMessageCount}/{MAX_CHAT_MESSAGES}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg hover:bg-white/30"
                aria-label="Tutup chat"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {chatMessages.map((msg, index) => (
                <div
                  key={`chat-${index}`}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#1B4332] text-white"
                        : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-slate-200 px-3 py-2 text-sm text-slate-600">
                    Sedang mengetik...
                  </div>
                </div>
              ) : null}
              {isChatLimitReached ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {CHAT_LIMIT_MESSAGE}
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white p-3">
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
                  className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-[#1B4332] disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  disabled={isChatLoading || isChatLimitReached || !chatInput.trim()}
                  className="rounded-full bg-[#1B4332] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163728] disabled:cursor-not-allowed disabled:bg-slate-300"
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
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1B4332] text-2xl text-white shadow-lg transition hover:bg-[#163728]"
          aria-label="Buka chat financial advisor"
        >
          💬
        </button>
      </div>
    </div>
  );
}
