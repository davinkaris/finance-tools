"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import { getAccounts } from "../../lib/accounts";
import { loadCategoryRules } from "../../lib/categoryRules";
import { loadNotesRules } from "../../lib/notesRules";
import { syncNotesFromTransactions } from "../../lib/transactionNotes";
import {
  detectMoveMoney,
  detectPayBill,
} from "../../lib/transactionMatching";
import { deduplicateTransactions } from "../../lib/transactions";
import { addUploadHistoryEntry } from "../../lib/uploadHistory";

const STAGES = [
  { label: "Membaca bank statement...", progress: 25 },
  { label: "Menganalisa transaksi...", progress: 50 },
  { label: "Mengkategorisasi pengeluaran...", progress: 75 },
  { label: "Membuat insight keuangan...", progress: 90 },
  { label: "Selesai!", progress: 100 },
];

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
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const fileInputRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAccountId = searchParams.get("accountId");

  useEffect(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);

    if (
      preselectedAccountId &&
      loadedAccounts.some((account) => account.id === preselectedAccountId)
    ) {
      setSelectedAccountId(preselectedAccountId);
    }
  }, [preselectedAccountId]);

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
      alert("File harus berformat PDF.");
      if (inputElement) inputElement.value = "";
      setSelectedFile(null);
      return;
    }

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
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || !selectedAccountId || isLoading) return;

    setIsLoading(true);
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
        throw new Error(errorResult?.error || "Gagal menganalisa statement.");
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
        const moveResult = detectMoveMoney(merged, accountList);
        const billResult = detectPayBill(moveResult.transactions, accountList);

        localStorage.setItem(
          "parsedTransactions",
          JSON.stringify(billResult.transactions),
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
            moveMoneyCount: moveResult.matches.length,
            payBillCount: billResult.matches.length,
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
      alert(message);
      resetProgress();
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

            {accounts.length === 0 ? (
              <div className="vale-card mt-4 rounded-2xl border border-dashed border-[rgba(255,255,255,0.12)] px-6 py-8 text-center">
                <p className="text-sm text-[#8B92A5]">
                  Belum ada akun. Tambah akun dulu sebelum upload.
                </p>
                <Link
                  href="/accounts"
                  className="btn-primary mt-4 inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Tambah Akun
                </Link>
              </div>
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
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {accounts.map((account) => {
                  const isSelected = selectedAccountId === account.id;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setSelectedAccountId(account.id)}
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
