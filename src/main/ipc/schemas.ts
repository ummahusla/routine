import { z } from "zod";

export const SessionIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const CreateInputSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    model: z.string().min(1).max(80).optional(),
  })
  .strict();

export const OpenInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const SendInputSchema = z
  .object({
    sessionId: SessionIdSchema,
    prompt: z.string().min(1).max(200_000),
  })
  .strict();

export const CancelInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const ClearInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const RenameInputSchema = z
  .object({ sessionId: SessionIdSchema, title: z.string().min(1).max(120) })
  .strict();

export const DeleteInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const WatchInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const UnwatchInputSchema = z
  .object({ subscriptionId: z.string().min(1).max(64) })
  .strict();

export type CreateInput = z.infer<typeof CreateInputSchema>;
export type OpenInput = z.infer<typeof OpenInputSchema>;
export type SendInput = z.infer<typeof SendInputSchema>;
export type CancelInput = z.infer<typeof CancelInputSchema>;
export type ClearInput = z.infer<typeof ClearInputSchema>;
export type RenameInput = z.infer<typeof RenameInputSchema>;
export type DeleteInput = z.infer<typeof DeleteInputSchema>;
export type WatchInput = z.infer<typeof WatchInputSchema>;
export type UnwatchInput = z.infer<typeof UnwatchInputSchema>;
