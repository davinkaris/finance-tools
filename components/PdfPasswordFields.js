"use client";

import {
  PDF_PASSWORD_UNSUPPORTED_CODE,
  formatPdfPasswordUnsupportedError,
} from "../lib/pdfPasswordConstants";

export { PDF_PASSWORD_UNSUPPORTED_CODE, formatPdfPasswordUnsupportedError };

export default function PdfPasswordFields({
  enabled,
  onEnabledChange,
  password,
  onPasswordChange,
  showPassword,
  onShowPasswordChange,
  passwordError,
  disabled = false,
}) {
  return (
    <div className="mt-4 w-full text-left">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#ECEEF2]">
          🔒 PDF ini password protected?
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => onEnabledChange(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-[#63B3ED]" : "bg-[rgba(255,255,255,0.12)]"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {enabled ? (
        <div className="mt-3">
          <label className="block text-sm font-medium text-[#8B92A5]">
            Password PDF
            <div className="relative mt-2">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Masukkan password PDF"
                disabled={disabled}
                className={`w-full rounded-xl border px-4 py-2.5 pr-11 text-sm outline-none focus:border-[#63B3ED] disabled:opacity-50 ${
                  passwordError
                    ? "border-[#FC8181] focus:border-[#FC8181]"
                    : "border-[rgba(255,255,255,0.08)]"
                }`}
              />
              <button
                type="button"
                onClick={() => onShowPasswordChange(!showPassword)}
                disabled={disabled}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-[#8B92A5] transition hover:text-[#ECEEF2] disabled:opacity-50"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58M9.88 5.09A10.94 10.94 0 0112 5c5.52 0 10 4.48 10 7a11.8 11.8 0 01-4.12 4.12M6.12 6.12A11.8 11.8 0 002 12c0 2.52 4.48 7 10 7 1.01 0 1.98-.15 2.88-.42" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s4.48-7 10-7 10 7 10 7-4.48 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          {passwordError ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#FC8181]">
              {passwordError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
