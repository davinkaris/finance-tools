"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const router = useRouter();

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

  const handleAnalyze = async () => {
    if (!selectedFile || isLoading) return;

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/parse-statement", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Gagal menganalisa statement.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(
          "parsedTransactions",
          JSON.stringify(result.transactions || []),
        );
        localStorage.setItem(
          "aiInsights",
          JSON.stringify(result.insights || []),
        );
      }

      router.push("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan.";
      alert(message);
    } finally {
      setIsLoading(false);
    }
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

      <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-16 md:px-10 md:py-20">
        <section className="w-full text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1B4332] md:text-5xl">
            Upload Bank Statement Kamu
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            Mendukung semua bank Indonesia: BCA, Mandiri, BRI, BNI, CIMB, dan
            lainnya. Format PDF, maksimal 3 bulan terakhir
          </p>

          <div className="mx-auto mt-10 flex w-full max-w-2xl flex-col items-center rounded-2xl border-2 border-dashed border-[#1B4332]/35 bg-[#1B4332]/5 px-6 py-14">
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
                className="h-12 w-12 text-[#1B4332]"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16V4m0 0-4 4m4-4 4 4M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15"
                />
              </svg>

              <p className="mt-4 text-lg font-medium text-slate-700">
                Drag &amp; drop PDF kamu di sini
              </p>

              {selectedFile ? (
                <p className="mt-2 max-w-md truncate text-sm text-slate-600">
                  File dipilih: {selectedFile.name}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handlePickFile}
                className="mt-6 inline-flex items-center rounded-full border border-[#1B4332] px-6 py-3 text-sm font-semibold text-[#1B4332] transition hover:bg-[#1B4332] hover:text-white"
              >
                Pilih File
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedFile || isLoading}
            className={`mt-8 inline-flex items-center rounded-full px-7 py-3.5 text-base font-semibold transition ${
              selectedFile && !isLoading
                ? "bg-[#1B4332] text-white hover:bg-[#163728]"
                : "cursor-not-allowed bg-slate-300 text-slate-500"
            }`}
          >
            {isLoading ? "Sedang menganalisa..." : "Analisa Sekarang"}
          </button>
        </section>
      </main>
    </div>
  );
}
