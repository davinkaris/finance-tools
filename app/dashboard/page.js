"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

const INCOME_CATEGORIES = new Set(["Gaji & Pemasukan", "Investasi"]);

const categoryColors = {
  Transfer: "#6366f1",
  "Makanan & Minuman": "#f97316",
  Transport: "#3b82f6",
  Shopping: "#ec4899",
  "Tagihan & Utilitas": "#eab308",
  Hiburan: "#8b5cf6",
  Kesehatan: "#10b981",
  Lainnya: "#94a3b8",
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

export default function DashboardPage() {
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedBulan, setSelectedBulan] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("parsedTransactions");
    const rawInsights = localStorage.getItem("aiInsights");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setTransactions(
          parsed.map((item) => ({
            ...item,
            kategori: normalizeKategori(item?.kategori),
          })),
        );
      }
    } catch {
      setTransactions([]);
    }

    try {
      const parsedInsights = rawInsights ? JSON.parse(rawInsights) : [];
      setInsights(Array.isArray(parsedInsights) ? parsedInsights : []);
    } catch {
      setInsights([]);
    }
  }, []);

  const availableBulan = useMemo(() => {
    const bulanSet = new Set(
      transactions
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
  }, [transactions]);

  const monthFilteredTransactions = useMemo(() => {
    return transactions
      .map((transaction, originalIndex) => ({ transaction, originalIndex }))
      .filter(
        ({ transaction }) => filterByBulan([transaction], selectedBulan).length > 0,
      );
  }, [transactions, selectedBulan]);

  const totals = useMemo(() => {
    return monthFilteredTransactions.reduce(
      (acc, item) => {
        acc.debit += parseAmount(item.transaction?.debit);
        acc.kredit += parseAmount(item.transaction?.kredit);
        return acc;
      },
      { debit: 0, kredit: 0 },
    );
  }, [monthFilteredTransactions]);

  const categorySummary = useMemo(() => {
    const grouped = monthFilteredTransactions.reduce((acc, item) => {
      const kategori = normalizeKategori(item.transaction?.kategori);
      const debit = parseAmount(item.transaction?.debit);
      const kredit = parseAmount(item.transaction?.kredit);
      const totalAmount = INCOME_CATEGORIES.has(kategori) ? kredit : debit;
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

  const filteredTransactions = useMemo(() => {
    return monthFilteredTransactions
      .filter(({ transaction }) =>
        activeCategory === "all"
          ? true
          : normalizeKategori(transaction?.kategori) === normalizeKategori(activeCategory),
      );
  }, [monthFilteredTransactions, activeCategory]);

  const pieChartData = useMemo(() => {
    const grouped = monthFilteredTransactions.reduce((acc, { transaction }) => {
      const kategori = normalizeKategori(transaction?.kategori);
      if (INCOME_CATEGORIES.has(kategori)) return acc;

      const debit = parseAmount(transaction?.debit);
      if (debit <= 0) return acc;

      acc[kategori] = (acc[kategori] || 0) + debit;
      return acc;
    }, {});

    const pieData = Object.entries(grouped)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        fill: categoryColors[name] || "#94a3b8",
      }))
      .sort((a, b) => b.value - a.value);

    console.log("Pie data:", pieData);
    return pieData;
  }, [monthFilteredTransactions]);

  const handleCategoryChange = (index, nextCategory) => {
    if (index < 0) return;
    setTransactions((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        kategori: normalizeKategori(nextCategory),
      };
      localStorage.setItem("parsedTransactions", JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 md:px-10">
          <div className="text-xl font-bold tracking-tight text-[#1B4332]">
            FinanceTools
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1B4332] md:text-4xl">
          Dashboard Transaksi
        </h1>

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

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5">
            <p className="text-sm font-medium text-slate-600">Total Debit</p>
            <p className="mt-1 text-2xl font-bold text-[#1B4332]">
              {formatRupiah(totals.debit)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5">
            <p className="text-sm font-medium text-slate-600">Total Kredit</p>
            <p className="mt-1 text-2xl font-bold text-[#1B4332]">
              {formatRupiah(totals.kredit)}
            </p>
          </div>
        </div>

        {insights.length > 0 ? (
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
          <h2 className="text-xl font-bold text-[#1B4332]">Breakdown Pengeluaran</h2>
          {pieChartData.length > 0 ? (
            <div className="mt-4 h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={120}
                    innerRadius={40}
                    label={({ name, percent }) => {
                      if (percent < 0.03) return "";
                      return `${(percent * 100).toFixed(1)}%`;
                    }}
                    labelLine={true}
                  >
                    {pieChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `Rp ${new Intl.NumberFormat("id-ID").format(value)}`,
                      name,
                    ]}
                  />
                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Belum ada data pengeluaran untuk ditampilkan.
            </p>
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#1B4332]">Spending per Kategori</h2>
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categorySummary.length > 0 ? (
              categorySummary.map((item) => (
                <button
                  key={item.kategori}
                  type="button"
                  onClick={() => setActiveCategory(item.kategori)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    activeCategory === item.kategori
                      ? "border-[#1B4332] bg-[#1B4332] text-white"
                      : "border-[#1B4332]/20 bg-[#1B4332]/5 text-slate-900"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      activeCategory === item.kategori ? "text-white/90" : "text-slate-600"
                    }`}
                  >
                    {categoryEmoji[item.kategori] || "📦"} {item.kategori}
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
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 p-4 text-slate-500">
                Belum ada data kategori untuk ditampilkan.
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-[#1B4332] text-left text-sm font-semibold text-white">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Deskripsi</th>
                  <th className="px-4 py-3">Debit</th>
                  <th className="px-4 py-3">Kredit</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Kategori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map(({ transaction, originalIndex }, index) => (
                    <tr key={`${transaction?.tanggal || "trx"}-${originalIndex}-${index}`}>
                      <td className="px-4 py-3 text-slate-700">
                        {transaction?.tanggal || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transaction?.deskripsi || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatRupiah(parseAmount(transaction?.debit))}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatRupiah(parseAmount(transaction?.kredit))}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatRupiah(parseAmount(transaction?.saldo))}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <select
                          value={normalizeKategori(transaction?.kategori)}
                          onChange={(event) =>
                            handleCategoryChange(originalIndex, event.target.value)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-[#1B4332]"
                        >
                          {CATEGORY_OPTIONS.map((category) => {
                            const normalizedCategory = normalizeKategori(category);
                            return (
                              <option key={normalizedCategory} value={normalizedCategory}>
                                {normalizedCategory}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  ))
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
    </div>
  );
}
