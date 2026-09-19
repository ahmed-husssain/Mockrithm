"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthRedirectUrl } from "@/lib/utils/auth";

export default function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const [docsHref, setDocsHref] = useState("https://docs.mockrithm.me");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    if (typeof window !== "undefined" && window.location.hostname.includes("localhost")) {
      setDocsHref("/documentation");
    }

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Automatically close mobile menu upon navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Interview", href: "/interview" },
    { label: "Games", href: "https://games.mockrithm.me" },
    { label: "Resume", href: "https://resume.mockrithm.me" },
    { label: "Docs", href: docsHref },
    { label: "Blog", href: "/blog" },
    { label: "About", href: "/about" },
    { label: "Reach Us", href: "/about#contact" },
  ];

  const ctaHref = getAuthRedirectUrl("sign-up");

  return (
    <nav 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out border-b",
        scrolled || mobileMenuOpen
          ? "bg-black/80 backdrop-blur-xl border-white/10 py-3 shadow-lg" 
          : "bg-transparent border-transparent py-5"
      )}
    >
      <div className="w-full max-w-7xl mx-auto px-6 md:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/"
          className="text-2xl md:text-3xl tracking-tight text-white select-none cursor-pointer"
          style={{ fontFamily: "var(--font-instrument-serif), 'Instrument Serif', serif" }}
        >
          Mockrithm<sup className="text-[10px] align-super">®</sup>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.label}
                href={link.href} 
                className={cn(
                  "transition-colors duration-200",
                  isActive 
                    ? "text-white font-semibold drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]" 
                    : "text-white/60 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Desktop CTA & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <Link
            href={ctaHref}
            className="hidden sm:inline-flex liquid-glass rounded-full px-5 py-2 text-sm text-white font-medium hover:scale-[1.03] transition-all duration-300 cursor-pointer shadow-lg active:scale-95 border-none outline-none items-center justify-center select-none"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Begin Journey
          </Link>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-xl text-white/80 hover:text-white bg-white/5 border border-white/10 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-2xl px-6 py-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-3 font-medium text-base">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "py-2 px-3 rounded-lg transition-all",
                    isActive
                      ? "text-white bg-white/10 font-semibold"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <Link
              href={ctaHref}
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-3 rounded-full bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-all shadow-lg active:scale-95"
            >
              Begin Journey
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
