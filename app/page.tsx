import Link from "next/link";
import RevealInit from "../components/landing/RevealInit";

function IconUpload() {
  return (
    <div className="relative flex h-7 w-7 flex-col justify-center gap-[5px]">
      <span className="h-[2px] w-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" />
      <span className="h-[2px] w-4/5 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" />
      <span className="h-[2px] w-3/5 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" />
      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4]" />
    </div>
  );
}

function IconNeural() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" fill="none">
      <circle cx="14" cy="6" r="2.5" fill="url(#cyanGrad)" />
      <circle cx="6" cy="18" r="2.5" fill="url(#cyanGrad)" />
      <circle cx="22" cy="18" r="2.5" fill="url(#cyanGrad)" />
      <circle cx="14" cy="24" r="2" fill="url(#cyanGrad)" />
      <line x1="14" y1="8.5" x2="7.5" y2="16" stroke="url(#cyanGrad)" strokeWidth="1.2" />
      <line x1="14" y1="8.5" x2="20.5" y2="16" stroke="url(#cyanGrad)" strokeWidth="1.2" />
      <line x1="8" y1="19" x2="14" y2="22" stroke="url(#cyanGrad)" strokeWidth="1.2" />
      <line x1="20" y1="19" x2="14" y2="22" stroke="url(#cyanGrad)" strokeWidth="1.2" />
      <defs>
        <linearGradient id="cyanGrad" x1="0" y1="0" x2="28" y2="28">
          <stop stopColor="#06B6D4" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconAdvisor() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" fill="none">
      <path
        d="M4 8C4 5.79 5.79 4 8 4H16C18.21 4 20 5.79 20 8V14C20 16.21 18.21 18 16 18H10L5 22V18C4.45 18 4 17.55 4 17V8Z"
        stroke="url(#indigoGrad)"
        strokeWidth="1.5"
        fill="rgba(99,102,241,0.1)"
      />
      <rect x="8" y="10" width="1.5" height="5" rx="0.75" fill="url(#indigoGrad)" />
      <rect x="11" y="8" width="1.5" height="7" rx="0.75" fill="url(#indigoGrad)" />
      <rect x="14" y="9" width="1.5" height="6" rx="0.75" fill="url(#indigoGrad)" />
      <rect x="17" y="7" width="1.5" height="8" rx="0.75" fill="url(#indigoGrad)" />
      <defs>
        <linearGradient id="indigoGrad" x1="4" y1="4" x2="24" y2="24">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StarRating() {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 16 16" className="h-4 w-4 fill-[#F59E0B]">
          <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.27l-3.52 1.85.67-3.93L2.3 5.64l3.94-.57L8 1.5z" />
        </svg>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    title: "Upload & Analisa",
    description:
      "Drag & drop PDF statement dari BCA, Mandiri, Jago — Vale membaca dan mengkategorisasi transaksi secara otomatis.",
    icon: <IconUpload />,
  },
  {
    title: "AI Insight Personal",
    description:
      "Dapatkan insight yang benar-benar relevan: pola spending, anomali, dan rekomendasi yang actionable.",
    icon: <IconNeural />,
  },
  {
    title: "Financial Advisor AI",
    description:
      "Tanya apa saja soal keuangan kamu. Vale paham konteks spending Indonesia dan jawab dengan natural.",
    icon: <IconAdvisor />,
  },
];

const STEPS = [
  {
    num: "01",
    title: "Buat Akun Bank",
    description: "Tambahkan rekening atau kartu kredit kamu — BCA, Mandiri, Jago, dan lainnya.",
  },
  {
    num: "02",
    title: "Upload Statement",
    description: "Upload PDF statement bulanan. Vale membaca, parse, dan kategorisasi otomatis.",
  },
  {
    num: "03",
    title: "Ambil Keputusan",
    description: "Lihat dashboard, filter per bulan, dan kelola keuangan dengan percaya diri.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Vale completely changed how I manage my finances. The AI insights are scary accurate.",
    name: "Rizky A.",
    role: "Product Manager",
    initials: "RA",
  },
  {
    quote:
      "Finally a finance app that actually understands how Indonesians spend money.",
    name: "Sinta W.",
    role: "Freelance Designer",
    initials: "SW",
  },
  {
    quote:
      "Upload statement Jago, langsung dapat breakdown kategori. Gila sih secepat itu.",
    name: "Dimas P.",
    role: "Software Engineer",
    initials: "DP",
  },
];

