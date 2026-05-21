"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
  companyName: string;
  teams: { id: string; name: string; role: string }[];
}

const ROLE_BADGE_VARIANT: Record<string, "info" | "success" | "warning" | "default"> = {
  ADMIN: "info",
  HR: "success",
  MEMBER: "default",
};

const TEAM_ROLE_LABELS: Record<string, string> = {
  MANAGER: "Manager",
  MEMBER: "Member",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setProfile(json.data);
          setName(json.data.name);
        } else {
          addToast("Failed to load profile", "error");
        }
      })
      .catch(() => addToast("Failed to load profile", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("Name cannot be empty", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      setProfile((prev) => (prev ? { ...prev, name: json.data.name } : prev));
      addToast("Profile updated", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (file.size > 1024 * 1024) {
      addToast("File must be under 1 MB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      addToast("File must be an image", "error");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Upload failed");
      setProfile((prev) => (prev ? { ...prev, avatar: json.data.avatar } : prev));
      addToast("Photo uploaded", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to upload photo", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <PageHeader title="Profile" description="Manage your personal information" />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your name and profile details</CardDescription>
            </CardHeader>

            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-9 w-32" />
              </div>
            ) : profile ? (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                {/* Avatar + role */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Avatar src={profile.avatar} name={profile.name} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-headline text-gray-900">{profile.name}</p>
                      <Badge variant={ROLE_BADGE_VARIANT[profile.role] ?? "default"}>
                        {profile.role}
                      </Badge>
                    </div>
                    <p className="text-callout text-gray-500">{profile.companyName}</p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6 space-y-4">
                  <Input
                    id="profile-name"
                    label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />

                  <Input
                    id="profile-email"
                    label="Email"
                    value={profile.email}
                    disabled
                    className="opacity-60"
                  />

                  <div className="space-y-1.5">
                    <label className="block text-[14px] font-medium uppercase tracking-caps text-gray-900">Avatar</label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <Avatar src={profile.avatar} name={name || profile.name} size="lg" />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAvatarUpload(file);
                          }}
                        />
                        <Button
                          variant="secondary"
                          type="button"
                          size="sm"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploading ? "Uploading..." : "Upload Photo"}
                        </Button>
                      </div>
                    </div>
                    <p className="text-[12px] text-gray-400">PNG, JPEG, or WebP. Max 1 MB.</p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button type="submit" disabled={saving || name.trim() === profile.name}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Your Teams</CardTitle>
              <CardDescription>Teams you belong to and your role in each</CardDescription>
            </CardHeader>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : profile && profile.teams.length > 0 ? (
              <div className="space-y-2">
                {profile.teams.map((team) => (
                  <Link key={team.id} href={`/teams/${team.id}`}>
                    <div className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 border border-gray-900 flex items-center justify-center">
                          <Users size={16} strokeWidth={1.5} className="text-gray-500" />
                        </div>
                        <p className="text-body font-medium text-gray-900">{team.name}</p>
                      </div>
                      <Badge variant="outline">
                        {TEAM_ROLE_LABELS[team.role] ?? team.role}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No teams yet"
                description="You are not a member of any teams yet."
                compact
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
