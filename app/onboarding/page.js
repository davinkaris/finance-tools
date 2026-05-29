"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAccounts } from "../../lib/accounts";
import { loadCategoryRules } from "../../lib/categoryRules";
import {
  BANK_OPTIONS,
  calculateAge,
  COLOR_OPTIONS,
  getBankInitials,
  getDayOptions,
  getYearOptions,
  INCOME_OPTIONS,
  MONTH_OPTIONS,
  OCCUPATION_OPTIONS,
} from "../../lib/onboardingConstants";
import { loadNotesRules } from "../../lib/notesRules";
import { completeOnboarding, getProfile } from "../../lib/profiles";
import { safeArray } from "../../lib/safeArray";
import { supabase } from "../../lib/supabase";
import { syncNotesFromTransactions } from "../../lib/transactionNotes";
import { runTransactionMatching } from "../../lib/transactionMatching";
import { deduplicateTransactions } from "../../lib/transactions";
import {
  getTransactions,
  saveTransactions,
} from "../../lib/transactionsStore";

const inputClass =
  "w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1E2129] px-4 py-3 text-sm text-[#ECEEF2] outline-none transition placeholder:text-[#555D6E] focus:border-[#63B3ED]";

const selectClass =
  "w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1E2129] px-3 py-3 text-sm text-[#ECEEF2] outline-none focus:border-[#63B3ED]";

