"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import { getAccounts, saveAccount } from "../../lib/accounts";
import { loadCategoryRules } from "../../lib/categoryRules";
import { loadNotesRules } from "../../lib/notesRules";
import { syncNotesFromTransactions } from "../../lib/transactionNotes";
import { runTransactionMatching } from "../../lib/transactionMatching";
import { deduplicateTransactions } from "../../lib/transactions";
import { addUploadHistoryEntry } from "../../lib/uploadHistory";

const STAGES = [
  { label: "Membaca bank statement...", progress: 25 },
  { label: "Menganalisa transaksi...", progress: 50 },
  { label: "Mengkategorisasi pengeluaran...", progress: 75 },
  { label: "Membuat insight keuangan...", progress: 90 },
  { label: "Selesai!", progress: 100 },
];

const ERROR_BOX_STYLE = {
  background: "rgba(252,129,129,0.08)",
  border: "1px solid rgba(252,129,129,0.3)",
  borderRadius: "12px",
  padding: "16px",
  color: "#FC8181",
};

const SUGGEST_COLOR_POOL = [
  "#3B82F6",
  "#10B981",
  "#F97316",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
];

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
  "BSI",
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

function accountMatchesBank(account, bankName) {
  const target = String(bankName || "").toLowerCase();
  const bank = String(account?.bank || "").toLowerCase();
  return bank.includes(target) || target.includes(bank);
}

function pickAutoColor(existingAccounts) {
  const used = new Set(
    (existingAccounts || []).map((account) =>
      String(account.warna || "").toLowerCase(),
    ),
  );
  return (
    SUGGEST_COLOR_POOL.find((color) => !used.has(color.toLowerCase())) ||
    SUGGEST_COLOR_POOL[0]
  );
}

function buildSuggestedAccountData(bankName, existingAccounts) {
  const bank = String(bankName || "").trim();
  return {
    nama: `${bank} Account`,
    tipe: "bank",
    bank,
    warna: pickAutoColor(existingAccounts),
  };
}

function isPasswordRelatedError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("password protected") || normalized.includes("password")
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="vale-page font-body">
          <Navbar />
          <main className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-center px-6 py-20">
            <p className="text-sm text-[#8B92A5]">Memuat...</p>
          </main>
        </div>
      }
    >
      <UploadPageContent />
    </Suspense>
  );
}

