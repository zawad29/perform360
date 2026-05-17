"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Joyride, STATUS } from "react-joyride";
import type { EventData, Step } from "react-joyride";
import { getStepsForPath } from "./tourSteps";

function OwlMascot({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 64 72"
      width="64"
      height="72"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="owl-body-grad" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#3a3a3a" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </radialGradient>
        <radialGradient id="owl-belly-grad" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#f5f0e8" />
          <stop offset="100%" stopColor="#e8e0d0" />
        </radialGradient>
        <radialGradient id="eye-left-grad" cx="38%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f0f0" />
        </radialGradient>
        <radialGradient id="eye-right-grad" cx="38%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f0f0" />
        </radialGradient>
        <radialGradient id="pupil-grad" cx="35%" cy="32%" r="55%">
          <stop offset="0%" stopColor="#2a1a0a" />
          <stop offset="100%" stopColor="#0d0d0d" />
        </radialGradient>
        <filter id="owl-shadow" x="-15%" y="-8%" width="130%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#00000030" />
        </filter>
        <filter id="eye-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#E6394640" />
        </filter>
      </defs>

      {/* ── Body ── */}
      <ellipse
        cx="32" cy="46"
        rx="22" ry="24"
        fill="url(#owl-body-grad)"
        filter="url(#owl-shadow)"
      />

      {/* ── Wings (slightly behind body) ── */}
      <ellipse cx="10" cy="50" rx="10" ry="14" fill="#262626" transform="rotate(-12 10 50)" />
      <ellipse cx="54" cy="50" rx="10" ry="14" fill="#262626" transform="rotate(12 54 50)" />

      {/* ── Wing feather texture lines ── */}
      <path d="M5 44 Q8 48 7 54" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M8 42 Q11 47 10 53" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M59 44 Q56 48 57 54" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M56 42 Q53 47 54 53" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />

      {/* ── Belly patch ── */}
      <ellipse cx="32" cy="52" rx="13" ry="15" fill="url(#owl-belly-grad)" />

      {/* ── Belly feather scallops ── */}
      <path d="M22 46 Q26 42 30 46 Q34 42 38 46 Q42 42 42 46" stroke="#ddd8cc" strokeWidth="0.7" fill="none" strokeLinecap="round" />
      <path d="M21 52 Q25 48 29 52 Q32 48 35 52 Q39 48 43 52" stroke="#ddd8cc" strokeWidth="0.7" fill="none" strokeLinecap="round" />
      <path d="M22 58 Q26 54 30 58 Q34 54 38 58 Q42 54 42 58" stroke="#ddd8cc" strokeWidth="0.7" fill="none" strokeLinecap="round" />

      {/* ── Ear tufts ── */}
      <path d="M18 24 L14 10 L22 20 Z" fill="#2a2a2a" />
      <path d="M46 24 L50 10 L42 20 Z" fill="#2a2a2a" />
      {/* Tuft highlight */}
      <path d="M16 20 L14.5 11 L19 18" stroke="#3d3d3d" strokeWidth="0.8" fill="none" />
      <path d="M48 20 L49.5 11 L45 18" stroke="#3d3d3d" strokeWidth="0.8" fill="none" />

      {/* ── Eye rings (accent) ── */}
      <circle cx="23" cy="30" r="9.5" fill="#E63946" />
      <circle cx="41" cy="30" r="9.5" fill="#E63946" />
      {/* Slight inner ring */}
      <circle cx="23" cy="30" r="8.2" fill="#cc2f3b" />
      <circle cx="41" cy="30" r="8.2" fill="#cc2f3b" />

      {/* ── Eyeballs ── */}
      <circle cx="23" cy="30" r="7" fill="url(#eye-left-grad)" filter="url(#eye-glow)" />
      <circle cx="41" cy="30" r="7" fill="url(#eye-right-grad)" filter="url(#eye-glow)" />

      {/* ── Pupils ── */}
      <circle cx="23" cy="30" r={active ? "3.8" : "3"} fill="url(#pupil-grad)" />
      <circle cx="41" cy="30" r={active ? "3.8" : "3"} fill="url(#pupil-grad)" />

      {/* ── Iris ring ── */}
      <circle cx="23" cy="30" r={active ? "5" : "4.2"} fill="none" stroke="#c0640a" strokeWidth="0.8" opacity="0.6" />
      <circle cx="41" cy="30" r={active ? "5" : "4.2"} fill="none" stroke="#c0640a" strokeWidth="0.8" opacity="0.6" />

      {/* ── Eye glints ── */}
      <circle cx="25" cy="28" r="1.5" fill="white" opacity="0.9" />
      <circle cx="43" cy="28" r="1.5" fill="white" opacity="0.9" />
      <circle cx="21.5" cy="31.5" r="0.6" fill="white" opacity="0.5" />
      <circle cx="39.5" cy="31.5" r="0.6" fill="white" opacity="0.5" />

      {/* ── Beak ── */}
      <path d="M29 36 L32 42 L35 36 Q32 33 29 36 Z" fill="#d4870a" />
      <path d="M29 36 L32 39 L35 36" stroke="#b8720a" strokeWidth="0.6" fill="none" />
      <path d="M30 36.5 Q32 34.5 34 36.5" fill="#e8960c" stroke="none" />

      {/* ── Feet ── */}
      <g fill="#d4870a">
        <path d="M25 68 Q23 64 22 62 Q24 63 26 62 Q27 64 26 68 Z" />
        <path d="M27 68 Q26 63 27 61 Q29 63 30 61 Q30 64 29 68 Z" />
        <path d="M29 68 Q30 63 31 61 Q33 63 33 61 Q33 64 32 68 Z" />
        <path d="M35 68 Q34 64 35 62 Q37 63 38 62 Q38 64 36 68 Z" />
        <path d="M37 68 Q38 63 39 61 Q41 63 41 61 Q41 64 40 68 Z" />
      </g>
    </svg>
  );
}

