"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase";

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58M9.88 5.09A10.94 10.94 0 0112 5c5.52 0 10 4.48 10 7a11.8 11.8 0 01-4.12 4.12M6.12 6.12A11.8 11.8 0 002 12c0 2.52 4.48 7 10 7 1.01 0 1.98-.15 2.88-.42" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s4.48-7 10-7 10 7 10 7-4.48 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function isLoginCredentialsError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password") ||
    normalized.includes("email not confirmed")
  );
}

function isEmailAlreadyRegistered(message, code) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already registered") ||
    code === "user_already_exists"
  );
}

function ErrorBox({ children }) {
  return (
    <div
      className="mt-4 rounded-xl border border-[rgba(252,129,129,0.3)] bg-[rgba(252,129,129,0.08)] px-4 py-3 text-sm text-[#FC8181]"
      role="alert"
    >
      {children}
    </div>
  );
}

function LinkButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-semibold text-[#63B3ED] transition hover:text-[#90CDF4] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginErrorType, setLoginErrorType] = useState(null);
  const [signupError, setSignupError] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupSuccessEmail, setSignupSuccessEmail] = useState("");

  const clearErrors = () => {
    setError("");
    setLoginErrorType(null);
    setSignupError(null);
    setSuccess("");
  };

  const switchTab = (nextTab) => {
    setTab(nextTab);
    clearErrors();
    setSignupSuccessEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    clearErrors();
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (isLoginCredentialsError(authError.message)) {
          const { error: checkError } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: false },
          });

          const checkMessage = checkError?.message || "";
          if (
            checkMessage.includes("Email not found") ||
            checkMessage.includes("Signups not allowed")
          ) {
            setLoginErrorType("not_registered");
          } else {
            setLoginErrorType("wrong_password");
          }
          return;
        }
        setError(authError.message || "Terjadi kesalahan. Coba lagi.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    clearErrors();
    setLoading(true);
    setIsSigningUp(true);

    if (password !== confirmPassword) {
      setSignupError("password_mismatch");
      setLoading(false);
      setIsSigningUp(false);
      return;
    }

    try {
      const signupEmail = email.trim();
      const { data, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        if (isEmailAlreadyRegistered(authError.message, authError.code)) {
          setSignupError("email_exists");
          return;
        }
        setError(authError.message || "Terjadi kesalahan. Coba lagi.");
        return;
      }

      if (data?.user?.identities?.length === 0) {
        setSignupError("email_exists");
        return;
      }

      setSignupSuccessEmail(signupEmail);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoading(false);
      setIsSigningUp(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Masukkan email dulu untuk reset password.");
      setLoginErrorType(null);
      return;
    }

    clearErrors();
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/auth` },
      );

      if (authError) {
        setError(authError.message || "Gagal mengirim link reset password.");
        return;
      }

      setSuccess("Link reset password sudah dikirim ke email kamu.");
    } catch {
      setError("Gagal mengirim link reset password.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1E2129] px-4 py-3 text-sm text-[#ECEEF2] outline-none transition placeholder:text-[#555D6E] focus:border-[#63B3ED]";

  return (
    <div className="vale-page font-body relative flex min-h-screen flex-col items-center justify-center bg-transparent px-6 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#63B3ED] opacity-[0.06] blur-[80px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center">
          <Link
            href="/"
            className="font-serif-display text-3xl tracking-[-0.5px] text-[#ECEEF2] transition hover:opacity-80"
          >
            Vale
          </Link>
          <p className="mt-2 text-sm text-[#8B92A5]">
            {tab === "login"
              ? "Masuk ke akun Vale kamu"
              : "Buat akun Vale baru"}
          </p>
        </div>

        <div className="vale-card mt-8 rounded-2xl border border-[rgba(255,255,255,0.08)] p-6 md:p-8">
          <div className="flex rounded-xl bg-[#20242E] p-1">
            <button
              type="button"
              onClick={() => switchTab("login")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
                tab === "login"
                  ? "bg-[#111318] text-[#ECEEF2] shadow-sm"
                  : "text-[#8B92A5] hover:text-[#ECEEF2]"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => switchTab("register")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${
                tab === "register"
                  ? "bg-[#111318] text-[#ECEEF2] shadow-sm"
                  : "text-[#8B92A5] hover:text-[#ECEEF2]"
              }`}
            >
              Daftar
            </button>
          </div>

          {loginErrorType === "not_registered" && tab === "login" ? (
            <ErrorBox>
              <p className="font-medium">Email belum terdaftar.</p>
              <p className="mt-3">
                <LinkButton onClick={() => switchTab("register")} disabled={loading}>
                  Buat Akun Sekarang →
                </LinkButton>
              </p>
            </ErrorBox>
          ) : null}

          {loginErrorType === "wrong_password" && tab === "login" ? (
            <ErrorBox>
              <p className="font-medium">Password salah.</p>
              <p className="mt-2 text-xs text-[#8B92A5]">
                Lupa password?{" "}
                <LinkButton onClick={handleForgotPassword} disabled={loading}>
                  Reset di sini
                </LinkButton>
              </p>
            </ErrorBox>
          ) : null}

          {signupError === "email_exists" && tab === "register" ? (
            <ErrorBox>
              <p className="font-medium">Email sudah terdaftar. Mau masuk?</p>
              <p className="mt-3">
                <LinkButton onClick={() => switchTab("login")} disabled={loading}>
                  Masuk →
                </LinkButton>
              </p>
            </ErrorBox>
          ) : null}

          {signupError === "password_mismatch" && tab === "register" ? (
            <ErrorBox>
              <p className="font-medium">Password tidak sama</p>
            </ErrorBox>
          ) : null}

          {error ? (
            <ErrorBox>
              <p>{error}</p>
            </ErrorBox>
          ) : null}

          {success ? (
            <p
              className="mt-4 rounded-xl border border-[rgba(104,211,145,0.3)] bg-[rgba(104,211,145,0.08)] px-4 py-3 text-sm text-[#68D391]"
              role="status"
            >
              {success}
            </p>
          ) : null}

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-[#8B92A5]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (loginErrorType) setLoginErrorType(null);
                  }}
                  placeholder="nama@email.com"
                  className={`${inputClass} mt-2`}
                  disabled={loading}
                />
              </label>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Password
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (loginErrorType) setLoginErrorType(null);
                    }}
                    placeholder="••••••••"
                    className={`${inputClass} pr-11`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[#8B92A5] transition hover:text-[#ECEEF2]"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn-gradient w-full rounded-full py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Memproses..." : "Masuk"}
              </button>

              <p className="text-center text-sm text-[#8B92A5]">
                Belum punya akun?{" "}
                <LinkButton onClick={() => switchTab("register")} disabled={loading}>
                  Daftar Sekarang
                </LinkButton>
              </p>
            </form>
          ) : signupSuccessEmail ? (
            <div className="mt-6 text-center">
              <div className="text-5xl" aria-hidden="true">
                ✉️
              </div>
              <h2 className="mt-4 text-xl font-semibold text-[#ECEEF2]">
                Cek email kamu!
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#8B92A5]">
                Kami sudah kirim link konfirmasi ke{" "}
                <span className="font-medium text-[#ECEEF2]">
                  {signupSuccessEmail}
                </span>
                . Klik link di email untuk aktivasi akun Vale kamu.
              </p>
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gradient mt-6 inline-flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
              >
                Buka Gmail →
              </a>
              <p className="mt-4 text-xs leading-relaxed text-[#555D6E]">
                Tidak dapat email? Cek folder spam atau tunggu beberapa menit.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-[#8B92A5]">
                Nama Lengkap
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nama lengkap"
                  className={`${inputClass} mt-2`}
                  disabled={loading || isSigningUp}
                />
              </label>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (signupError) setSignupError(null);
                  }}
                  placeholder="nama@email.com"
                  className={`${inputClass} mt-2`}
                  disabled={loading || isSigningUp}
                />
              </label>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Password
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-11`}
                    disabled={loading || isSigningUp}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[#8B92A5] transition hover:text-[#ECEEF2]"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </label>

              <label className="block text-sm font-medium text-[#8B92A5]">
                Konfirmasi Password
                <div className="relative mt-2">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-11`}
                    disabled={loading || isSigningUp}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[#8B92A5] transition hover:text-[#ECEEF2]"
                    aria-label={
                      showConfirmPassword
                        ? "Sembunyikan konfirmasi password"
                        : "Tampilkan konfirmasi password"
                    }
                  >
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading || isSigningUp}
                className="btn-gradient w-full rounded-full py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSigningUp ? "Membuat akun..." : "Buat Akun"}
              </button>

              <p className="text-center text-xs leading-relaxed text-[#555D6E]">
                Dengan mendaftar kamu setuju dengan Terms of Service kami
              </p>

              <p className="text-center text-sm text-[#8B92A5]">
                Sudah punya akun?{" "}
                <LinkButton onClick={() => switchTab("login")} disabled={loading}>
                  Masuk
                </LinkButton>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