function UploadPageContent() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [createdFromSuggestionId, setCreatedFromSuggestionId] = useState(null);
  const [showCreateAccountForm, setShowCreateAccountForm] = useState(false);
  const [newAccountNama, setNewAccountNama] = useState("");
  const [newAccountBank, setNewAccountBank] = useState(BANK_OPTIONS[0]);
  const [newAccountWarna, setNewAccountWarna] = useState(COLOR_OPTIONS[0]);
  const [createAccountError, setCreateAccountError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAccountId = searchParams.get("accountId");
  const suggestBank = searchParams.get("suggestBank")?.trim() || "";

  useEffect(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);

    if (
      preselectedAccountId &&
      loadedAccounts.some((account) => account.id === preselectedAccountId)
    ) {
      setSelectedAccountId(preselectedAccountId);
      return;
    }

    if (!suggestBank) return;

    const existingForBank = loadedAccounts.find((account) =>
      accountMatchesBank(account, suggestBank),
    );
    if (existingForBank) {
      setCreatedFromSuggestionId(null);
      setSelectedAccountId(existingForBank.id);
    }
  }, [preselectedAccountId, suggestBank]);

  const preExistingBankAccount = accounts.find((account) =>
    accountMatchesBank(account, suggestBank),
  );
  const showSuggestedCard = Boolean(
    suggestBank &&
      (!preExistingBankAccount ||
        preExistingBankAccount.id === createdFromSuggestionId),
  );
  const suggestedAccount = createdFromSuggestionId
    ? accounts.find((account) => account.id === createdFromSuggestionId)
    : null;
  const suggestedAccountData =
    suggestedAccount || buildSuggestedAccountData(suggestBank, accounts);
  const isSuggestedSelected =
    Boolean(createdFromSuggestionId) &&
    selectedAccountId === createdFromSuggestionId;
  const otherAccounts = showSuggestedCard
    ? accounts.filter((account) => account.id !== createdFromSuggestionId)
    : accounts;

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );
  const isPreselected =
    Boolean(preselectedAccountId) &&
    accounts.some((account) => account.id === preselectedAccountId);
  const canAnalyze = Boolean(selectedFile && selectedAccountId && !isLoading);

  const setStage = (index) => {
    const stage = STAGES[index];
    if (!stage) return;
    setProgressPercent(stage.progress);
    setStageLabel(stage.label);
  };

  const resetProgress = () => {
    setProgressPercent(0);
    setStageLabel("");
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadFailure = (message) => {
    resetProgress();
    if (isPasswordRelatedError(message)) {
      clearFileSelection();
      setUploadError("password");
      return;
    }
    setUploadError(message || "Terjadi kesalahan.");
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfFile(file, event.target);
  };

  const setPdfFile = (file, inputElement) => {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      if (inputElement) inputElement.value = "";
      setSelectedFile(null);
      setUploadError("File harus berformat PDF.");
      return;
    }

    setUploadError(null);
    setSelectedFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    setPdfFile(file);
  };

  const handleRemoveFile = () => {
    clearFileSelection();
    setUploadError(null);
  };

  const handleSelectSuggestedCard = () => {
    if (isLoading) return;

    if (createdFromSuggestionId) {
      setSelectedAccountId(createdFromSuggestionId);
      return;
    }

    const newAccount = saveAccount(buildSuggestedAccountData(suggestBank, accounts));
    setCreatedFromSuggestionId(newAccount.id);
    setAccounts(getAccounts());
    setSelectedAccountId(newAccount.id);
  };

  const handleSelectExistingAccount = (accountId) => {
    if (isLoading) return;
    setSelectedAccountId(accountId);
  };

  const resetCreateAccountForm = () => {
    setNewAccountNama("");
    setNewAccountBank(BANK_OPTIONS[0]);
    setNewAccountWarna(pickAutoColor(accounts));
    setCreateAccountError("");
  };

  const handleToggleCreateAccountForm = () => {
    if (isLoading) return;
    if (showCreateAccountForm) {
      setShowCreateAccountForm(false);
      resetCreateAccountForm();
      return;
    }
    setNewAccountWarna(pickAutoColor(accounts));
    setShowCreateAccountForm(true);
  };

  const handleCancelCreateAccount = () => {
    setShowCreateAccountForm(false);
    resetCreateAccountForm();
  };

  const handleCreateAndSelectAccount = () => {
    const nama = newAccountNama.trim();
    if (!nama) {
      setCreateAccountError("Nama akun wajib diisi.");
      return;
    }
    if (!newAccountBank) {
      setCreateAccountError("Pilih bank.");
      return;
    }

    const newAccount = saveAccount({
      nama,
      tipe: "bank",
      bank: newAccountBank,
      warna: newAccountWarna,
    });

    setAccounts(getAccounts());
    setSelectedAccountId(newAccount.id);
    setCreatedFromSuggestionId(null);
    setShowCreateAccountForm(false);
    resetCreateAccountForm();
  };

  const renderAccountGrid = (accountList) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {accountList.map((account) => {
        const isSelected = selectedAccountId === account.id;
        return (
          <button
            key={account.id}
            type="button"
            disabled={isLoading}
            onClick={() => handleSelectExistingAccount(account.id)}
            className={`vale-card flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? "vale-account-selected border-[#63B3ED]"
                : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)]"
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
  );

  const renderCreateAccountSection = () => (
    <div className="mt-3">
      <button
        type="button"
        disabled={isLoading}
        onClick={handleToggleCreateAccountForm}
        className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.15)] bg-transparent px-4 py-6 text-center transition hover:bg-[rgba(255,255,255,0.03)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-3xl font-light leading-none text-[#8B92A5]">+</span>
        <span className="mt-2 text-sm font-semibold text-[#ECEEF2]">
          Buat Akun Baru
        </span>
        <span className="mt-1 text-xs text-[#8B92A5]">
          Tambah bank atau kartu kredit lain
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          showCreateAccountForm ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
            <label className="block text-sm font-semibold text-[#8B92A5]">
              Nama Akun
              <input
                type="text"
                value={newAccountNama}
                onChange={(event) => {
                  setNewAccountNama(event.target.value);
                  if (createAccountError) setCreateAccountError("");
                }}
                placeholder="contoh: BCA Utama"
                className="mt-2 w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-4 py-2.5 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-[#8B92A5]">
              Pilih Bank
              <select
                value={newAccountBank}
                onChange={(event) => {
                  setNewAccountBank(event.target.value);
                  if (createAccountError) setCreateAccountError("");
                }}
                className="mt-2 w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] px-4 py-2.5 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]"
              >
                {BANK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <p className="mt-4 text-sm font-semibold text-[#8B92A5]">Warna Akun</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewAccountWarna(color)}
                  className={`h-9 w-9 rounded-full transition ${
                    newAccountWarna === color
                      ? "vale-color-selected"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Pilih warna ${color}`}
                />
              ))}
            </div>

            {createAccountError ? (
              <p className="mt-3 text-sm text-[#FC8181]">{createAccountError}</p>
            ) : null}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCreateAndSelectAccount}
                className="btn-primary flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition"
              >
                Buat &amp; Pilih
              </button>
              <button
                type="button"
                onClick={handleCancelCreateAccount}
                className="flex-1 rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const handleAnalyze = async () => {
    if (!selectedFile || !selectedAccountId || isLoading) return;

    setIsLoading(true);
    setUploadError(null);
    setStage(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("accountId", selectedAccountId);
      const categoryRules = loadCategoryRules();
      formData.append("categoryRules", JSON.stringify(categoryRules));
      const savedNotesRules = loadNotesRules();
      if (savedNotesRules.length > 0) {
        formData.append("notesRules", JSON.stringify(savedNotesRules));
      }

      const response = await fetch("/api/parse-statement", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorResult = await response.json();
        handleUploadFailure(
          errorResult?.error || "Gagal menganalisa statement.",
        );
        return;
      }

      setStage(1);

      const result = await response.json();
      setStage(2);

      if (typeof window !== "undefined") {
        const newTransactions = result.transactions || [];

        const existing = JSON.parse(
          localStorage.getItem("parsedTransactions") || "[]",
        );
        const { uniqueNew: uniqueNewTransactions, duplicateCount } =
          deduplicateTransactions(existing, newTransactions);

        syncNotesFromTransactions(uniqueNewTransactions);
        const merged = [...existing, ...uniqueNewTransactions];

        const accountList = getAccounts();

        if (
          createdFromSuggestionId &&
          !accountList.some((account) => account.id === createdFromSuggestionId)
        ) {
          const suggested = accounts.find(
            (account) => account.id === createdFromSuggestionId,
          );
          if (suggested) {
            saveAccount(suggested);
          }
        }

        const userName =
          typeof window !== "undefined"
            ? localStorage.getItem("valeProfileFullName") || ""
            : "";
        const matchResult = runTransactionMatching(merged, getAccounts(), {
          userName,
        });

        localStorage.setItem(
          "parsedTransactions",
          JSON.stringify(matchResult.transactions),
        );
        localStorage.setItem(
          "aiInsights",
          JSON.stringify(result.insights || []),
        );

        addUploadHistoryEntry({
          accountId: selectedAccountId,
          fileName: selectedFile.name,
          transactions:
            uniqueNewTransactions.length > 0
              ? uniqueNewTransactions
              : newTransactions,
          transactionCount: uniqueNewTransactions.length,
        });

        localStorage.setItem(
          "uploadNotification",
          JSON.stringify({
            transactionCount: uniqueNewTransactions.length,
            duplicateCount,
            accountName: selectedAccount?.nama || "Akun",
            moveMoneyCount: matchResult.moveMoneyCount,
            payBillCount: matchResult.payBillCount,
          }),
        );

        const autoAppliedCount = Number(result.autoAppliedCount || 0);
        if (autoAppliedCount > 0) {
          localStorage.setItem(
            "autoCategoryNotification",
            String(autoAppliedCount),
          );
        } else {
          localStorage.removeItem("autoCategoryNotification");
        }
      }

      setStage(3);
      setStage(4);

      await new Promise((resolve) => setTimeout(resolve, 400));
      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan.";
      handleUploadFailure(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="vale-page font-body relative min-h-screen">
      <Navbar />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-16 md:px-10 md:py-20">
        <section className="w-full text-center">
          <h1 className="font-serif-display text-3xl tracking-tight text-[#ECEEF2] md:text-5xl">
            Upload Bank Statement Kamu
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#8B92A5] md:text-lg">
            Mendukung semua bank Indonesia: BCA, Mandiri, BRI, BNI, CIMB, dan
            lainnya. Format PDF, maksimal 3 bulan terakhir
          </p>

          <div className="mx-auto mt-10 w-full max-w-2xl text-left">
            <h2 className="text-lg font-bold text-[#ECEEF2]">Pilih Akun</h2>
            <p className="mt-1 text-sm text-[#8B92A5]">
              {isPreselected
                ? "Statement akan diupload ke akun ini"
                : "Statement ini dari akun mana?"}
            </p>

            {suggestBank ? (
              <div
                className="mt-4 rounded-xl border px-4 py-3 text-sm"
                style={{
                  background: "rgba(251,191,36,0.08)",
                  borderColor: "rgba(251,191,36,0.2)",
                }}
              >
                <p className="font-semibold text-[#F6AD55]">
                  💡 Disarankan: upload statement {suggestBank}
                </p>
                <p className="mt-1 text-[#8B92A5]">
                  Buat akun {suggestBank} baru atau pilih akun yang sudah ada.
                </p>
              </div>
            ) : null}

            {showSuggestedCard ? (
              <div className="mt-4">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleSelectSuggestedCard}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSuggestedSelected
                      ? "vale-account-selected border-2 border-solid border-[#63B3ED]"
                      : "border-2 border-dashed border-[#F59E0B]"
                  }`}
                  style={
                    isSuggestedSelected
                      ? undefined
                      : { background: "rgba(245,158,11,0.06)" }
                  }
                >
                  <span
                    className="absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#92400E]"
                    style={{ background: "rgba(245,158,11,0.2)" }}
                  >
                    ✨ Disarankan
                  </span>
                  <span
                    className="mt-1 h-4 w-4 shrink-0 rounded-full"
                    style={{
                      backgroundColor: suggestedAccountData.warna || "#3B82F6",
                    }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 pr-24">
                    <span className="block truncate font-semibold text-[#ECEEF2]">
                      {suggestedAccountData.nama}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium text-[#F59E0B]">
                      Akun baru — {suggestBank}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-[#8B92A5]">
                      Klik untuk upload statement {suggestBank}
                    </span>
                  </span>
                </button>

                {otherAccounts.length > 0 ? (
                  <>
                    <p className="mt-5 text-sm font-semibold text-[#8B92A5]">
                      Atau upload ke akun yang sudah ada:
                    </p>
                    <div className="mt-3">{renderAccountGrid(otherAccounts)}</div>
                    {renderCreateAccountSection()}
                  </>
                ) : (
                  renderCreateAccountSection()
                )}
              </div>
            ) : accounts.length === 0 ? (
              <div className="mt-4">{renderCreateAccountSection()}</div>
            ) : isPreselected && selectedAccount ? (
              <div className="vale-account-selected mt-4 flex items-center gap-3 rounded-xl border-2 px-4 py-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{
                    backgroundColor: selectedAccount.warna || "#63B3ED",
                  }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#ECEEF2]">
                    {selectedAccount.nama}
                  </span>
                  <span className="block truncate text-sm text-[#8B92A5]">
                    {selectedAccount.bank}
                  </span>
                </span>
                <Link
                  href="/upload"
                  className="shrink-0 text-sm font-semibold text-[#63B3ED] underline-offset-2 hover:underline"
                >
                  Ganti akun
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                {renderAccountGrid(accounts)}
                {renderCreateAccountSection()}
              </div>
            )}
          </div>

          <div className="vale-upload-box mx-auto mt-10 flex w-full max-w-2xl flex-col items-center px-6 py-14">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="flex w-full flex-col items-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-12 w-12 text-[#63B3ED]"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16V4m0 0-4 4m4-4 4 4M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15"
                />
              </svg>

              <p className="mt-4 text-lg font-medium text-[#ECEEF2]">
                Drag &amp; drop PDF kamu di sini
              </p>

              {selectedFile ? (
                <div className="vale-card mt-4 inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[#8B92A5]">
                  <span className="truncate">📄 {selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isLoading}
                    className="shrink-0 rounded-full px-1.5 text-[#8B92A5] transition hover:bg-[#20242E] hover:text-[#ECEEF2] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Hapus file"
                  >
                    ✕
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handlePickFile}
                disabled={isLoading}
                className="mt-6 inline-flex items-center rounded-full border border-[rgba(99,179,237,0.3)] px-6 py-3 text-sm font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pilih File
              </button>

              {uploadError === "password" ? (
                <div
                  className="mt-6 w-full text-left text-sm leading-relaxed"
                  style={ERROR_BOX_STYLE}
                  role="alert"
                >
                  <p className="font-semibold">🔒 PDF ini password protected</p>
                  <p className="mt-3">Buka PDF di Preview (Mac):</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>Double click file PDF</li>
                    <li>File → Export as PDF</li>
                    <li>Hilangkan password → Save</li>
                    <li>Upload file baru yang sudah disave</li>
                  </ol>
                </div>
              ) : uploadError ? (
                <div
                  className="mt-6 w-full text-left text-sm leading-relaxed"
                  style={ERROR_BOX_STYLE}
                  role="alert"
                >
                  {uploadError}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="mx-auto mt-4 w-full max-w-2xl text-left"
            style={{
              background: "rgba(99,179,237,0.08)",
              border: "1px solid rgba(99,179,237,0.2)",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "13px",
              color: "#8B92A5",
            }}
          >
            <div className="flex gap-3">
              <span className="shrink-0 text-base leading-none" aria-hidden="true">
                💡
              </span>
              <div className="min-w-0 space-y-3 leading-relaxed">
                <p className="font-medium text-[#ECEEF2]">
                  Tips: Pastikan PDF tidak password protected
                </p>
                <div>
                  <p className="mb-2">Cara download statement tanpa password:</p>
                  <ul className="list-none space-y-1.5 pl-0">
                    <li>
                      <span className="text-[#63B3ED]">•</span> Bank Jago: Mutasi → Export PDF → pilih tanpa enkripsi
                    </li>
                    <li>
                      <span className="text-[#63B3ED]">•</span> BCA: KlikBCA → e-Statement → Download (tidak perlu password)
                    </li>
                    <li>
                      <span className="text-[#63B3ED]">•</span> Mandiri: Livin → Rekening Koran → Download PDF
                    </li>
                    <li>
                      <span className="text-[#63B3ED]">•</span> CIMB: OCTO Mobile → Rekening Koran → Export PDF
                    </li>
                  </ul>
                </div>
                <p>
                  Kalau PDF kamu password protected, buka dulu di Preview (Mac) atau Adobe Reader, lalu save ulang tanpa password.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={`mt-8 inline-flex items-center rounded-full px-7 py-3.5 text-base font-semibold transition ${
              canAnalyze
                ? "btn-primary"
                : "cursor-not-allowed bg-[#20242E] text-[#8B92A5]"
            }`}
          >
            {isLoading ? "Sedang menganalisa..." : "Analisa Sekarang"}
          </button>

          {isLoading ? (
            <div className="mx-auto mt-6 w-full max-w-md">
              <div className="vale-progress-track h-2.5 overflow-hidden rounded-full">
                <div
                  className="vale-progress-bar h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-3 text-sm font-medium text-[#63B3ED] transition-opacity duration-300">
                {stageLabel}
              </p>
              <p className="mt-1 text-xs text-[#8B92A5]">{progressPercent}%</p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