export function GuideButton() {
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [activeSteps, setActiveSteps] = useState<Step[]>([]);
  const [hovered, setHovered] = useState(false);

  const handleEvent = useCallback((data: EventData) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
    }
  }, []);

  const handleStart = useCallback(() => {
    const steps = getStepsForPath(pathname);
    if (steps.length === 0) return;
    setActiveSteps(steps);
    setRun(true);
  }, [pathname]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // SSR guard: delay portal mount until client hydration is complete
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  const hasAnySteps = getStepsForPath(pathname).length > 0;
  if (!hasAnySteps || !mounted) return null;

  const ui = (
    <>
      {activeSteps.length > 0 && (
        <Joyride
          steps={activeSteps}
          run={run}
          continuous
          scrollToFirstStep
          onEvent={handleEvent}
          locale={{
            back: "← Back",
            close: "Close",
            last: "Done",
            next: "Next →",
            skip: "Skip tour",
          }}
          options={{
            buttons: ["back", "primary", "skip"],
            showProgress: true,
            backgroundColor: "#ffffff",
            overlayColor: "rgba(0, 0, 0, 0.4)",
            primaryColor: "#E63946",
            textColor: "#111111",
            zIndex: 9999,
          }}
          styles={{
            tooltip: {
              borderRadius: "0.5rem",
              padding: "1.25rem",
              maxWidth: "320px",
              fontFamily: "inherit",
            },
            tooltipTitle: {
              fontSize: "0.9375rem",
              fontWeight: 600,
              marginBottom: "0.375rem",
            },
            tooltipContent: {
              fontSize: "0.875rem",
              lineHeight: 1.55,
              padding: "0",
            },
            buttonPrimary: {
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              padding: "0.375rem 0.875rem",
              fontWeight: 500,
            },
            buttonBack: {
              fontSize: "0.875rem",
              marginRight: "0.5rem",
            },
            buttonSkip: {
              fontSize: "0.8125rem",
            },
          }}
        />
      )}

      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9998, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
        {hovered && !run && (
          <div style={{
            position: "relative",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
            padding: "10px 16px",
            fontSize: "12.5px",
            fontWeight: 500,
            color: "#1f2937",
            whiteSpace: "nowrap",
          }}>
            Hoot! Need a hand?
            <span style={{
              position: "absolute",
              bottom: "-6px",
              right: "28px",
              width: "12px",
              height: "12px",
              background: "white",
              borderRight: "1px solid #e5e7eb",
              borderBottom: "1px solid #e5e7eb",
              transform: "rotate(45deg)",
            }} />
          </div>
        )}

        <button
          onClick={handleStart}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="Start guided tour"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <span style={{
            display: "block",
            transition: "transform 200ms ease-out",
            transform: hovered ? "translateY(-6px)" : "translateY(0)",
          }}>
            <OwlMascot active={run} />
          </span>
        </button>
      </div>
    </>
  );

  return createPortal(ui, document.body);
}
