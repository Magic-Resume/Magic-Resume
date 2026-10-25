import { tool } from 'langchain';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { z } from 'zod';
export const notesSchema = z.object({
  notes: z
    .array(
      z.object({
        section: z.string().min(1),
        itemId: z.string().min(1),
        fieldKey: z.string().min(1),
        why: z.string().trim().min(1).max(500),
      }),
    )
    .min(1)
    .max(80),
});
export function createExplainChanges() {
  return tool(
    async (input, config) => {
      await dispatchCustomEvent('resume_change_notes', input, config);
      return `${input.notes.length} field-specific reasons are ready for review. Do not repeat the notes in chat.`;
    },
    {
      name: 'explain_changes',
      description:
        'Before the final resume write, explain each changed field with its original section, itemId and fieldKey plus one concrete reason. Do not add notes for unchanged fields.',
      schema: notesSchema,
    },
  );
}
