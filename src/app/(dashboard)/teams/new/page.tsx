"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

export default function NewTeamPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/teams/${data.data.id}`);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Create Team" description="Set up a new team in your organization" />

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="name"
            label="Team Name"
            placeholder="e.g. Engineering"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="space-y-1.5">
            <label htmlFor="description" className="block text-[13px] font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              placeholder="Brief description of this team..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 bg-white text-body placeholder:text-gray-400 focus:outline-none focus:outline-2 focus:outline-accent focus:outline-offset-2 resize-none"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Team"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
