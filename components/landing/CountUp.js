"use client";

import { useEffect, useRef, useState } from "react";

export default function CountUp({
  end,
  suffix = "",
  prefix = "",
  duration = 1500,
  className = "",
}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;

    const numericEnd = Number(String(end).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numericEnd)) return;

    let startTime = null;
    let frameId = null;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.floor(numericEnd * eased));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [started, end, duration]);

  const displaySuffix = String(end).includes("+")
    ? "+"
    : String(end).includes("%")
      ? "%"
      : suffix;

  return (
    <span ref={ref} className={className}>
      {prefix}
      {started ? value.toLocaleString("id-ID") : "0"}
      {displaySuffix}
    </span>
  );
}
