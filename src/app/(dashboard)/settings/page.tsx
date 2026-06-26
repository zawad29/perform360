"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Image from "next/image";
import Link from "next/link";
import { UpdateBanner } from "@/components/system/update-banner";
import {
  CheckCircle2,
  Download,
  FileArchive,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
} from "lucide-react";

interface NotificationSettings {
  evaluationInvitations: boolean;
  cycleCompletion: boolean;
}

interface ImportSummary {
  designationsCreated: number;
  designationsExisted: number;
  usersCreated: number;
  usersExisted: number;
  usersUpdated: number;
  teamsCreated: number;
  teamsExisted: number;
  membershipsCreated: number;
  membershipsExisted: number;
  templatesCreated: number;
  templatesUpdated: number;
  cyclesCreated: number;
  assignmentsCreated: number;
  warnings: string[];
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  evaluationInvitations: true,
  cycleCompletion: true,
};

interface OllamaSettings {
  apiUrl: string;
  apiKey: string;
  model: string;
}

interface CompanySettings {
  notifications?: NotificationSettings;
  ollama?: OllamaSettings;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  settings: CompanySettings | null;
}

const NOTIFICATION_ITEMS: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: "evaluationInvitations", label: "Evaluation invitations", description: "Notify reviewers when assigned a new evaluation" },
  { key: "cycleCompletion", label: "Cycle completion", description: "Notify admins when a cycle reaches 100% completion" },
];

const IMPORT_RESULT_ORDER: (keyof Omit<ImportSummary, "warnings">)[] = [
  "usersCreated",
  "usersUpdated",
  "teamsCreated",
  "membershipsCreated",
  "templatesCreated",
  "templatesUpdated",
  "cyclesCreated",
  "assignmentsCreated",
  "designationsCreated",
  "designationsExisted",
  "usersExisted",
  "teamsExisted",
  "membershipsExisted",
];

