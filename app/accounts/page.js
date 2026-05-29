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
import { safeArray } from "../../lib/safeArray";
import {
  deleteTransactionsByAccount,
  deleteTransactionsByUpload,
  getTransactions,
  saveTransactions,
} from "../../lib/transactionsStore";
import {
  addUploadHistoryEntry,
  deleteUploadHistoryEntry,
  formatUploadDate,
  getUploadHistory,
  groupUnlinkedTransactionsByPeriod,
  isTransactionInUnlinkedGroup,
  removeTransactionsForUploadEntry,
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
  "#63B3ED",
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
  const [formWarna, setFormWarna] = useState("#63B3ED");
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

  const refreshData = async () => {
    const [accountsData, uploadHistoryData, transactionsData] =
      await Promise.all([
        getAccounts(),
        getUploadHistory(),
        getTransactions(),
      ]);

    setAccounts(safeArray(accountsData));
    setUploadHistory(safeArray(uploadHistoryData));
    setTransactions(safeArray(transactionsData));
  };

  useEffect(() => {
    void refreshData();
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
    await refreshData();
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

  const handleConfirmLinkUnlinked = async () => {
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

    await saveTransactions(updated);
    await addUploadHistoryEntry({
      accountId: linkAccountId,
      fileName: "Statement (tidak tertaut)",
      transactions: linkedTransactions,
      transactionCount: count,
    });

    setLinkModalGroup(null);
    setLinkAccountId("");
    await refreshData();
    showToast(
      `✅ ${count} transaksi berhasil ditautkan ke ${account?.nama || "akun"}`,
    );
  };

  const handleConfirmDeleteUnlinked = async () => {
    if (!deleteUnlinkedConfirm) return;

    const count = deleteUnlinkedConfirm.transactionCount;
    const remaining = transactions.filter(
      (transaction) =>
        !isTransactionInUnlinkedGroup(transaction, deleteUnlinkedConfirm),
    );

    await saveTransactions(remaining);
    setDeleteUnlinkedConfirm(null);
    await refreshData();
    showToast(`🗑️ ${count} transaksi dihapus`);
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setCreatedAccountSuccess(null);
    setFormNama("");
    setFormTipe("bank");
    setFormBank(BANK_OPTIONS[0]);
    setFormWarna("#63B3ED");
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

  const handleSave = async () => {
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
      await updateAccount(editingAccount.id, {
        nama,
        tipe: formTipe,
        bank: formBank,
        warna: formWarna,
      });
      await refreshData();
      closeModal();
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

    await refreshData();
    setCreatedAccountSuccess({
      id: newAccount.id,
      nama: newAccount.nama,
    });
  };

  const handleUploadNow = () => {
    if (!createdAccountSuccess) return;
    router.push(`/upload?accountId=${createdAccountSuccess.id}`);
  };

  const handleDeleteClick = async (account) => {
    const count = transactionCountByAccount[account.id] || 0;
    if (count > 0) {
      setDeleteConfirm({ account, count });
      return;
    }

    await deleteAccount(account.id);
    await refreshData();
  };

  const handleConfirmDeleteAll = async () => {
    if (!deleteConfirm) return;

    const accountId = deleteConfirm.account.id;
    await deleteTransactionsByAccount(accountId);
    await deleteAccount(accountId);
    setDeleteConfirm(null);
    await refreshData();
  };

  return (
    <div className="vale-page font-body relative min-h-screen">
      <Navbar />

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-serif-display text-3xl tracking-tight text-[#ECEEF2] md:text-4xl">
            Akun Saya
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {accounts.length > 0 ? (
              <Link
                href="/upload"
                className="rounded-full border border-[rgba(99,179,237,0.3)] px-5 py-2.5 text-sm font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.06)]"
              >
                📄 Upload Statement
              </Link>
            ) : null}
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold transition btn-primary"
            >
              + Tambah Akun
            </button>
          </div>
        </div>

        {accounts.length > 0 && transactions.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(99,179,237,0.06)] px-6 py-8 text-center">
            <p className="text-sm font-medium text-[#8B92A5]">
              Belum ada transaksi. Upload statement pertama kamu!
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex items-center btn-primary rounded-full px-5 py-2.5 text-sm font-semibold transition btn-primary"
            >
              📄 Upload Statement
            </Link>
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(99,179,237,0.06)] px-6 py-16 text-center">
            <p className="text-lg font-medium text-[#8B92A5]">
              Belum ada akun. Tambah akun pertama kamu!
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary mt-6 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            >
              + Tambah Akun
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {accounts.map((account) => {
              const txCount = transactionCountByAccount[account.id] || 0;
              const accountUploads = uploadHistoryByAccount[account.id] || [];
              const hasStatement = txCount > 0;

              return (
                <div
                  key={account.id}
                  className="vale-card vale-card-hover flex flex-col rounded-2xl p-5"
                >
                  {hasStatement ? (
                    <>
                      <div className="flex items-start gap-4">
                        <span
                          className="mt-1 h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: account.warna }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-bold text-[#ECEEF2]">
                            {account.nama}
                          </p>
                          <span className="mt-2 inline-flex rounded-full bg-[#20242E] px-3 py-1 text-xs font-semibold text-[#8B92A5]">
                            {account.tipe === "cc" ? "💳 Credit Card" : "🏦 Bank Account"}
                          </span>
                          <p className="mt-2 text-sm text-[#8B92A5]">{account.bank}</p>
                          <p className="mt-1 text-sm text-[#8B92A5]">
                            {txCount} transaksi
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(account)}
                            className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 text-sm transition hover:bg-[#20242E]"
                            aria-label={`Edit ${account.nama}`}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(account)}
                            className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 text-sm transition hover:bg-red-500/10"
                            aria-label={`Hapus ${account.nama}`}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-white/[0.06] pt-4">
                        <p className="text-sm font-semibold text-[#63B3ED]">
                          📁 Statement Terupload
                        </p>
                        {accountUploads.length === 0 ? (
                          <p className="mt-2 text-sm text-[#8B92A5]">
                            Belum ada statement diupload
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {accountUploads.map((entry) => (
                              <li
                                key={entry.id}
                                className="flex items-start gap-2 rounded-xl bg-[#1A1D25]/[0.04] px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-[#ECEEF2]">
                                    {entry.fileName}
                                  </p>
                                  <p className="mt-0.5 text-xs text-[#8B92A5]">
                                    {formatUploadDate(entry.uploadedAt)} ·{" "}
                                    {entry.transactionCount} transaksi ·{" "}
                                    {entry.dateRange}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUploadClick(entry)}
                                  className="shrink-0 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1 text-sm transition hover:bg-red-500/10"
                                  aria-label={`Hapus ${entry.fileName}`}
                                >
                                  🗑️
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <Link
                        href={`/upload?accountId=${account.id}`}
                        className="mt-4 self-end rounded-full border border-[rgba(99,179,237,0.3)] px-3 py-1.5 text-xs font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.06)]"
                      >
                        ＋ Upload Statement
                      </Link>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="truncate text-lg font-bold text-[#ECEEF2]">
                          {account.nama}
                        </p>
                        <p className="mt-1 text-sm text-[#8B92A5]">{account.bank}</p>
                      </div>

                      <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[rgba(99,179,237,0.04)] px-6 py-10 text-center">
                        <p className="text-base font-semibold text-[#ECEEF2]">
                          📄 Belum ada statement
                        </p>
                        <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#8B92A5]">
                          Upload statement pertama kamu untuk mulai analisa keuangan
                        </p>
                        <Link
                          href={`/upload?accountId=${account.id}`}
                          className="btn-primary mt-6 inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold transition"
                        >
                          Upload Statement →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unlinkedGroups.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-[#63B3ED]">
              ⚠️ Statement Tidak Tertaut
            </h2>
            <p className="mt-1 text-sm text-[#8B92A5]">
              Ada {totalUnlinkedCount} transaksi yang belum ditautkan ke akun
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {unlinkedGroups.map((group) => (
                <div
                  key={group.periodKey}
                  className="flex flex-col rounded-2xl border border-[rgba(246,173,85,0.3)] bg-[rgba(246,173,85,0.05)] p-5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-lg"
                      aria-hidden="true"
                    >
                      ⚠️
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#ECEEF2]">
                        Statement (tidak tertaut)
                      </p>
                      <p className="mt-1 text-sm text-[#8B92A5]">
                        {group.dateRange}
                      </p>
                      <p className="mt-0.5 text-sm text-[#8B92A5]">
                        {group.transactionCount} transaksi
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openLinkModal(group)}
                      disabled={accounts.length === 0}
                      className="flex-1 rounded-full border border-[rgba(99,179,237,0.3)] px-3 py-2 text-sm font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.06)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      🔗 Tautkan ke Akun
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteUnlinkedConfirm(group)}
                      className="flex-1 rounded-full border border-red-300 px-3 py-2 text-sm font-semibold text-[#FC8181] transition hover:bg-red-500/10"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            {createdAccountSuccess ? (
              <>
                <p className="text-center text-lg font-semibold leading-relaxed text-[#ECEEF2]">
                  ✅ Akun {createdAccountSuccess.nama} berhasil ditambahkan!
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleUploadNow}
                    className="w-full btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
                  >
                    📄 Upload Statement Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                  >
                    Nanti Saja
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#63B3ED]">
                  {editingAccount ? "Edit Akun" : "Tambah Akun"}
                </h3>

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
                    onClick={() => handleTipeChange("bank")}
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
                    onClick={() => handleTipeChange("cc")}
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
                    onClick={handleSave}
                    className="flex-1 btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
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

      {linkModalGroup ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-[#63B3ED]">Tautkan ke Akun</h3>
            <p className="mt-2 text-sm text-[#8B92A5]">
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
                            ? "border-[#63B3ED] bg-[rgba(99,179,237,0.06)]"
                            : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.08)]"
                        }`}
                      >
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: account.warna || "#63B3ED" }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#ECEEF2]">
                            {account.nama}
                          </span>
                          <span className="block truncate text-sm text-[#8B92A5]">
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
                    className="flex-1 btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
                  >
                    Tautkan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkModalGroup(null);
                      setLinkAccountId("");
                    }}
                    className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm text-[#8B92A5]">
                  Belum ada akun. Tambah akun dulu sebelum menautkan transaksi.
                </p>
                <button
                  type="button"
                  onClick={() => setLinkModalGroup(null)}
                  className="mt-6 w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deleteUnlinkedConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#63B3ED]">Hapus Transaksi?</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
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
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteUploadConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
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

      {deleteConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md vale-modal w-full rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#63B3ED]">Hapus Akun?</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
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
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 vale-toast rounded-lg px-5 py-3 text-sm font-semibold">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
