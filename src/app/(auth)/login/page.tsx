"use client";

import { useState, useEffect, useCallback } from "react";
import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { ArrowRight, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";

const COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const isDisabled = isLoading || cooldown > 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isDisabled) return;
      setIsLoading(true);
      setError("");

      try {
        const res = await fetch("/api/auth/verify-and-signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 429) {
            setError("Too many attempts. Please wait before trying again.");
            setCooldown(COOLDOWN_SECONDS);
          } else {
            setError(data.error || "No account found with this email. Please check or register.");
          }
        } else {
          setCooldown(COOLDOWN_SECONDS);
          window.location.href = "/verify";
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [email, isDisabled]
  );


  return (
    <div className="space-y-8">
      {/* Mobile-only logo */}
      <div className="flex items-center lg:hidden">
        <Logo />
      </div>

      <div className="text-left">
        <h1 className="text-[11px] font-medium tracking-widest uppercase text-gray-900">Welcome back</h1>
        <p className="text-body text-gray-500 mt-2">
          Sign in to your account to continue
        </p>
      </div>

      <Card padding="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="email"
            label="Email address"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button type="submit" className="w-full gap-2" disabled={isDisabled}>
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Sending link...
              </>
            ) : cooldown > 0 ? (
              <>
                <Clock size={16} strokeWidth={2} />
                Retry in {cooldown}s
              </>
            ) : (
              <>
                Continue with Email
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100" />
          </div>
          <div className="relative flex justify-start text-[12px]">
            <span className="bg-white pr-3 text-gray-400 uppercase tracking-wider text-[10px]">
              passwordless sign-in via magic link
            </span>
          </div>
        </div>

        <p className="text-[13px] text-gray-400">
          A secure link will be sent to your email.
          <br />
          No password needed.
        </p>
      </Card>

    </div>
  );
}
