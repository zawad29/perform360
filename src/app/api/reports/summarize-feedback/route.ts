import { NextRequest, NextResponse } from "next/server";
import { generateWithConfig, OllamaConfig } from "@/lib/ollama";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/crypto-utils";
import { DIRECTION_LABELS, type Direction } from "@/lib/directions";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    // Load company Ollama settings
    const company = await prisma.company.findUnique({
      where: { id: authResult.companyId },
      select: { settings: true },
    });

    const settings = company?.settings as Record<string, unknown> | null;
    const ollama = settings?.ollama as Record<string, string> | undefined;

    if (!ollama?.apiUrl || !ollama?.model) {
      return NextResponse.json(
        { success: false, error: "AI not configured. Ask your admin to set up Ollama in Settings > AI." },
        { status: 400 }
      );
    }

    const ollamaConfig: OllamaConfig = {
      apiUrl: ollama.apiUrl,
      apiKey: ollama.apiKey ? decryptApiKey(ollama.apiKey) : "",
      model: ollama.model,
    };

    const { feedback } = (await req.json()) as {
      feedback: { questionText: string; direction: Direction; text: string }[];
    };

    if (!feedback || feedback.length === 0) {
      return NextResponse.json(
        { success: false, error: "No feedback provided" },
        { status: 400 }
      );
    }

    // Build a structured prompt from the feedback entries
    const feedbackBlock = feedback
      .map(
        (f, i) =>
          `[${i + 1}] (${DIRECTION_LABELS[f.direction]}) Q: "${f.questionText}"\n   "${f.text}"`
      )
      .join("\n\n");

    const prompt = `You are reading ${feedback.length} pieces of 360-degree feedback about an employee. Read all of them carefully, then write a professional executive summary.

FEEDBACK:
${feedbackBlock}

Respond with ONLY a valid JSON object (no markdown fences, no extra text) using this exact shape:

{
  "keyThemes": "...",
  "strengths": "...",
  "growthAreas": "...",
  "notableQuotes": "..."
}

Field instructions:
- keyThemes: Identify the 2-3 strongest patterns that emerge across the feedback and explain how they connect to each other. One flowing paragraph (3-5 sentences).
- strengths: Describe what this person does well according to their reviewers, linking related strengths into a coherent picture. One flowing paragraph (3-5 sentences).
- growthAreas: Discuss where reviewers see room for development, framing suggestions constructively and explaining the potential impact. One flowing paragraph (3-5 sentences).
- notableQuotes: Reference 1-2 specific phrases from the feedback that best capture the overall sentiment, weaving them naturally into a sentence. One flowing paragraph (3-5 sentences).

Rules:
- Under 250 words total across all four fields
- Plain text only — no bullets, lists, blockquotes, bold, or special formatting inside the values
- Each paragraph should flow naturally as if written by a single author, not stitched together
- Do not invent anything not present in the feedback
- Do not identify individual reviewers`;

    const system =
      "You are a senior HR analyst writing executive summaries of 360-degree performance reviews. Write in a natural, professional narrative voice — each paragraph should read as a cohesive story, not a collection of separate observations. Always respond with raw JSON only — no markdown, no code fences, no surrounding text.";

    const raw = await generateWithConfig(ollamaConfig, prompt, system, {
      temperature: 0.4,
      numPredict: 1024,
      numCtx: 4096,
    });

    // Extract JSON from the response (handles possible markdown fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI response did not contain valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      keyThemes: string;
      strengths: string;
      growthAreas: string;
      notableQuotes: string;
    };

    const summary = raw;
    const sections: { heading: string; content: string }[] = [
      { heading: "Key Themes", content: parsed.keyThemes },
      { heading: "Strengths", content: parsed.strengths },
      { heading: "Growth Areas", content: parsed.growthAreas },
      { heading: "Notable Quotes", content: parsed.notableQuotes },
    ];

    return NextResponse.json({ success: true, summary, sections });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[Feedback Summarize]", raw);
    return NextResponse.json(
      { success: false, error: "AI summarization is currently unavailable. Please try again later." },
      { status: 500 }
    );
  }
}
