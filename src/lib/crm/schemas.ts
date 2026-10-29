import { z } from "zod";
const id = z.string().uuid();
const name = z.string().trim().min(2).max(120);
const phone = z.string().trim().max(40).default("");
const email = z
  .union([z.literal(""), z.string().trim().email().max(120)])
  .default("");
const plan = z.string().trim().max(80).default("");
export const createClientSchema = z.object({
  name,
  phone,
  email,
  plan,
  confirmDuplicate: z.boolean().default(false),
});
export const updateClientSchema = z.object({
  id,
  name,
  phone,
  email,
  plan,
  category: z.enum(["client", "friend", "family"]),
  status: z.enum(["active", "frozen", "cancelled"]),
  notes: z.string().trim().max(2000).default(""),
});
export const crmActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...createClientSchema.shape }),
  z.object({ action: z.literal("update"), ...updateClientSchema.shape }),
  z
    .object({
      action: z.literal("check-in"),
      id,
      source: z.enum(["manual", "qr"]),
      token: id.optional(),
    })
    .refine((d) => d.source !== "qr" || !!d.token),
  z.object({ action: z.literal("find-card"), token: id }),
  z.object({ action: z.literal("rotate-card"), id }),
  z
    .object({
      action: z.literal("payment"),
      id,
      requestId: id,
      amount: z.number().positive().max(99999999).multipleOf(0.01),
      currency: z.enum(["NIO", "USD"]),
      method: z.string().min(1).max(80),
      account: z.string().min(1).max(80),
      concept: z.string().trim().min(2).max(200),
      fx: z.number().positive().max(10000).multipleOf(0.0001),
      // Opcional: sin plan el cobro sigue siendo genérico y no crea vigencia.
      planId: z.string().min(1).max(64).optional(),
    })
    .refine((d) => d.currency !== "NIO" || d.fx === 1),
]);
