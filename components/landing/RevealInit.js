"use client";

import { useEffect } from "react";

export default function RevealInit() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    const counters = document.querySelectorAll("[data-counter]");
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = Number(el.dataset.counter);
          const suffix = el.dataset.suffix || "";
          if (!Number.isFinite(target)) return;

          let current = 0;
          const steps = 60;
          const increment = target / steps;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              clearInterval(timer);
              current = target;
            }
            el.textContent =
              suffix === "%"
                ? `${Math.floor(current)}%`
                : `${Math.floor(current).toLocaleString("id-ID")}${suffix}`;
          }, 16);

          counterObserver.unobserve(el);
        });
      },
      { threshold: 0.5 },
    );

    counters.forEach((el) => counterObserver.observe(el));

    return () => {
      observer.disconnect();
      counterObserver.disconnect();
    };
  }, []);

  return null;
}
