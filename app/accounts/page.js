"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import {
  deleteAccount,
  getAccounts,
  saveAccount,
  updateAccount,
} from "../../lib/accounts";
import {
  addUploadHistoryEntry,
  deleteUploadHistoryEntry,
  formatUploadDate,
  getUploadHistory,
  groupUnlinkedTransactionsByPeriod,
  isTransactionInUnlinkedGroup,
  removeTransactionsForUploadEntry,
  syncLegacyTransactionsAndHistory,
} from "../../lib/uploadHistory";

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
  "#1B4332",
];

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [createdAccountSuccess, setCreatedAccountSuccess] = useState(null);
  const [formNama, setFormNama] = useState("");
  const [formTipe, setFormTipe] = useState("bank");
  const [formBank, setFormBank] = useState(BANK_OPTIONS[0]);
  const [formWarna, setFormWarna] = useState("#1B4332");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [deleteUploadConfirm, setDeleteUploadConfirm] = useState(null);
  const [linkModalGroup, setLinkModalGroup] = useState(null);
  const [linkAccountId, setLinkAccountId] = useState("");
  const [deleteUnlinkedConfirm, setDeleteUnlinkedConfirm] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const bankOptions = formTipe === "cc" ? CC_OPTIONS : BANK_OPTIONS;

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const refreshData = () => {
    if (typeof window !== "undefined") {
      syncLegacyTransactionsAndHistory();
    }

    setAccounts(getAccounts());
    setUploadHistory(getUploadHistory());
    try {
      const raw = localStorage.getItem("parsedTransactions");
      const parsed = raw ? JSON.parse(raw) : [];
      setTransactions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTransactions([]);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const uploadHistoryByAccount = useMemo(() => {
    const grouped = {};
    uploadHistory.forEach((entry) => {
      if (!entry?.accountId) return;
      if (!grouped[entry.accountId]) {
        grouped[entry.accountId] = [];
      }
      grouped[entry.accountId].push(entry);
    });
    return grouped;
  }, [uploadHistory]);

  const getUploadDeleteCount = (entry) => {
    if (!entry) return 0;
    return transactions.filter((transaction) => {
      const kept = removeTransactionsForUploadEntry(entry, [transaction]);
      return kept.length === 0;
    }).length;
  };

  const handleDeleteUploadClick = (entry) => {
    const count = getUploadDeleteCount(entry);
    setDeleteUploadConfirm({ entry, count });
  };

  const handleConfirmDeleteUpload = () => {
    if (!deleteUploadConfirm) return;

    const { entry } = deleteUploadConfirm;
    const remaining = removeTransactionsForUploadEntry(entry, transactions);
    localStorage.setItem("parsedTransactions", JSON.stringify(remaining));
    deleteUploadHistoryEntry(entry.id);
    setDeleteUploadConfirm(null);
    refreshData();
  };

  const transactionCountByAccount = useMemo(() => {
    const counts = {};
    transactions.forEach((transaction) => {
      if (!transaction?.accountId) return;
      counts[transaction.accountId] = (counts[transaction.accountId] || 0) + 1;
    });
    return counts;
  }, [transactions]);

  const unlinkedGroups = useMemo(
    () => groupUnlinkedTransactionsByPeriod(transactions),
    [transactions],
  );

  const totalUnlinkedCount = useMemo(
    () => unlinkedGroups.reduce((sum, group) => sum + group.transactionCount, 0),
    [unlinkedGroups],
  );

  const openLinkModal = (group) => {
    setLinkModalGroup(group);
    setLinkAccountId(accounts[0]?.id || "");
  };

  const handleConfirmLinkUnlinked = () => {
    if (!linkModalGroup || !linkAccountId) {
      alert("Pilih akun dulu.");
      return;
    }

    const account = accounts.find((item) => item.id === linkAccountId);
    const count = linkModalGroup.transactionCount;

    const updated = transactions.map((transaction) =>
      isTransactionInUnlinkedGroup(transaction, linkModalGroup)
        ? { ...transaction, accountId: linkAccountId }
        : transaction,
    );

    const linkedTransactions = linkModalGroup.transactions.map((transaction) => ({
      ...transaction,
      accountId: linkAccountId,
    }));

    localStorage.setItem("parsedTransactions", JSON.stringify(updated));
    addUploadHistoryEntry({
      accountId: linkAccountId,
      fileName: "Statement (tidak tertaut)",
      transactions: linkedTransactions,
      transactionCount: count,
    });

    setLinkModalGroup(null);
    setLinkAccountId("");
    refreshData();
    showToast(
      `✅ ${count} transaksi berhasil ditautkan ke ${account?.nama || "akun"}`,
    );
  };

  const handleConfirmDeleteUnlinked = () => {
    if (!deleteUnlinkedConfirm) return;

    const count = deleteUnlinkedConfirm.transactionCount;
    const remaining = transactions.filter(
      (transaction) =>
        !isTransactionInUnlinkedGroup(transaction, deleteUnlinkedConfirm),
    );

    localStorage.setItem("parsedTransactions", JSON.stringify(remaining));
    setDeleteUnlinkedConfirm(null);
    refreshData();
    showToast(`🗑️ ${count} transaksi dihapus`);
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setCreatedAccountSuccess(null);
    setFormNama("");
    setFormTipe("bank");
    setFormBank(BANK_OPTIONS[0]);
    setFormWarna("#1B4332");
    setShowModal(true);
  };

  const openEditModal = (account) => {
    setCreatedAccountSuccess(null);
    setEditingAccount(account);
    setFormNama(account.nama);
    setFormTipe(account.tipe);
    setFormBank(account.bank);
    setFormWarna(account.warna);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAccount(null);
    setCreatedAccountSuccess(null);
  };

  const handleTipeChange = (tipe) => {
    setFormTipe(tipe);
    setFormBank(tipe === "cc" ? CC_OPTIONS[0] : BANK_OPTIONS[0]);
  };

  const handleSave = () => {
    const nama = formNama.trim();
    if (!nama) {
      alert("Nama akun wajib diisi.");
      return;
    }
    if (!formBank) {
      alert("Pilih bank.");
      return;
    }

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        nama,
        tipe: formTipe,
        bank: formBank,
        warna: formWarna,
      });
      refreshData();
      closeModal();
      return;
    }

    const newAccount = saveAccount({
      nama,
      tipe: formTipe,
      bank: formBank,
      warna: formWarna,
    });

    refreshData();
    setCreatedAccountSuccess({
      id: newAccount.id,
      nama: newAccount.nama,
    });
  };

  const handleUploadNow = () => {
    if (!createdAccountSuccess) return;
    router.push(`/upload?accountId=${createdAccountSuccess.id}`);
  };

  const handleDeleteClick = (account) => {
    const count = transactionCountByAccount[account.id] || 0;
    if (count > 0) {
      setDeleteConfirm({ account, count });
      return;
    }

    deleteAccount(account.id);
    refreshData();
  };

  const handleConfirmDeleteAll = () => {
    if (!deleteConfirm) return;

    const accountId = deleteConfirm.account.id;
    deleteAccount(accountId);

    const remaining = transactions.filter(
      (transaction) => transaction.accountId !== accountId,
    );
    localStorage.setItem("parsedTransactions", JSON.stringify(remaining));
    setDeleteConfirm(null);
    refreshData();
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1B4332] md:text-4xl">
            Akun Saya
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {accounts.length > 0 ? (
              <Link
                href="/upload"
                className="rounded-full border border-[#1B4332] px-5 py-2.5 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332]/5"
              >
                📄 Upload Statement
              </Link>
            ) : null}
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-full bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
            >
              + Tambah Akun
            </button>
          </div>
        </div>

        {accounts.length > 0 && transactions.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#1B4332]/30 bg-[#1B4332]/5 px-6 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Belum ada transaksi. Upload statement pertama kamu!
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex items-center rounded-full bg-[#1B4332] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
            >
              📄 Upload Statement
            </Link>
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[#1B4332]/30 bg-[#1B4332]/5 px-6 py-16 text-center">
            <p className="text-lg font-medium text-slate-700">
              Belum ada akun. Tambah akun pertama kamu!
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-6 rounded-full border border-[#1B4332] px-5 py-2.5 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332] hover:text-white"
            >
              + Tambah Akun
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {accounts.map((account) => {
              const txCount = transactionCountByAccount[account.id] || 0;
              const accountUploads = uploadHistoryByAccount[account.id] || [];

              return (
                <div
                  key={account.id}
                  className="flex flex-col rounded-2xl border border-[#1B4332]/20 bg-[#1B4332]/5 p-5"
                >
                  <div className="flex items-start gap-4">
                    <span
                      className="mt-1 h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: account.warna }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold text-slate-900">
                        {account.nama}
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {account.tipe === "cc" ? "💳 Credit Card" : "🏦 Bank Account"}
                      </span>
                      <p className="mt-2 text-sm text-slate-600">{account.bank}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {txCount} transaksi
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(account)}
                        className="rounded-full border border-slate-300 px-2.5 py-1.5 text-sm transition hover:bg-white"
                        aria-label={`Edit ${account.nama}`}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(account)}
                        className="rounded-full border border-slate-300 px-2.5 py-1.5 text-sm transition hover:bg-red-50"
                        aria-label={`Hapus ${account.nama}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[#1B4332]/10 pt-4">
                    <p className="text-sm font-semibold text-[#1B4332]">
                      📁 Statement Terupload
                    </p>
                    {accountUploads.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        Belum ada statement diupload
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {accountUploads.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {entry.fileName}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {formatUploadDate(entry.uploadedAt)} ·{" "}
                                {entry.transactionCount} transaksi ·{" "}
                                {entry.dateRange}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteUploadClick(entry)}
                              className="shrink-0 rounded-full border border-slate-300 px-2 py-1 text-sm transition hover:bg-red-50"
                              aria-label={`Hapus ${entry.fileName}`}
                            >
                              🗑️
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {txCount === 0 ? (
                    <Link
                      href={`/upload?accountId=${account.id}`}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition hover:bg-black/[0.03]"
                      style={{
                        borderColor: account.warna || "#1B4332",
                        color: account.warna || "#1B4332",
                      }}
                    >
                      📄 Upload Statement
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {unlinkedGroups.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-[#1B4332]">
              ⚠️ Statement Tidak Tertaut
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Ada {totalUnlinkedCount} transaksi yang belum ditautkan ke akun
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {unlinkedGroups.map((group) => (
                <div
                  key={group.periodKey}
                  className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50/60 p-5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg"
                      aria-hidden="true"
                    >
                      ⚠️
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        Statement (tidak tertaut)
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {group.dateRange}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {group.transactionCount} transaksi
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openLinkModal(group)}
                      disabled={accounts.length === 0}
                      className="flex-1 rounded-full border border-[#1B4332] px-3 py-2 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332]/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      🔗 Tautkan ke Akun
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteUnlinkedConfirm(group)}
                      className="flex-1 rounded-full border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {createdAccountSuccess ? (
              <>
                <p className="text-center text-lg font-semibold leading-relaxed text-slate-800">
                  ✅ Akun {createdAccountSuccess.nama} berhasil ditambahkan!
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleUploadNow}
                    className="w-full rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
                  >
                    📄 Upload Statement Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Nanti Saja
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#1B4332]">
                  {editingAccount ? "Edit Akun" : "Tambah Akun"}
                </h3>

                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Nama Akun
                  <input
                    type="text"
                    value={formNama}
                    onChange={(event) => setFormNama(event.target.value)}
                    placeholder="Contoh: Jago Utama"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1B4332]"
                  />
                </label>

                <p className="mt-5 text-sm font-semibold text-slate-700">Tipe Akun</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleTipeChange("bank")}
                    className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      formTipe === "bank"
                        ? "bg-[#1B4332] text-white"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    🏦 Bank Account
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTipeChange("cc")}
                    className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      formTipe === "cc"
                        ? "bg-[#1B4332] text-white"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    💳 Credit Card
                  </button>
                </div>

                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Bank
                  <select
                    value={formBank}
                    onChange={(event) => setFormBank(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1B4332]"
                  >
                    {bankOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="mt-5 text-sm font-semibold text-slate-700">Warna Akun</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormWarna(color)}
                      className={`h-9 w-9 rounded-full transition ${
                        formWarna === color
                          ? "ring-2 ring-[#1B4332] ring-offset-2"
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
                    onClick={handleSave}
                    className="flex-1 rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {linkModalGroup ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#1B4332]">Tautkan ke Akun</h3>
            <p className="mt-2 text-sm text-slate-600">
              Tautkan {linkModalGroup.transactionCount} transaksi ke akun mana?
            </p>

            {accounts.length > 0 ? (
              <>
                <div className="mt-5 space-y-2">
                  {accounts.map((account) => {
                    const isSelected = linkAccountId === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setLinkAccountId(account.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-[#1B4332] bg-[#1B4332]/5"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: account.warna || "#1B4332" }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">
                            {account.nama}
                          </span>
                          <span className="block truncate text-sm text-slate-500">
                            {account.bank}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmLinkUnlinked}
                    className="flex-1 rounded-full bg-[#1B4332] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163728]"
                  >
                    Tautkan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkModalGroup(null);
                      setLinkAccountId("");
                    }}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-600">
                  Belum ada akun. Tambah akun dulu sebelum menautkan transaksi.
                </p>
                <button
                  type="button"
                  onClick={() => setLinkModalGroup(null)}
                  className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deleteUnlinkedConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B4332]">Hapus Transaksi?</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Hapus {deleteUnlinkedConfirm.transactionCount} transaksi yang tidak
              tertaut ini? Data akan hilang permanen.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDeleteUnlinked}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={() => setDeleteUnlinkedConfirm(null)}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteUploadConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B4332]">Hapus Statement?</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
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
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1B4332]">Hapus Akun?</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Akun ini punya {deleteConfirm.count} transaksi. Menghapus akun akan
              menghapus semua transaksinya. Lanjutkan?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Hapus Semua
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
