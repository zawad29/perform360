"use client";

import { use, useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Shield, Loader2, AlertCircle } from "lucide-react";

interface TokenData {
  reviewerEmailMasked: string;
  cycleName: string;
  totalAssignments: number;
  pendingAssignments: number;
}

export default function ReviewOTPPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
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

  // Check for existing valid session first (skip OTP if still valid)
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch(`/api/review/${params.token}/assignments`);
        if (res.ok) {
          // Session is valid — skip OTP and go straight to assignments
          router.replace(`/review/${params.token}/assignments`);
          return;
        }
      } catch {
        // No valid session — continue to OTP flow
      }
      setIsCheckingSession(false);
    }
    checkSession();
  }, [params.token, router]);

  const sendOTP = useCallback(async () => {
    setIsSending(true);
    setError("");
    try {
      const res = await fetch(`/api/review/${params.token}/otp/send`, {
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

  // Validate token on mount (after session check)
  useEffect(() => {
    if (isCheckingSession) return;

    async function validate() {
      try {
        const res = await fetch(`/api/review/${params.token}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setTokenError(data.error || "Invalid review link");
          return;
        }
        setTokenData(data.data);
        setIsValidating(false);
      } catch {
        setTokenError("Failed to validate review link");
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
      const res = await fetch(`/api/review/${params.token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/review/${params.token}/assignments`);
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
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-gray-900 animate-spin" />
          <p className="text-[14px] text-gray-900">Checking session...</p>
        </div>
      </div>
    );
  }

  // Token validation error
  if (tokenError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] space-y-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-white border border-gray-900 flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={28} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <h1 className="text-title text-gray-900 uppercase tracking-tight">Evaluations Unavailable</h1>
            <p className="text-body text-gray-500 mt-2">{tokenError}</p>
          </div>
        </div>
      </div>
    );
  }

  // Token still validating
  if (isValidating) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-gray-900 animate-spin" />
          <p className="text-[14px] text-gray-900">Validating review link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-3 py-4 sm:p-4">
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
            <p><span className="font-medium text-gray-900">{tokenData.cycleName}</span></p>
            <p>{tokenData.pendingAssignments} of {tokenData.totalAssignments} evaluation{tokenData.totalAssignments === 1 ? "" : "s"} pending</p>
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
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
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
                    className="w-9 h-11 sm:w-12 sm:h-14 text-center text-[16px] sm:text-[20px] font-semibold border border-gray-900 bg-white focus:outline focus:outline-2 focus:outline-[#E63946] focus:outline-offset-2 disabled:opacity-50"
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {error && (
                <p className="text-[13px] text-gray-900 text-center">{error}</p>
              )}

              {cooldown > 0 && (
                <p className="text-[13px] text-gray-900 text-center">
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
