"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import {
  Shield,
  Key,
  RotateCcw,
  AlertTriangle,
  FileText,
  Copy,
  Download,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface EncryptionStatus {
  isSetup: boolean;
  setupAt: string | null;
  keyVersion: number;
  remainingRecoveryCodes: number;
}

export default function EncryptionSettingsPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Change passphrase state
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  // Recovery state
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryNewPassphrase, setRecoveryNewPassphrase] = useState("");
  const [recoveryConfirmPassphrase, setRecoveryConfirmPassphrase] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);

  // Regenerate dialog state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regeneratePassphrase, setRegeneratePassphrase] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Key rotation state
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [rotatePassphrase, setRotatePassphrase] = useState("");
  const [isRotating, setIsRotating] = useState(false);
  const [_rotationJobId, setRotationJobId] = useState<string | null>(null);
  const [rotationStatus, setRotationStatus] = useState<"idle" | "processing" | "completed" | "failed">("idle");

  // Hard reset state
  const [showHardResetDialog, setShowHardResetDialog] = useState(false);
  const [hardResetPassphrase, setHardResetPassphrase] = useState("");
  const [hardResetConfirmPassphrase, setHardResetConfirmPassphrase] = useState("");
  const [hardResetConfirmationText, setHardResetConfirmationText] = useState("");
  const [isHardResetting, setIsHardResetting] = useState(false);
  const [hardResetCodes, setHardResetCodes] = useState<string[]>([]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/encryption/status");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStatus(data.data);
      }
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleChangePassphrase(e: React.FormEvent) {
    e.preventDefault();
    setIsChanging(true);
    try {
      const res = await fetch("/api/encryption/change-passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassphrase,
          newPassphrase,
          confirmNewPassphrase: confirmPassphrase,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast("Passphrase updated successfully", "success");
        setCurrentPassphrase("");
        setNewPassphrase("");
        setConfirmPassphrase("");
      } else {
        addToast(data.error || "Failed to update passphrase", "error");
      }
    } catch {
      addToast("Network error", "error");
    } finally {
      setIsChanging(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setIsRecovering(true);
    try {
      const res = await fetch("/api/encryption/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recoveryCode,
          newPassphrase: recoveryNewPassphrase,
          confirmNewPassphrase: recoveryConfirmPassphrase,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast("Passphrase reset successfully using recovery code", "success");
        setRecoveryCode("");
        setRecoveryNewPassphrase("");
        setRecoveryConfirmPassphrase("");
        fetchStatus();
      } else {
        addToast(data.error || "Recovery failed", "error");
      }
    } catch {
      addToast("Network error", "error");
    } finally {
      setIsRecovering(false);
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/encryption/recovery-codes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: regeneratePassphrase }),
      });
      const data = await res.json();
      if (data.success) {
        setNewCodes(data.data.recoveryCodes);
        fetchStatus();
      } else {
        addToast(data.error || "Failed to regenerate codes", "error");
      }
    } catch {
      addToast("Network error", "error");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function copyCodes(codes: string[]) {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    addToast("Recovery codes copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCodes(codes: string[]) {
    const content = [
      "Performs360 — Encryption Recovery Codes",
      "Generated: " + new Date().toISOString(),
      "",
      "IMPORTANT: Store these codes in a secure location.",
      "Each code can only be used once.",
      "",
      ...codes.map((code, i) => `${i + 1}. ${code}`),
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "performs360-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleHardReset() {
    setIsHardResetting(true);
    try {
      const res = await fetch("/api/encryption/hard-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassphrase: hardResetPassphrase,
          confirmNewPassphrase: hardResetConfirmPassphrase,
          confirmationText: hardResetConfirmationText,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setHardResetCodes(data.data.recoveryCodes);
        setHardResetPassphrase("");
        setHardResetConfirmPassphrase("");
        setHardResetConfirmationText("");
        setRotationStatus("idle");
        addToast("Encryption hard reset complete. Previous encrypted data is no longer readable.", "warning");
        fetchStatus();
      } else {
        addToast(data.error || "Failed to hard reset encryption", "error");
      }
    } catch {
      addToast("Network error", "error");
    } finally {
      setIsHardResetting(false);
    }
  }

  async function handleRotateKey() {
    setIsRotating(true);
    try {
      const res = await fetch("/api/encryption/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: rotatePassphrase }),
      });
      const data = await res.json();
      if (data.success) {
        setRotationJobId(data.data.jobId);
        setRotationStatus("processing");
        pollJobStatus(data.data.jobId);
        if (data.data.recoveryCodesInvalidated) {
          addToast("Recovery codes invalidated — please regenerate them", "warning");
        }
      } else {
        addToast(data.error || "Failed to start key rotation", "error");
        setIsRotating(false);
      }
    } catch {
      addToast("Network error", "error");
      setIsRotating(false);
    }
  }

  function pollJobStatus(jobId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (!data.success) return;

        const { status: jobStatus } = data.data;
        if (jobStatus === "COMPLETED") {
          clearInterval(interval);
          setRotationStatus("completed");
          setIsRotating(false);
          addToast("Key rotation completed successfully", "success");
          fetchStatus();
        } else if (jobStatus === "DEAD") {
          clearInterval(interval);
          setRotationStatus("failed");
          setIsRotating(false);
          addToast(data.data.lastError || "Key rotation failed", "error");
        }
      } catch {
        clearInterval(interval);
        setRotationStatus("failed");
        setIsRotating(false);
      }
    }, 2000);
  }

  if (isLoadingStatus) {
    return (
      <div>
        <PageHeader title="Encryption Settings" description="Manage your organization's encryption keys and passphrase" />
        <div className="space-y-6 max-w-3xl">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  if (!status?.isSetup) {
    return (
      <div>
        <PageHeader title="Encryption Settings" description="Manage your organization's encryption keys and passphrase" />
        <Card className="max-w-3xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <AlertTriangle size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Encryption Not Set Up</CardTitle>
                <CardDescription>You need to set up encryption before evaluation data can be protected</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="mt-4">
            <Link href="/setup-encryption">
              <Button>Set Up Encryption</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Encryption Settings" description="Manage your organization's encryption keys and passphrase" />

      {/* Warning Banner */}
      <div className="flex gap-3 p-4 border border-gray-900 mb-6 max-w-3xl">
        <AlertTriangle size={20} strokeWidth={1.5} className="text-gray-900 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[14px] font-medium text-gray-900">Critical Security Information</p>
          <p className="text-[13px] text-gray-900 mt-1 leading-relaxed">
            If you lose your encryption passphrase and all recovery codes, evaluation data will be permanently unrecoverable. There is no backdoor. Store your passphrase and recovery codes securely.
          </p>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Encryption Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <Shield size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Encryption Status</CardTitle>
                <CardDescription>AES-256-GCM encryption is active</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-[12px] text-gray-500 uppercase tracking-wider">Algorithm</p>
              <p className="text-[14px] font-medium text-gray-900 mt-1">AES-256-GCM</p>
            </div>
            <div>
              <p className="text-[12px] text-gray-500 uppercase tracking-wider">Key Version</p>
              <p className="text-[14px] font-medium text-gray-900 mt-1">v{status.keyVersion}</p>
            </div>
            <div>
              <p className="text-[12px] text-gray-500 uppercase tracking-wider">Set Up</p>
              <p className="text-[14px] font-medium text-gray-900 mt-1">
                {status.setupAt ? formatDate(new Date(status.setupAt)) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-gray-500 uppercase tracking-wider">Status</p>
              <Badge variant="success" className="mt-1">Active</Badge>
            </div>
          </div>
        </Card>

        {/* Change Passphrase */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <Key size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Change Passphrase</CardTitle>
                <CardDescription>Update your encryption passphrase. You must know your current passphrase.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form className="space-y-4 mt-4" onSubmit={handleChangePassphrase}>
            <Input
              id="current-passphrase"
              label="Current Passphrase"
              type="password"
              placeholder="Enter current passphrase"
              value={currentPassphrase}
              onChange={(e) => setCurrentPassphrase(e.target.value)}
            />
            <Input
              id="new-passphrase"
              label="New Passphrase"
              type="password"
              placeholder="Enter new passphrase (12+ characters)"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
            />
            <Input
              id="confirm-passphrase"
              label="Confirm New Passphrase"
              type="password"
              placeholder="Confirm new passphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              error={confirmPassphrase && newPassphrase !== confirmPassphrase ? "Passphrases do not match" : undefined}
            />
            <Button
              type="submit"
              disabled={
                !currentPassphrase ||
                newPassphrase.length < 12 ||
                newPassphrase !== confirmPassphrase ||
                isChanging
              }
            >
              {isChanging ? "Updating..." : "Update Passphrase"}
            </Button>
          </form>
        </Card>

        {/* Recovery Codes */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <FileText size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Recovery Codes</CardTitle>
                <CardDescription>
                  Recovery codes let you reset your passphrase if you forget it.
                  You have {status.remainingRecoveryCodes} of 8 codes remaining.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge variant={status.remainingRecoveryCodes > 2 ? "success" : status.remainingRecoveryCodes > 0 ? "warning" : "error"}>
              {status.remainingRecoveryCodes} remaining
            </Badge>
            <Button variant="secondary" onClick={() => { setShowRegenerateDialog(true); setNewCodes([]); setRegeneratePassphrase(""); }}>
              Regenerate Recovery Codes
            </Button>
          </div>
        </Card>

        {/* Forgot Passphrase */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <AlertTriangle size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Forgot Passphrase?</CardTitle>
                <CardDescription>Use a recovery code to set a new encryption passphrase</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form className="space-y-4 mt-4" onSubmit={handleRecover}>
            <Input
              id="recovery-code"
              label="Recovery Code"
              type="text"
              placeholder="XXXXX-XXXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />
            <Input
              id="recovery-new-passphrase"
              label="New Passphrase"
              type="password"
              placeholder="Enter new passphrase (12+ characters)"
              value={recoveryNewPassphrase}
              onChange={(e) => setRecoveryNewPassphrase(e.target.value)}
            />
            <Input
              id="recovery-confirm-passphrase"
              label="Confirm New Passphrase"
              type="password"
              placeholder="Confirm new passphrase"
              value={recoveryConfirmPassphrase}
              onChange={(e) => setRecoveryConfirmPassphrase(e.target.value)}
              error={recoveryConfirmPassphrase && recoveryNewPassphrase !== recoveryConfirmPassphrase ? "Passphrases do not match" : undefined}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={
                !recoveryCode ||
                recoveryNewPassphrase.length < 12 ||
                recoveryNewPassphrase !== recoveryConfirmPassphrase ||
                isRecovering
              }
            >
              {isRecovering ? "Recovering..." : "Reset Passphrase with Recovery Code"}
            </Button>
          </form>
        </Card>

        {/* Key Rotation */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <RotateCcw size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Key Rotation</CardTitle>
                <CardDescription>Rotate the data encryption key. All existing data will be re-encrypted with the new key in the background.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="mt-4">
            {rotationStatus === "processing" ? (
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 border-2 border-gray-900 border-t-transparent animate-spin" />
                <p className="text-[14px] text-gray-600">Re-encrypting data with new key...</p>
              </div>
            ) : rotationStatus === "completed" ? (
              <div className="flex items-center gap-3">
                <Badge variant="success">Rotation Complete</Badge>
                <p className="text-[13px] text-gray-500">Now at key version v{status?.keyVersion}</p>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => { setShowRotateDialog(true); setRotatePassphrase(""); setRotationStatus("idle"); }}
              >
                Rotate Encryption Key
              </Button>
            )}
            {rotationStatus === "failed" && (
              <p className="text-[13px] text-gray-900 mt-2">Rotation failed. Please try again.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div>
                <AlertTriangle size={20} strokeWidth={1.5} className="text-gray-900" />
              </div>
              <div>
                <CardTitle>Hard Reset Encryption</CardTitle>
                <CardDescription>
                  Start fresh with a brand-new encryption key and passphrase. Existing encrypted responses will become unreadable.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="mt-4 space-y-4">
            <div className="flex gap-3 p-3 border border-gray-900">
              <AlertTriangle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0 mt-0.5" />
              <div className="text-[13px] text-gray-900 space-y-1">
                <p className="font-medium">Use this only if you cannot recover the current passphrase.</p>
                <p>Old encrypted report data will remain in the database but can no longer be decrypted.</p>
                <p>Active cycles will continue, but new submissions will use the new encryption key.</p>
              </div>
            </div>
            <Button
              variant="danger"
              className="text-red-600"
              onClick={() => {
                setShowHardResetDialog(true);
                setHardResetPassphrase("");
                setHardResetConfirmPassphrase("");
                setHardResetConfirmationText("");
                setHardResetCodes([]);
              }}
            >
              Hard Reset Encryption
            </Button>
          </div>
        </Card>
      </div>

      {/* Regenerate Recovery Codes Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newCodes.length > 0 ? "New Recovery Codes" : "Regenerate Recovery Codes"}
            </DialogTitle>
            <DialogDescription>
              {newCodes.length > 0
                ? "Save these new codes in a secure location. This is the only time they will be displayed."
                : "This will invalidate all existing recovery codes. Enter your passphrase to confirm."
              }
            </DialogDescription>
          </DialogHeader>

          {newCodes.length > 0 ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {newCodes.map((code, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 bg-gray-50 border border-gray-900 font-mono text-[13px] sm:text-[14px] text-gray-800 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="secondary" onClick={() => copyCodes(newCodes)} className="flex-1">
                  <Copy size={16} strokeWidth={1.5} className="mr-2" />
                  {copied ? "Copied!" : "Copy All"}
                </Button>
                <Button variant="secondary" onClick={() => downloadCodes(newCodes)} className="flex-1">
                  <Download size={16} strokeWidth={1.5} className="mr-2" />
                  Download
                </Button>
              </div>
              <Button onClick={() => setShowRegenerateDialog(false)} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="flex gap-3 p-3 border border-gray-900">
                <AlertTriangle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-gray-900">
                  All existing recovery codes will be invalidated. Make sure you no longer need them.
                </p>
              </div>
              <Input
                id="regenerate-passphrase"
                label="Current Passphrase"
                type="password"
                placeholder="Enter your passphrase to confirm"
                value={regeneratePassphrase}
                onChange={(e) => setRegeneratePassphrase(e.target.value)}
              />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowRegenerateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerate}
                  disabled={!regeneratePassphrase || isRegenerating}
                  className="flex-1"
                >
                  {isRegenerating ? "Generating..." : "Regenerate Codes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Key Rotation Confirmation Dialog */}
      <Dialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate Encryption Key</DialogTitle>
            <DialogDescription>
              This will generate a new data encryption key and re-encrypt all existing evaluation responses in the background.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex gap-3 p-3 border border-gray-900">
              <AlertTriangle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0 mt-0.5" />
              <div className="text-[13px] text-gray-900 space-y-1">
                <p className="font-medium">This action will:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Generate a new AES-256 data key</li>
                  <li>Re-encrypt all responses in the background</li>
                  <li>Invalidate all existing recovery codes</li>
                </ul>
              </div>
            </div>
            <Input
              id="rotate-passphrase"
              label="Current Passphrase"
              type="password"
              placeholder="Enter your passphrase to confirm"
              value={rotatePassphrase}
              onChange={(e) => setRotatePassphrase(e.target.value)}
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowRotateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => { setShowRotateDialog(false); handleRotateKey(); }}
                disabled={!rotatePassphrase || isRotating}
                className="flex-1"
              >
                {isRotating ? "Starting..." : "Rotate Key"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHardResetDialog} onOpenChange={setShowHardResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hardResetCodes.length > 0 ? "New Recovery Codes" : "Hard Reset Encryption"}
            </DialogTitle>
            <DialogDescription>
              {hardResetCodes.length > 0
                ? "Save these recovery codes now. This is the only time they will be shown."
                : "This creates a new encryption key and passphrase without the old one. Previously encrypted responses will become unreadable."}
            </DialogDescription>
          </DialogHeader>

          {hardResetCodes.length > 0 ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {hardResetCodes.map((code, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 bg-gray-50 border border-gray-900 font-mono text-[13px] sm:text-[14px] text-gray-800 text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="secondary" onClick={() => copyCodes(hardResetCodes)} className="flex-1">
                  <Copy size={16} strokeWidth={1.5} className="mr-2" />
                  {copied ? "Copied!" : "Copy All"}
                </Button>
                <Button variant="secondary" onClick={() => downloadCodes(hardResetCodes)} className="flex-1">
                  <Download size={16} strokeWidth={1.5} className="mr-2" />
                  Download
                </Button>
              </div>
              <Button
                onClick={() => {
                  setShowHardResetDialog(false);
                  setHardResetCodes([]);
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="flex gap-3 p-3 border border-gray-900">
                <AlertTriangle size={16} strokeWidth={1.5} className="text-gray-900 flex-shrink-0 mt-0.5" />
                <div className="text-[13px] text-gray-900 space-y-1">
                  <p className="font-medium">This action will:</p>
                  <p>Generate a brand-new data encryption key and passphrase.</p>
                  <p>Invalidate your current unlock session and replace all recovery codes.</p>
                  <p>Make existing encrypted responses permanently unreadable.</p>
                </div>
              </div>
              <Input
                id="hard-reset-passphrase"
                label="New Passphrase"
                type="password"
                placeholder="Enter new passphrase (12+ characters)"
                value={hardResetPassphrase}
                onChange={(e) => setHardResetPassphrase(e.target.value)}
              />
              <Input
                id="hard-reset-confirm-passphrase"
                label="Confirm New Passphrase"
                type="password"
                placeholder="Confirm new passphrase"
                value={hardResetConfirmPassphrase}
                onChange={(e) => setHardResetConfirmPassphrase(e.target.value)}
                error={hardResetConfirmPassphrase && hardResetPassphrase !== hardResetConfirmPassphrase ? "Passphrases do not match" : undefined}
              />
              <Input
                id="hard-reset-confirmation-text"
                label='Type "RESET ENCRYPTION" to Confirm'
                type="text"
                placeholder="RESET ENCRYPTION"
                value={hardResetConfirmationText}
                onChange={(e) => setHardResetConfirmationText(e.target.value)}
              />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowHardResetDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  className="flex-1 text-red-600"
                  onClick={handleHardReset}
                  disabled={
                    hardResetPassphrase.length < 12 ||
                    hardResetPassphrase !== hardResetConfirmPassphrase ||
                    hardResetConfirmationText.trim() !== "RESET ENCRYPTION" ||
                    isHardResetting
                  }
                >
                  {isHardResetting ? "Resetting..." : "Permanently Reset Encryption"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