function StepIndicator({ step }) {
  const steps = [1, 2, 3];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {steps.map((item, index) => {
          const isActive = step >= item;
          const isLast = index === steps.length - 1;

          return (
            <div key={item} className="flex items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                  isActive
                    ? "bg-[#63B3ED] text-[#111318]"
                    : "border border-[rgba(255,255,255,0.12)] bg-[#20242E] text-[#8B92A5]"
                }`}
              >
                {item}
              </div>
              {!isLast ? (
                <div
                  className={`mx-2 h-0.5 w-12 sm:w-16 ${
                    step > item ? "bg-[#63B3ED]" : "bg-[rgba(255,255,255,0.12)]"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-center gap-8 text-xs text-[#8B92A5] sm:gap-14">
        <span className={step === 1 ? "font-semibold text-[#63B3ED]" : ""}>
          Step 1
        </span>
        <span className={step === 2 ? "font-semibold text-[#63B3ED]" : ""}>
          Step 2
        </span>
        <span className={step === 3 ? "font-semibold text-[#63B3ED]" : ""}>
          Step 3
        </span>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [checkingProfile, setCheckingProfile] = useState(true);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("Laki-laki");
  const [occupation, setOccupation] = useState(OCCUPATION_OPTIONS[0]);
  const [monthlyIncome, setMonthlyIncome] = useState("");

  const [accountName, setAccountName] = useState("");
  const [selectedBank, setSelectedBank] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  const [selectedFile, setSelectedFile] = useState(null);

  const dayOptions = useMemo(
    () => getDayOptions(birthMonth, birthYear),
    [birthMonth, birthYear],
  );
  const yearOptions = useMemo(() => getYearOptions(), []);
  const age = useMemo(
    () => calculateAge(birthDay, birthMonth, birthYear),
    [birthDay, birthMonth, birthYear],
  );

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const profile = await getProfile();
      if (profile?.onboarding_completed) {
        router.replace("/dashboard");
        return;
      }

      if (user.user_metadata?.full_name) {
        setFullName(String(user.user_metadata.full_name));
      }

      setCheckingProfile(false);
    }

    bootstrap();
  }, [router]);

  useEffect(() => {
    if (
      birthDay &&
      dayOptions.length > 0 &&
      Number(birthDay) > dayOptions.length
    ) {
      setBirthDay("");
    }
  }, [birthDay, dayOptions]);

  const setPdfFile = (file, inputElement) => {
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      if (inputElement) inputElement.value = "";
      setSelectedFile(null);
      setError("File harus berformat PDF.");
      return;
    }

    setError("");
    setSelectedFile(file);
  };

  const handleNextStep1 = () => {
    setError("");
    if (!fullName.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }
    setStep(2);
  };

  const handleNextStep2 = () => {
    setError("");
    if (!accountName.trim()) {
      setError("Nama akun wajib diisi.");
      return;
    }
    if (!selectedBank) {
      setError("Pilih bank utama kamu.");
      return;
    }
    setStep(3);
  };

  const persistStatementUpload = async (accountId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", accountId);
    formData.append(
      "categoryRules",
      JSON.stringify(safeArray(await loadCategoryRules())),
    );
    const savedNotesRules = safeArray(await loadNotesRules());
    if (savedNotesRules.length > 0) {
      formData.append("notesRules", JSON.stringify(savedNotesRules));
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Sesi login tidak valid. Silakan login ulang.");
    }
    formData.append("accessToken", session.access_token);

    const response = await fetch("/api/parse-statement", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorResult = await response.json();
      throw new Error(errorResult?.error || "Gagal menganalisa statement.");
    }

    const result = await response.json();
    const newTransactions = safeArray(result.transactions);
    const existing = safeArray(await getTransactions());
    const { uniqueNew: uniqueNewTransactions } = deduplicateTransactions(
      existing,
      newTransactions,
    );

    syncNotesFromTransactions(uniqueNewTransactions);
    const merged = [...existing, ...uniqueNewTransactions];
    const accountList = safeArray(await getAccounts());
    const matchResult = runTransactionMatching(merged, accountList, {
      userName: fullName.trim(),
    });

    await saveTransactions(matchResult.transactions);
    localStorage.setItem(
      "uploadNotification",
      JSON.stringify({
        transactionCount: uniqueNewTransactions.length,
        duplicateCount: newTransactions.length - uniqueNewTransactions.length,
        accountName: accountName.trim(),
        moveMoneyCount: matchResult.moveMoneyCount,
        payBillCount: matchResult.payBillCount,
      }),
    );
  };

  const finishOnboarding = async (withUpload) => {
    if (submitting) return;

    if (withUpload && !selectedFile) return;

    setSubmitting(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth");
        return;
      }

      const { accountId, error: completeError } = await completeOnboarding({
        userId: user.id,
        userEmail: user.email,
        profileData: {
          fullName,
          birthDay,
          birthMonth,
          birthYear,
          gender,
          occupation,
          incomeRange: monthlyIncome,
        },
        accountData: {
          nama: accountName,
          bank: selectedBank,
          warna: selectedColor,
        },
      });

      if (completeError || !accountId) {
        throw new Error(
          completeError?.message ||
            "Gagal menyimpan profil. Pastikan tabel profiles dan accounts sudah dibuat di Supabase.",
        );
      }

      if (withUpload && selectedFile) {
        await persistStatementUpload(accountId, selectedFile);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingProfile) {
    return (
      <div className="font-body flex min-h-screen items-center justify-center bg-transparent text-[#8B92A5]">
        Memuat...
      </div>
    );
  }

  return (
    <div className="font-body min-h-screen bg-transparent px-4 py-10 text-[#ECEEF2] sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="font-serif-display text-2xl tracking-tight text-[#ECEEF2]">
            Vale
          </span>
        </div>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#1A1D25] p-6 sm:p-8">
          <StepIndicator step={step} />

          {error ? (
            <div className="mb-4 rounded-xl border border-[rgba(252,129,129,0.3)] bg-[rgba(252,129,129,0.08)] px-4 py-3 text-sm text-[#FC8181]">
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-[#ECEEF2]">
                  Kenalan dulu yuk! 👋
                </h1>
              </div>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Nama Lengkap
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Sesuai KTP"
                  className={`${inputClass} mt-2`}
                />
                <span className="mt-2 block text-xs leading-relaxed text-[#555D6E]">
                  ⚠️ Gunakan nama sesuai KTP untuk pengalaman finansial yang
                  lebih akurat
                </span>
              </label>

              <div>
                <span className="block text-sm font-medium text-[#8B92A5]">
                  Tanggal Lahir
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <select
                    value={birthDay}
                    onChange={(event) => setBirthDay(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Tanggal</option>
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <select
                    value={birthMonth}
                    onChange={(event) => setBirthMonth(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Bulan</option>
                    {MONTH_OPTIONS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={birthYear}
                    onChange={(event) => setBirthYear(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Tahun</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-[#8B92A5]">
                  Jenis Kelamin
                </span>
                <div className="mt-2 flex rounded-xl bg-[#20242E] p-1">
                  {["Laki-laki", "Perempuan"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setGender(option)}
                      className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
                        gender === option
                          ? "bg-[#111318] text-[#ECEEF2]"
                          : "text-[#8B92A5] hover:text-[#ECEEF2]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Pekerjaan
                <select
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                  className={`${selectClass} mt-2`}
                >
                  {OCCUPATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Penghasilan Bulanan{" "}
                <span className="text-[#555D6E]">(opsional)</span>
                <select
                  value={monthlyIncome}
                  onChange={(event) => setMonthlyIncome(event.target.value)}
                  className={`${selectClass} mt-2`}
                >
                  <option value="">Pilih range penghasilan</option>
                  {INCOME_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleNextStep1}
                className="btn-gradient w-full rounded-full py-3 text-sm font-semibold text-white"
              >
                Lanjut →
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-[#ECEEF2]">
                  Bank utama kamu apa? 🏦
                </h1>
                <p className="mt-2 text-sm text-[#8B92A5]">
                  Pilih bank utama yang paling sering kamu pakai sehari-hari
                </p>
              </div>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Nama Akun
                <input
                  type="text"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  placeholder="contoh: BCA Utama, Jago Sehari-hari"
                  className={`${inputClass} mt-2`}
                />
              </label>

              <div>
                <span className="block text-sm font-medium text-[#8B92A5]">
                  Pilih Bank
                </span>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {BANK_OPTIONS.map((bank) => {
                    const isSelected = selectedBank === bank;
                    return (
                      <button
                        key={bank}
                        type="button"
                        onClick={() => setSelectedBank(bank)}
                        className={`flex flex-col items-center rounded-xl border px-2 py-3 transition ${
                          isSelected
                            ? "border-[#63B3ED] bg-[rgba(99,179,237,0.1)]"
                            : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)]"
                        }`}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#20242E] text-xs font-bold text-[#63B3ED]">
                          {getBankInitials(bank)}
                        </span>
                        <span className="mt-2 text-center text-[11px] leading-tight text-[#8B92A5]">
                          {bank}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-[#8B92A5]">
                  Pilih Warna Akun
                </span>
                <div className="mt-3 flex flex-wrap gap-3">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      aria-label={`Warna ${color}`}
                      className={`h-9 w-9 rounded-full transition ${
                        selectedColor === color
                          ? "ring-2 ring-[#63B3ED] ring-offset-2 ring-offset-[#1A1D25]"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-full border border-[rgba(255,255,255,0.12)] py-3 text-sm font-semibold text-[#8B92A5] transition hover:text-[#ECEEF2]"
                >
                  ← Kembali
                </button>
                <button
                  type="button"
                  onClick={handleNextStep2}
                  className="btn-gradient flex-1 rounded-full py-3 text-sm font-semibold text-white"
                >
                  Lanjut →
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-[#ECEEF2]">
                  Hampir selesai! 🎉
                </h1>
                <p className="mt-3 text-lg text-[#ECEEF2]">
                  Halo, {fullName.trim()}! 👋
                </p>
                <p className="mt-1 text-sm text-[#8B92A5]">
                  Profil kamu sudah siap.
                </p>
              </div>

              <div className="glass-card space-y-2 rounded-xl p-4 text-sm text-[#8B92A5]">
                <p>
                  📅 Umur:{" "}
                  <span className="text-[#ECEEF2]">
                    {age != null ? `${age} tahun` : "—"}
                  </span>
                </p>
                <p>
                  💼 Pekerjaan:{" "}
                  <span className="text-[#ECEEF2]">{occupation}</span>
                </p>
                <p>
                  🏦 Bank utama:{" "}
                  <span className="text-[#ECEEF2]">
                    {accountName.trim()} ({selectedBank})
                  </span>
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-[#ECEEF2]">
                  Mau langsung upload statement sekarang?
                </p>
                <p className="mt-1 text-xs text-[#8B92A5]">
                  Upload PDF statement {selectedBank} kamu untuk mulai analisa
                </p>

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
                  className="glass-card mt-3 rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] px-4 py-8 text-center"
                >
                  <p className="text-sm text-[#8B92A5]">
                    {selectedFile
                      ? `📄 ${selectedFile.name}`
                      : "📄 Drag & drop PDF di sini"}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="mt-4 rounded-full border border-[rgba(99,179,237,0.3)] px-4 py-2 text-sm font-semibold text-[#63B3ED] transition hover:bg-[rgba(99,179,237,0.08)] disabled:opacity-50"
                  >
                    Pilih File
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => finishOnboarding(true)}
                  disabled={submitting || !selectedFile}
                  className="btn-gradient w-full rounded-full py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "🚀 Upload & Mulai"}
                </button>
                <button
                  type="button"
                  onClick={() => finishOnboarding(false)}
                  disabled={submitting}
                  className="w-full rounded-full border border-[rgba(255,255,255,0.12)] py-3 text-sm font-semibold text-[#8B92A5] transition hover:text-[#ECEEF2] disabled:opacity-50"
                >
                  Lewati, Setup Nanti →
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="w-full text-sm text-[#555D6E] transition hover:text-[#8B92A5] disabled:opacity-50"
                >
                  ← Kembali
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
