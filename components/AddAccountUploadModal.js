"use client";

import { useEffect, useRef, useState } from "react";
import { getAccounts, saveAccount } from "../lib/accounts";
import { loadCategoryRules } from "../lib/categoryRules";
import { loadNotesRules } from "../lib/notesRules";
import { syncNotesFromTransactions } from "../lib/transactionNotes";
import {
  detectMoveMoney,
  detectPayBill,
} from "../lib/transactionMatching";
import { deduplicateTransactions } from "../lib/transactions";
import { addUploadHistoryEntry } from "../lib/uploadHistory";
import PdfPasswordFields, {
  PDF_PASSWORD_UNSUPPORTED_CODE,
} from "./PdfPasswordFields";

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

const UPLOAD_STAGES = [
  { label: "Membaca bank statement...", progress: 25 },
  { label: "Menganalisa transaksi...", progress: 50 },
  { label: "Mengkategorisasi pengeluaran...", progress: 75 },
  { label: "Membuat insight keuangan...", progress: 90 },
  { label: "Selesai!", progress: 100 },
];

function StepIndicator({ currentStep }) {
  const steps = [1, 2, 3];

  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step;
        const isActive = currentStep === step;

        return (
          <div key={step} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-white/20" aria-hidden="true">
                →
              </span>
            ) : null}
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                isCompleted
                  ? "bg-[#10b981] text-white"
                  : isActive
                    ? "btn-primary"
                    : "bg-[#20242E] text-[#8B92A5]"
              }`}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AddAccountUploadModal({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [formNama, setFormNama] = useState("");
  const [formTipe, setFormTipe] = useState("bank");
  const [formBank, setFormBank] = useState(BANK_OPTIONS[0]);
  const [formWarna, setFormWarna] = useState("#63B3ED");
  const [createdAccount, setCreatedAccount] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [skippedUpload, setSkippedUpload] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [pdfPasswordProtected, setPdfPasswordProtected] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const fileInputRef = useRef(null);
  const wasOpenRef = useRef(false);

  const bankOptions = formTipe === "cc" ? CC_OPTIONS : BANK_OPTIONS;
  const canClose = !isUploading && (step === 1 || step === 3);
  const canUpload = Boolean(selectedFile && createdAccount && !isUploading);

  const resetState = () => {
    setStep(1);
    setFormNama("");
    setFormTipe("bank");
    setFormBank(BANK_OPTIONS[0]);
    setFormWarna("#63B3ED");
    setCreatedAccount(null);
    setSelectedFile(null);
    setIsUploading(false);
    setProgressPercent(0);
    setStageLabel("");
    setSkippedUpload(false);
    setUploadedCount(0);
    setDuplicateCount(0);
    setPdfPasswordProtected(false);
    setPdfPassword("");
    setShowPdfPassword(false);
    setPasswordError("");
  };

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetState();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const handleClose = () => {
    if (!canClose) return;
    resetState();
    onClose();
  };

  const handleTipeChange = (tipe) => {
    setFormTipe(tipe);
    setFormBank(tipe === "cc" ? CC_OPTIONS[0] : BANK_OPTIONS[0]);
  };

  const setUploadStage = (index) => {
    const stage = UPLOAD_STAGES[index];
    if (!stage) return;
    setProgressPercent(stage.progress);
    setStageLabel(stage.label);
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
    setPdfPasswordProtected(false);
    setPdfPassword("");
    setShowPdfPassword(false);
    setPasswordError("");
  };

  const handleStep1Continue = () => {
    const nama = formNama.trim();
    if (!nama) {
      alert("Nama akun wajib diisi.");
      return;
    }

    const newAccount = saveAccount({
      nama,
      tipe: formTipe,
      bank: formBank,
      warna: formWarna,
    });

    setCreatedAccount(newAccount);
    setStep(2);
  };

  const handleSkipUpload = () => {
    setSkippedUpload(true);
    setStep(3);
  };

  const handleUploadAndAnalyze = async () => {
    if (!selectedFile || !createdAccount || isUploading) return;

    setIsUploading(true);
    setPasswordError("");
    setUploadStage(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("accountId", createdAccount.id);

      const categoryRules = loadCategoryRules();
      formData.append("categoryRules", JSON.stringify(categoryRules));

      const savedNotesRules = loadNotesRules();
      if (savedNotesRules.length > 0) {
        formData.append("notesRules", JSON.stringify(savedNotesRules));
      }

      if (pdfPasswordProtected && pdfPassword.trim()) {
        formData.append("pdfPassword", pdfPassword.trim());
      }

      const response = await fetch("/api/parse-statement", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorResult = await response.json();
        if (errorResult?.code === PDF_PASSWORD_UNSUPPORTED_CODE) {
          setPasswordError(errorResult.error);
          setProgressPercent(0);
          setStageLabel("");
          return;
        }
        throw new Error(errorResult?.error || "Gagal menganalisa statement.");
      }

      setUploadStage(1);
      const result = await response.json();
      setUploadStage(2);

      const newTransactions = result.transactions || [];

      const existing = JSON.parse(
        localStorage.getItem("parsedTransactions") || "[]",
      );
      const { uniqueNew: uniqueNewTransactions, duplicateCount: dupCount } =
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
      localStorage.setItem("aiInsights", JSON.stringify(result.insights || []));

      addUploadHistoryEntry({
        accountId: createdAccount.id,
        fileName: selectedFile.name,
        transactions:
          uniqueNewTransactions.length > 0
            ? uniqueNewTransactions
            : newTransactions,
        transactionCount: uniqueNewTransactions.length,
      });

      const autoAppliedCount = Number(result.autoAppliedCount || 0);
      if (autoAppliedCount > 0) {
        localStorage.setItem("autoCategoryNotification", String(autoAppliedCount));
      } else {
        localStorage.removeItem("autoCategoryNotification");
      }

      setUploadStage(4);
      setUploadedCount(uniqueNewTransactions.length);
      setDuplicateCount(dupCount);
      setSkippedUpload(false);
      setStep(3);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan.";
      alert(message);
      setProgressPercent(0);
      setStageLabel("");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFinish = () => {
    const account = createdAccount;
    resetState();
    onComplete(account);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto vale-modal w-full rounded-2xl p-6 shadow-xl">
        {canClose ? (
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#8B92A5] transition hover:bg-[#20242E] hover:text-[#8B92A5]"
            aria-label="Tutup modal"
          >
            ×
          </button>
        ) : null}

        <h3 className="pr-8 text-xl font-bold text-[#ECEEF2]">
          Tambah Akun &amp; Upload Statement
        </h3>

        <StepIndicator currentStep={step} />

        {step === 1 ? (
          <>
            <h4 className="text-lg font-semibold text-[#ECEEF2]">Buat Akun Baru</h4>

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

            <button
              type="button"
              onClick={handleStep1Continue}
              className="mt-6 w-full btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
            >
              Lanjut →
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h4 className="text-lg font-semibold text-[#ECEEF2]">
              Upload Statement (Opsional)
            </h4>
            <p className="mt-2 text-sm text-[#8B92A5]">
              Akun {createdAccount?.nama} berhasil dibuat ✅
            </p>

            <div className="vale-upload-box mt-5 px-4 py-8">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setPdfFile(file, event.target);
                }}
              />
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer?.files?.[0];
                  if (file) setPdfFile(file);
                }}
                className="flex flex-col items-center text-center"
              >
                <p className="text-sm font-medium text-[#8B92A5]">
                  Drag &amp; drop PDF di sini
                </p>
                {selectedFile ? (
                  <>
                    <p className="mt-2 max-w-full truncate text-xs text-[#8B92A5]">
                      {selectedFile.name}
                    </p>
                    <PdfPasswordFields
                      enabled={pdfPasswordProtected}
                      onEnabledChange={setPdfPasswordProtected}
                      password={pdfPassword}
                      onPasswordChange={(value) => {
                        setPdfPassword(value);
                        if (passwordError) setPasswordError("");
                      }}
                      showPassword={showPdfPassword}
                      onShowPasswordChange={setShowPdfPassword}
                      passwordError={passwordError}
                      disabled={isUploading}
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="mt-4 rounded-full border border-[rgba(99,179,237,0.3)] px-5 py-2 text-sm font-semibold text-[#63B3ED] transition btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Pilih File PDF
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUploadAndAnalyze}
              disabled={!canUpload}
              className={`mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                canUpload
                  ? "btn-primary hover:bg-[#63B3ED]"
                  : "cursor-not-allowed bg-[#20242E] text-[#8B92A5]"
              }`}
            >
              {isUploading ? "Sedang menganalisa..." : "Upload & Analisa"}
            </button>

            <button
              type="button"
              onClick={handleSkipUpload}
              disabled={isUploading}
              className="mt-3 w-full rounded-full border border-[rgba(255,255,255,0.08)] px-4 py-2.5 text-sm font-semibold text-[#8B92A5] transition hover:bg-[#20242E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lewati, Upload Nanti
            </button>

            {isUploading ? (
              <div className="mt-4">
                <div className="vale-progress-track h-2.5 overflow-hidden rounded-full">
                  <div
                    className="vale-progress-bar h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-sm font-medium text-[#63B3ED]">
                  {stageLabel}
                </p>
                <p className="mt-1 text-xs text-[#8B92A5]">{progressPercent}%</p>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h4 className="text-lg font-semibold text-[#ECEEF2]">Selesai!</h4>
            <p className="mt-4 text-center text-base leading-relaxed text-[#8B92A5]">
              {skippedUpload ? (
                <>✅ Akun {createdAccount?.nama} berhasil ditambahkan</>
              ) : duplicateCount > 0 ? (
                <>
                  ✅ {uploadedCount} transaksi baru ditambahkan. {duplicateCount}{" "}
                  transaksi duplikat diabaikan.
                </>
              ) : (
                <>✅ {uploadedCount} transaksi baru berhasil ditambahkan.</>
              )}
            </p>
            <button
              type="button"
              onClick={handleFinish}
              className="mt-6 w-full btn-primary rounded-full px-4 py-2.5 text-sm font-semibold transition btn-primary"
            >
              Lihat Dashboard
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
