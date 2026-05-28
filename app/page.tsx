import Link from "next/link";
import Navbar from "../components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-20 md:px-10 md:py-28">
        <section className="max-w-3xl space-y-8">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-[#1B4332] md:text-6xl">
            Tau Kemana Uang Kamu Pergi
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl">
            Upload bank statement dari semua bank Indonesia, kami analisa
            spending kamu dan kasih insight untuk hidup lebih hemat.
          </p>

          <Link
            href="/upload"
            className="inline-flex items-center rounded-full bg-[#1B4332] px-7 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#163728] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332] focus-visible:ring-offset-2"
          >
            Coba Gratis Sekarang
          </Link>
        </section>
      </main>
    </div>
  );
}
