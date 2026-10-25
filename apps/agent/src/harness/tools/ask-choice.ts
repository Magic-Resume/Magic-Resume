import { tool } from 'langchain';
import { choiceSchema } from './widgets.js';
export function createAskChoice() {
  return tool(
    async (input) => {
      if (!input.values?.choice)
        return 'No user choice was submitted. Continue conservatively without assuming an answer.';
      return `User choice: ${input.values.choice}\nContinue the selected work without asking this question again.`;
    },
    {
      name: 'ask_choice',
      description:
        'Pause for one required decision with 2-6 concise options. Use request_form for predefined fact collection. recommended is an optional zero-based index. Never supply values; they are injected after the user answers.',
      schema: choiceSchema,
    },
  );
}
