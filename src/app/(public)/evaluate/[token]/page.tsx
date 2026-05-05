"use client";

import { use, useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";

interface TokenData {
  subjectName: string;
  reviewerEmailMasked: string;
  cycleName: string;
  direction: Direction;
  isImpersonator: boolean;
}

export default function EvaluateOTPPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sendOTP = useCallback(async () => {
    setIsSending(true);
    setError("");
    try {
      const res = await fetch(`/api/evaluate/${params.token}/otp/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code");
      }
    } catch {
      setError("Failed to send verification code");
    } finally {
      setIsSending(false);
    }
  }, [params.token]);

  // Check for existing valid session first (skip OTP if still valid)
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch(`/api/evaluate/${params.token}/form`);
        if (res.ok) {
          router.replace(`/evaluate/${params.token}/form`);
          return;
        }
      } catch {
        // No valid session — continue to OTP flow
      }
      setIsCheckingSession(false);
    }
    checkSession();
  }, [params.token, router]);

  // Validate token on mount (after session check)
  useEffect(() => {
    if (isCheckingSession) return;

    async function validate() {
      try {
        const res = await fetch(`/api/evaluate/${params.token}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setTokenError(data.error || "Invalid evaluation link");
          return;
        }
        setTokenData(data.data);
        setIsValidating(false);
      } catch {
        setTokenError("Failed to validate evaluation link");
      }
    }
    validate();
  }, [params.token, isCheckingSession]);

  // Auto-send OTP once token is validated
  const hasSentRef = useRef(false);
  useEffect(() => {
    if (tokenData && !hasSentRef.current) {
      hasSentRef.current = true;
      sendOTP();
    }
  }, [tokenData, sendOTP]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d !== "")) {
      handleVerify(newOtp.join(""));
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newOtp = pasted.split("");
      setOtp(newOtp);
      handleVerify(pasted);
    }
  }

  async function handleVerify(code: string) {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/evaluate/${params.token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/evaluate/${params.token}/form`);
      } else {
        setError(data.error || "Invalid verification code");
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        if (data.cooldown) {
          setCooldown(data.cooldown);
          const interval = setInterval(() => {
            setCooldown((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // Checking existing session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-gray-900 animate-spin" />
          <p className="text-[14px] text-gray-900">Verifying...</p>
        </div>
      </div>
    );
  }

  // Token validation error
  if (tokenError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-gray-900 flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={28} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h1 className="text-title text-gray-900 uppercase tracking-tight">Evaluation Unavailable</h1>
            <p className="text-body text-gray-500 mt-2">{tokenError}</p>
          </div>
        </div>
      </div>
    );
  }

  // Token still validating
  if (isValidating) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-gray-900 animate-spin" />
          <p className="text-[14px] text-gray-900">Validating evaluation link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-white border border-gray-900 flex items-center justify-center mx-auto mb-6">
            <Shield size={28} strokeWidth={1.5} className="text-gray-900" />
          </div>
          <h1 className="text-title text-gray-900 uppercase tracking-tight">Verify Your Identity</h1>
          {tokenData && (
            <p className="text-body text-gray-500 mt-2">
              Enter the 6-digit code sent to {tokenData.reviewerEmailMasked}
            </p>
          )}
        </div>

        {tokenData && (
          <div className="text-center text-[13px] text-gray-500">
            <p>Evaluation for <span className="font-medium text-gray-900">{tokenData.subjectName}</span></p>
            <p>{tokenData.cycleName} &middot; {DIRECTION_LABELS[tokenData.direction] ?? tokenData.direction}</p>
          </div>
        )}

        {tokenData?.isImpersonator && (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-white border border-gray-900">
            <AlertCircle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0" />
            <p className="text-[13px] text-gray-900">
              You are submitting this review on behalf of <span className="font-medium">{tokenData.subjectName}</span> as an impersonator.
            </p>
          </div>
        )}

        <Card padding="lg">
          {isSending ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 size={24} className="text-gray-900 animate-spin" />
              <p className="text-[14px] text-gray-500">Sending verification code...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div
                className="flex justify-center gap-2 sm:gap-3"
                onPaste={handlePaste}
                role="group"
                aria-label="Verification code"
              >
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={isLoading || cooldown > 0}
                    aria-label={`Verification code digit ${index + 1}`}
                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-[18px] sm:text-[20px] font-semibold border border-gray-900 bg-white focus:outline focus:outline-2 focus:outline-[#E63946] focus:outline-offset-2 disabled:opacity-50"
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {error && (
                <p role="alert" className="text-[13px] text-gray-900 text-center">{error}</p>
              )}

              {cooldown > 0 && (
                <p role="alert" className="text-[13px] text-gray-900 text-center">
                  Too many attempts. Try again in {cooldown}s
                </p>
              )}

              <div className="text-center">
                <button
                  onClick={() => sendOTP()}
                  disabled={isSending}
                  className="text-[14px] text-gray-900 hover:text-gray-600 font-medium disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>
            </div>
          )}
        </Card>

        <p className="text-center text-[12px] text-gray-400">
          This code expires in 10 minutes. Session valid for 4 hours after verification.
        </p>
      </div>
    </div>
  );
}