const IMPORT_RESULT_LABELS: Record<(typeof IMPORT_RESULT_ORDER)[number], string> = {
  usersCreated: "People added",
  usersUpdated: "People refreshed",
  teamsCreated: "Teams added",
  membershipsCreated: "Team placements added",
  templatesCreated: "Templates added",
  templatesUpdated: "Templates refreshed",
  cyclesCreated: "Review cycles added",
  assignmentsCreated: "Assignments prepared",
  designationsCreated: "Titles added",
  designationsExisted: "Titles already in place",
  usersExisted: "People already in place",
  teamsExisted: "Teams already in place",
  membershipsExisted: "Team placements already in place",
};

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportingData, setExportingData] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size: number; parameterSize?: string }[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [savingOllama, setSavingOllama] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetch("/api/company")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setCompany(json.data);
          setCompanyName(json.data.name);
          setCompanySlug(json.data.slug);
          const saved = json.data.settings?.notifications;
          setNotifications(saved ? { ...DEFAULT_NOTIFICATIONS, ...saved } : DEFAULT_NOTIFICATIONS);
          const ollamaSaved = json.data.settings?.ollama;
          if (ollamaSaved) {
            setOllamaUrl(ollamaSaved.apiUrl ?? "");
            setOllamaApiKey("");
            setOllamaModel(ollamaSaved.model ?? "");
          }
        }
      })
      .catch(() => addToast("Failed to load company settings", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const validateSlug = (value: string): boolean => {
    if (value.length < 2) {
      setSlugError("Slug must be at least 2 characters");
      return false;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      return false;
    }
    setSlugError("");
    return true;
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setCompanySlug(sanitized);
    if (sanitized) validateSlug(sanitized);
    else setSlugError("");
  };

  const handleSaveProfile = async () => {
    if (!companyName.trim()) {
      addToast("Company name is required", "error");
      return;
    }
    if (!validateSlug(companySlug)) return;

    setSavingProfile(true);
    try {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName.trim(), slug: companySlug }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      setCompany(json.data);
      addToast("Company profile updated", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 1024 * 1024) {
      addToast("File must be under 1 MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      addToast("File must be an image", "error");
      return;
    }
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/company/logo", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Upload failed");
      setCompany(json.data);
      addToast("Logo uploaded", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to upload logo", "error");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogoRemove = async () => {
    setUploadingLogo(true);
    try {
      const res = await fetch("/api/company/logo", { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to remove logo");
      setCompany(json.data);
      addToast("Logo removed", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to remove logo", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleToggleNotification = (key: keyof NotificationSettings) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveNotifications = async () => {
    setSavingNotifications(true);
    try {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { notifications } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      setCompany(json.data);
      addToast("Notification preferences saved", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save preferences", "error");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleFetchModels = async () => {
    if (!ollamaUrl.trim()) {
      addToast("Enter the Ollama API URL first", "error");
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch("/api/company/ollama-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl: ollamaUrl.trim(), apiKey: ollamaApiKey || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setOllamaModels(json.models);
      if (json.models.length === 0) {
        addToast("No models found — pull a model to your Ollama instance first", "error");
      } else {
        addToast(`Found ${json.models.length} model(s)`, "success");
        if (!ollamaModel && json.models.length > 0) {
          setOllamaModel(json.models[0].name);
        }
      }
    } catch (err) {
      setOllamaModels([]);
      addToast(err instanceof Error ? err.message : "Failed to fetch models", "error");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveOllama = async () => {
    if (!ollamaUrl.trim() || !ollamaModel.trim()) {
      addToast("API URL and Model are required", "error");
      return;
    }
    setSavingOllama(true);
    try {
      const ollamaPayload: Record<string, string> = {
        apiUrl: ollamaUrl.trim(),
        model: ollamaModel.trim(),
      };
      // Only send apiKey if user entered a new one
      if (ollamaApiKey) {
        ollamaPayload.apiKey = ollamaApiKey;
      }
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { ollama: ollamaPayload } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      setCompany(json.data);
      setOllamaApiKey("");
      addToast("AI settings saved", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save AI settings", "error");
    } finally {
      setSavingOllama(false);
    }
  };


  const handleExportData = async () => {
    if (!exportPassphrase) {
      addToast("Passphrase is required", "error");
      return;
    }

    setExportingData(true);
    try {
      const res = await fetch("/api/company/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: exportPassphrase }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Failed to start data export");
      }

      addToast("Export started — check your email shortly", "success");
      setShowExportDialog(false);
      setExportPassphrase("");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to start data export", "error");
    } finally {
      setExportingData(false);
    }
  };

  const handleDownloadImportTemplate = async () => {
    try {
      const res = await fetch("/api/import/company/example");
      if (!res.ok) throw new Error("Failed to fetch template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "company-import-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to download template", "error");
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setImportFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/company", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Import failed");
      setImportResult(json.data as ImportSummary);
      addToast("Import complete", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  const profileDirty =
    company !== null && (companyName !== company.name || companySlug !== company.slug);

  const notificationsDirty =
    company !== null &&
    NOTIFICATION_ITEMS.some(
      ({ key }) => notifications[key] !== (company.settings?.notifications?.[key] ?? true)
    );

  return (
    <div>
      <PageHeader title="Settings" description="Manage your organization settings" />

      <UpdateBanner />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="import-export">Import / Export</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Basic information about your organization</CardDescription>
            </CardHeader>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full " />
                <Skeleton className="h-10 w-full " />
                <Skeleton className="h-9 w-32" />
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveProfile();
                }}
              >
                <Input
                  id="company-name"
                  label="Company Name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  maxLength={100}
                />
                <div>
                  <Input
                    id="company-slug"
                    label="URL Slug"
                    value={companySlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    maxLength={50}
                    aria-invalid={!!slugError || undefined}
                    aria-describedby={slugError ? "company-slug-error" : undefined}
                  />
                  {slugError && (
                    <p id="company-slug-error" role="alert" className="mt-1 text-[12px] text-gray-900">{slugError}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">Logo</label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {company?.logo ? (
                      <Image
                        src={company.logo}
                        alt={`${companyName} logo`}
                        width={64}
                        height={64}
                        className="w-16 h-16 object-cover bg-gray-100"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-50 border border-gray-900 flex items-center justify-center text-[24px] font-bold text-gray-300">
                        {companyName.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file);
                        }}
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploadingLogo ? "Uploading..." : company?.logo ? "Change Logo" : "Upload Logo"}
                      </Button>
                      {company?.logo && (
                        <Button
                          variant="ghost"
                          type="button"
                          size="sm"
                          disabled={uploadingLogo}
                          onClick={handleLogoRemove}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[12px] text-gray-400">PNG, JPEG, WebP, or SVG. Max 1 MB.</p>
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={savingProfile || !profileDirty || !!slugError}>
                    {savingProfile ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}
          </Card>

          {/* Quick links to other settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 max-w-2xl">
            <Link href="/settings/roles" className="h-full">
              <Card className="h-full">
                <CardTitle>Roles & Permissions</CardTitle>
                <CardDescription>Manage user roles and access levels</CardDescription>
              </Card>
            </Link>
            <Link href="/settings/encryption" className="h-full">
              <Card className="h-full">
                <CardTitle>Encryption</CardTitle>
                <CardDescription>Manage encryption passphrase and keys</CardDescription>
              </Card>
            </Link>
          </div>

        </TabsContent>

        <TabsContent value="notifications">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure when and how notifications are sent</CardDescription>
            </CardHeader>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-6 w-10" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {NOTIFICATION_ITEMS.map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">{label}</p>
                      <p className="text-[12px] text-gray-500">{description}</p>
                    </div>
                    <Toggle
                      checked={notifications[key]}
                      onChange={() => handleToggleNotification(key)}
                    />
                  </div>
                ))}
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={handleSaveNotifications}
                    disabled={savingNotifications || !notificationsDirty}
                  >
                    {savingNotifications ? "Saving..." : "Save Preferences"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>
                Connect your own Ollama instance to enable AI-powered feedback summaries in reports.
              </CardDescription>
            </CardHeader>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full " />
                <Skeleton className="h-10 w-full " />
                <Skeleton className="h-10 w-full " />
                <Skeleton className="h-9 w-32" />
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveOllama();
                }}
              >
                <Input
                  id="ollama-url"
                  label="Ollama API URL"
                  placeholder="https://your-ollama-instance.com"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                />
                <Input
                  id="ollama-api-key"
                  label="API Key (optional)"
                  type="password"
                  placeholder={company?.settings?.ollama?.apiKey ? "Saved (enter new value to change)" : "Leave blank if not required"}
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                />
                <div className="space-y-1.5">
                  <label htmlFor="ollama-model" className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">Model</label>
                  <div className="flex gap-2">
                    {ollamaModels.length > 0 ? (
                      <select
                        id="ollama-model"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        className="flex-1 h-9 border border-gray-900 bg-white px-3 text-[13px] text-gray-900 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2"
                      >
                        <option value="">Select a model</option>
                        {ollamaModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name}{m.parameterSize ? ` (${m.parameterSize})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id="ollama-model"
                        placeholder="Fetch models or type manually"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                      />
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={fetchingModels || !ollamaUrl.trim()}
                      onClick={handleFetchModels}
                    >
                      {fetchingModels ? "Fetching..." : "Fetch Models"}
                    </Button>
                  </div>
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={savingOllama || (!ollamaUrl.trim() || !ollamaModel.trim())}>
                    {savingOllama ? "Saving..." : "Save AI Settings"}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="import-export" className="space-y-6">
          <div className="max-w-3xl space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <FileSpreadsheet size={20} strokeWidth={1.5} className="text-gray-900" />
                  </div>
                  <div>
                    <CardTitle>Import Records</CardTitle>
                    <CardDescription>
                      Add or refresh people, teams, titles, templates, and optional review cycles from one template file.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-gray-900">1. Download template</p>
                    <p className="mt-1 text-[13px] text-gray-500">Start with the standard file format.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleDownloadImportTemplate}>
                    <Download size={16} className="mr-2" />
                    Download Template
                  </Button>
                </div>

                <div className="flex flex-col gap-4 border border-dashed border-gray-300 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-gray-900">2. Upload completed file</p>
                    <p className="mt-1 text-[13px] text-gray-500">Existing records are matched and updated where possible.</p>
                    <p className="mt-2 text-[12px] text-gray-400">
                      {importFileName ? `Selected: ${importFileName}` : "No file selected"}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportFile(f);
                        if (importFileRef.current) importFileRef.current.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      disabled={importing}
                      onClick={() => importFileRef.current?.click()}
                    >
                      <Upload size={16} className="mr-2" />
                      {importing ? "Processing..." : "Upload File"}
                    </Button>
                  </div>
                </div>

                {importResult && (
                  <div className="border border-gray-900">
                    <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">Import summary</p>
                        <p className="mt-1 text-[14px] text-gray-900">Latest upload completed successfully.</p>
                      </div>
                      <div className="inline-flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700">
                        <CheckCircle2 size={14} />
                        Completed
                      </div>
                    </div>

                    <div className="grid grid-cols-2 border-b border-gray-200 lg:grid-cols-4">
                      <div className="border-b border-r border-gray-200 p-4 sm:border-b-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">People added</p>
                        <p className="mt-2 text-title text-gray-900 tabular-nums">{importResult.usersCreated}</p>
                      </div>
                      <div className="border-b border-gray-200 p-4 sm:border-b-0 sm:border-r">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Teams added</p>
                        <p className="mt-2 text-title text-gray-900 tabular-nums">{importResult.teamsCreated}</p>
                      </div>
                      <div className="border-r border-gray-200 p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Templates added</p>
                        <p className="mt-2 text-title text-gray-900 tabular-nums">{importResult.templatesCreated}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Assignments prepared</p>
                        <p className="mt-2 text-title text-gray-900 tabular-nums">{importResult.assignmentsCreated}</p>
                      </div>
                    </div>

                    <div className="space-y-5 px-5 py-5">
                      <div>
                        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">Detailed results</p>
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {IMPORT_RESULT_ORDER.map((key) => (
                            <li key={key} className="flex items-center justify-between border-b border-gray-100 py-2 text-[13px] text-gray-900">
                              <span className="text-gray-500">{IMPORT_RESULT_LABELS[key]}</span>
                              <span className="font-medium tabular-nums">{importResult[key]}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center gap-2 text-gray-900">
                          <ShieldCheck size={16} />
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em]">Notes</p>
                        </div>
                        {importResult.warnings.length > 0 ? (
                          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-gray-600">
                            {importResult.warnings.map((warning, index) => (
                              <li key={`${warning}-${index}`}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-[13px] leading-6 text-gray-600">
                            No follow-up notes were generated.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <FileArchive size={20} strokeWidth={1.5} className="text-gray-900" />
                  </div>
                  <div>
                    <CardTitle>Secure Export</CardTitle>
                    <CardDescription>
                      Prepare a protected export for backup, transition planning, or controlled record sharing.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-gray-900">Prepare export</p>
                    <p className="mt-1 text-[13px] text-gray-500">
                      We verify the passphrase, prepare the export, and send it to your email.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowExportDialog(true);
                      setExportPassphrase("");
                    }}
                  >
                    Prepare Secure Export
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-500">
                    Includes company records and review data.
                  </div>
                  <div className="border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-500">
                    Requires passphrase confirmation before processing.
                  </div>
                  <div className="border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-500">
                    Delivered securely to your inbox.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prepare Secure Export</DialogTitle>
            <DialogDescription>
              Enter your encryption passphrase to prepare a secure export of your company records.
              We will send the protected file to your email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              id="export-passphrase"
              label="Encryption Passphrase"
              type="password"
              placeholder="Enter passphrase"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
            />
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowExportDialog(false);
                  setExportPassphrase("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleExportData}
                disabled={!exportPassphrase || exportingData}
                className="flex-1"
              >
                {exportingData ? "Starting export..." : "Verify & Export"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
