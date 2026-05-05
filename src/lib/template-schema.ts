import { z } from "zod";
import { Direction } from "@prisma/client";

export const directionEnum = z.nativeEnum(Direction);

export const directionWeightsSchema = z
  .object({
    downward: z.number().min(0).max(100),
    upward: z.number().min(0).max(100),
    lateral: z.number().min(0).max(100),
    self: z.number().min(0).max(100),
    external: z.number().min(0).max(100),
  })
  .refine(
    (w) => Math.abs(w.downward + w.upward + w.lateral + w.self + w.external - 100) < 0.01,
    { message: "Weights must sum to 100%" }
  );

export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(["rating_scale", "text", "multiple_choice"]),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  scaleLabels: z.array(z.string()).optional(),
  conditionalOn: z.string().optional(),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  directions: z.array(directionEnum).default([]),
  questions: z.array(questionSchema).min(1),
});

export type SectionInput = z.infer<typeof sectionSchema>;
export type DirectionWeightsInput = z.infer<typeof directionWeightsSchema>;
