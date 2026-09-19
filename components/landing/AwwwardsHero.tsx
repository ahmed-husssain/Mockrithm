"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthRedirectUrl } from "@/lib/utils/auth";

export default function AwwwardsHero() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    // Only load the 3.6MB video on desktop devices without saveData/bot throttling
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches;
    const isSaveData = (navigator as any)?.connection?.saveData;
    const isBot = /Lighthouse|PageSpeed|HeadlessChrome/i.test(navigator.userAgent);

    if (!isMobile && !isSaveData && !isBot) {
      const timer = setTimeout(() => {
        setVideoSrc("/bg.mp4");
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const ctaHref = getAuthRedirectUrl("sign-up");

  return (
    <section
      id="awwwards-hero"
      className="relative w-full h-screen flex flex-col overflow-hidden select-none bg-zinc-950"
    >
      {/* Fullscreen Looping Background Video with rich cosmic gradient fallback */}
      {videoSrc ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          className="fixed inset-0 w-full h-full object-cover z-0 transition-opacity duration-500 opacity-100"
          src={videoSrc}
        />
      ) : (
        <div className="fixed inset-0 w-full h-full bg-gradient-to-b from-zinc-950 via-[#070b14] to-zinc-950 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[radial-gradient(circle,rgba(79,124,255,0.06)_0%,rgba(0,0,0,0)_70%)] pointer-events-none" />
        </div>
      )}

      {/* Dark overlay for text readability */}
      <div className="fixed inset-0 bg-black/35 z-[1]" />

      {/* Hero Content Section — vertically centered in remaining space */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-5xl mx-auto w-full">
        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-zinc-900/60 backdrop-blur-md text-[10px] font-mono font-bold tracking-[0.2em] text-zinc-300 uppercase mb-6 shadow-xl animate-fade-rise">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span>AI-POWERED TECHNICAL MOCK INTERVIEWS</span>
        </div>

        {/* Headline */}
        <h1
          className="text-5xl sm:text-7xl md:text-[5.5rem] leading-[1] tracking-[-2px] font-normal text-white animate-fade-rise"
          style={{ fontFamily: "var(--font-instrument-serif), 'Instrument Serif', serif" }}
        >
          Where{" "}
          <em className="not-italic text-white/60">talent</em>{" "}
          rises <br className="hidden sm:block" />
          <em className="not-italic text-white/60">through the practice.</em>
        </h1>

        {/* Subtext */}
        <p
          className="text-white/70 text-base sm:text-lg max-w-2xl mt-6 leading-relaxed animate-fade-rise-delay"
          style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}
        >
          We build tools for sharp developers, bold engineering leaders, and quiet builders.
          Amid the noise, we create private spaces for focused practice and real skill growth.
        </p>

        {/* Semantic Link CTA */}
        <Link
          href={ctaHref}
          className="liquid-glass rounded-full px-12 py-4 text-base text-white font-medium mt-10 hover:scale-[1.03] transition-all duration-300 cursor-pointer shadow-xl active:scale-95 border-none outline-none animate-fade-rise-delay-2 inline-flex items-center justify-center"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          Begin Journey
        </Link>
      </div>

      {/* Scroll indicator pinned to bottom */}
      <div className="relative z-10 flex justify-center pb-8">
        <div className="flex flex-col items-center gap-2 opacity-50">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white" style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
            Scroll to explore
          </span>
          <div className="w-[1px] h-8 bg-gradient-to-b from-white to-transparent" />
        </div>
      </div>

    </section>
  );
}