export default function Home() {
  return (
    <div className="font-body relative min-h-screen overflow-x-hidden bg-[#050A18] text-[#F8FAFC] selection:bg-[#3B82F6]/30">
      <RevealInit />

      {/* Background layers */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="orb-1 absolute -left-48 -top-48 h-[800px] w-[800px] rounded-full bg-[#3B82F6] opacity-[0.12] blur-[120px]" />
        <div className="orb-2 absolute -bottom-32 -right-32 h-[600px] w-[600px] rounded-full bg-[#06B6D4] opacity-[0.08] blur-[100px]" />
        <div className="orb-3 absolute right-[5%] top-1/3 h-[400px] w-[400px] rounded-full bg-[#6366F1] opacity-10 blur-[80px]" />
        <div className="dot-grid absolute inset-0" />
      </div>

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#050A18]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6 md:px-10">
          <Link
            href="/"
            className="font-serif-display text-2xl tracking-[-0.5px] text-[#F8FAFC]"
          >
            Vale
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="rounded-full px-4 py-2 text-sm font-medium text-[#94A3B8] transition hover:text-[#F8FAFC]"
            >
              Masuk
            </Link>
            <Link
              href="/auth"
              className="btn-gradient rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            >
              Mulai Gratis →
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-16 px-6 pb-24 pt-[100px] lg:grid-cols-2 lg:px-10">
          <div>
            <div className="reveal flex items-center gap-3">
              <span className="h-px w-8 bg-[#06B6D4]" />
              <span className="text-xs font-medium tracking-[0.2em] text-[#06B6D4]">
                PERSONAL FINANCE AI
              </span>
            </div>

            <h1 className="reveal reveal-delay-1 font-serif-display mt-8 text-[48px] leading-[1.1] md:text-[64px] lg:text-[80px]">
              <span className="block text-[#F8FAFC]">Kenali kemana</span>
              <span className="block text-[#F8FAFC]">uangmu pergi</span>
              <span className="text-gradient block">setiap bulan.</span>
            </h1>

            <p className="reveal reveal-delay-2 mt-6 max-w-[420px] text-lg leading-relaxed text-[#94A3B8]">
              Vale membaca bank statement kamu, menganalisa pola spending, dan
              memberikan insight finansial yang benar-benar personal.
            </p>

            <div className="reveal reveal-delay-3 mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/auth"
                className="btn-gradient rounded-full px-7 py-3.5 text-sm font-semibold text-white"
              >
                Mulai Gratis — Gratis
              </Link>
              <a
                href="#cara-kerja"
                className="rounded-full border border-white/15 px-7 py-3.5 text-sm font-medium text-[#94A3B8] transition hover:border-white/30 hover:text-[#F8FAFC]"
              >
                Lihat Cara Kerja ↓
              </a>
            </div>

            <div className="reveal reveal-delay-4 mt-8 flex flex-wrap items-center gap-4 text-xs text-[#64748B]">
              <span>🔒 Aman</span>
              <span className="text-white/20">·</span>
              <span>⚡ Real-time</span>
              <span className="text-white/20">·</span>
              <span>🤖 AI-powered</span>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="reveal reveal-delay-2 relative mx-auto w-full max-w-[520px] lg:mx-0">
            <div
              className="hero-mockup relative w-full rounded-3xl border border-[rgba(59,130,246,0.2)] p-6 backdrop-blur-[20px]"
              style={{
                background:
                  "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(6,182,212,0.05))",
                boxShadow:
                  "0 0 0 1px rgba(59,130,246,0.1), 0 40px 80px -20px rgba(0,0,0,0.8), 0 0 60px -10px rgba(59,130,246,0.15)",
                minHeight: "320px",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#06B6D4] text-xs font-bold text-white">
                    DK
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#F8FAFC]">Davin Karis</p>
                    <p className="text-xs text-[#64748B]">November 2024</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#F59E0B]/15 px-2.5 py-1 text-[10px] font-medium text-[#FBBF24]">
                  ✨ 3 insights baru
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { emoji: "💰", label: "Pemasukan", value: "Rp 15.5jt", delta: "↑12%", up: true },
                  { emoji: "💸", label: "Pengeluaran", value: "Rp 8.2jt", delta: null, up: false },
                  { emoji: "📈", label: "Saving", value: "Rp 7.3jt", delta: "↑8%", up: true },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5"
                  >
                    <p className="text-[9px] text-[#64748B]">
                      {m.emoji} {m.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[#F8FAFC]">{m.value}</p>
                    {m.delta && (
                      <p className="text-[9px] text-[#06B6D4]">{m.delta}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="mb-3 text-[10px] text-[#64748B]">Pengeluaran Mingguan</p>
                <div className="flex h-16 items-end justify-between gap-1.5">
                  {[45, 72, 58, 88, 52, 78].map((h, i) => (
                    <div
                      key={i}
                      className="w-full max-w-[32px] rounded-t-md bg-gradient-to-t from-[#3B82F6] to-[#06B6D4]"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <div className="float-card-a absolute -left-6 top-4 z-10 max-w-[200px] rounded-2xl border border-[rgba(6,182,212,0.3)] bg-white/[0.06] p-4 backdrop-blur-xl md:-left-12 md:max-w-[220px]">
              <p className="text-xs font-semibold text-[#06B6D4]">🔍 AI Insight</p>
              <p className="mt-1 text-sm leading-snug text-[#94A3B8]">
                F&amp;B spending naik 23% bulan ini
              </p>
            </div>

            <div className="float-card-b absolute -right-6 bottom-4 z-10 max-w-[200px] rounded-2xl border border-white/[0.08] bg-white/[0.06] p-4 backdrop-blur-xl md:-right-12 md:max-w-[220px]">
              <p className="text-xs font-semibold text-[#3B82F6]">✅ Transfer terdeteksi</p>
              <p className="mt-1 text-sm leading-snug text-[#94A3B8]">
                Rp 5jt → BCA dicocokkan
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y border-white/[0.06] py-20">
          <div className="reveal mx-auto flex max-w-4xl flex-col items-center justify-center gap-10 px-6 md:flex-row md:gap-0">
            {[
              { counter: 1000, suffix: "+", label: "users" },
              { counter: 15, suffix: "+", label: "banks" },
              { counter: 99, suffix: "%", label: "accuracy" },
            ].map((stat, i) => (
              <div key={stat.label} className="flex flex-1 items-center">
                {i > 0 && (
                  <div className="hidden h-12 w-px bg-white/10 md:block" aria-hidden="true" />
                )}
                <div className="flex-1 px-6 text-center">
                  <p
                    className="font-serif-display text-gradient text-5xl md:text-[64px]"
                    data-counter={stat.counter}
                    data-suffix={stat.suffix}
                  >
                    0{stat.suffix}
                  </p>
                  <p className="mt-2 text-sm capitalize text-[#94A3B8]">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-32 md:px-10">
          <h2 className="reveal font-serif-display text-center text-4xl text-[#F8FAFC] md:text-[56px]">
            Semua yang kamu butuhkan
          </h2>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`reveal feature-card group ${["reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][i]}`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(59,130,246,0.1)]">
                  {f.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-[#F8FAFC]">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="cara-kerja" className="mx-auto max-w-3xl px-6 py-32 md:px-10">
          <h2 className="reveal font-serif-display mb-20 text-center text-4xl text-[#F8FAFC] md:text-5xl">
            Cara Kerja
          </h2>

          <div className="relative">
            <div
              className="timeline-line absolute bottom-8 left-[39px] top-8 hidden w-px origin-top border-l-2 border-dashed border-[rgba(59,130,246,0.3)] md:block"
              aria-hidden="true"
            />

            <div className="flex flex-col gap-12">
              {STEPS.map((step, i) => (
                <div
                  key={step.num}
                  className={`reveal relative flex gap-6 md:gap-10 ${["reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][i]}`}
                >
                  <span
                    className="font-serif-display pointer-events-none absolute -left-2 -top-6 text-[120px] leading-none text-white/[0.04] select-none md:-left-4"
                    aria-hidden="true"
                  >
                    {step.num}
                  </span>
                  <div className="relative z-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-[rgba(59,130,246,0.2)] bg-white/[0.03] backdrop-blur-xl">
                    <span className="font-serif-display text-3xl text-gradient">{step.num}</span>
                  </div>
                  <div className="relative z-10 flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 backdrop-blur-xl">
                    <h3 className="text-xl font-semibold text-[#F8FAFC]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
          <h2 className="reveal font-serif-display text-center text-3xl text-[#F8FAFC] md:text-4xl">
            Dipercaya profesional muda
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={t.name}
                className={`reveal rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl ${["reveal-delay-1", "reveal-delay-2", "reveal-delay-3"][i]}`}
              >
                <StarRating />
                <p className="mt-4 text-sm leading-relaxed text-[#94A3B8] italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#06B6D4] text-xs font-bold text-white">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#F8FAFC]">{t.name}</p>
                    <p className="text-xs text-[#64748B]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 pb-32 md:px-10">
          <div className="reveal cta-mesh relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-8 py-20 text-center md:px-16">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#06B6D4]/20 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="font-serif-display text-4xl text-white md:text-5xl">
                Siap mulai?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm text-white/70">
                Gratis selamanya. Data tersimpan lokal di browser — privasi kamu,
                kendali penuh di tangan kamu.
              </p>
              <Link
                href="/auth"
                className="mt-8 inline-flex items-center rounded-full bg-white px-10 py-4 text-sm font-semibold text-[#050A18] transition hover:bg-white/90 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]"
              >
                Mulai Gratis Sekarang
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/[0.06] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="font-serif-display text-lg text-[#64748B]">Vale</span>
          <p className="text-xs text-[#475569]">
            © {new Date().getFullYear()} Vale. Kenali kemana uangmu pergi.
          </p>
        </div>
      </footer>
    </div>
  );
}
