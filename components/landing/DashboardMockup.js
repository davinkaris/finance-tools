"use client";

export default function DashboardMockup() {
  const bars = [42, 68, 55, 82, 48, 74, 60, 88];

  return (
    <div className="relative mx-auto mt-16 w-full max-w-2xl px-4 md:mt-0">
      <div
        className="vale-float-card relative rotate-[2deg] rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_0_80px_rgba(16,185,129,0.15)] backdrop-blur-xl md:p-8"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-white/40 uppercase">
              Dashboard
            </p>
            <p className="font-serif-display mt-1 text-xl text-white">Februari 2026</p>
          </div>
          <span className="rounded-full bg-[#10b981]/20 px-3 py-1 text-xs font-medium text-[#10b981]">
            Live
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { emoji: "💰", label: "Pemasukan", value: "Rp 15.5 jt", color: "text-[#10b981]" },
            { emoji: "💸", label: "Pengeluaran", value: "Rp 8.2 jt", color: "text-red-400" },
            { emoji: "📈", label: "Tabungan", value: "Rp 7.3 jt", color: "text-[#10b981]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <p className="text-xs text-white/40">
                {stat.emoji} {stat.label}
              </p>
              <p className={`mt-1 text-sm font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="mb-4 text-xs text-white/40">Pengeluaran per Kategori</p>
          <div className="flex h-20 items-end justify-between gap-2">
            {bars.map((height, index) => (
              <div
                key={index}
                className="vale-bar-grow w-full max-w-[28px] rounded-t bg-gradient-to-t from-[#10b981]/80 to-[#10b981]/30"
                style={{
                  height: `${height}%`,
                  animationDelay: `${index * 0.08}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="vale-fade-left absolute -left-4 top-8 z-10 max-w-[220px] rounded-xl border border-white/10 border-l-[3px] border-l-[#10b981] bg-white/[0.06] p-4 shadow-lg backdrop-blur-xl md:-left-16 md:max-w-[260px]">
        <p className="text-xs font-semibold text-[#10b981]">✨ AI Insight</p>
        <p className="mt-1 text-sm leading-snug text-white/70">
          Pengeluaran F&amp;B kamu naik 23%
        </p>
      </div>

      <div className="vale-fade-right absolute -right-4 bottom-8 z-10 max-w-[220px] rounded-xl border border-white/10 bg-white/[0.06] p-4 shadow-lg backdrop-blur-xl md:-right-16 md:max-w-[260px]">
        <p className="text-xs font-semibold text-[#10b981]">🎯 Goal tercapai!</p>
        <p className="mt-1 text-sm leading-snug text-white/70">
          Saving rate bulan ini 47%
        </p>
      </div>
    </div>
  );
}
