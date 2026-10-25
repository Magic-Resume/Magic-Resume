import { tool } from 'langchain';
import { formSchema } from './widgets.js';
export function createRequestForm() {
  return tool(
    async (input) => {
      if (!input.values)
        return 'No submitted values were received. Ask for the missing information in text; do not fabricate it.';
      return `User-submitted ${input.formKind} data:\n${JSON.stringify(input.values)}\nContinue the requested work using this evidence. A skipped or empty field must remain unknown.`;
    },
    {
      name: 'request_form',
      description:
        'Pause to collect required facts in a predefined form. Use job_info for a missing JD, target_language for translation, or create_target, create_inventory, create_education, create_experience, create_project, create_skills for guided creation. One form at a time; allow skips. Never fill values yourself; only human submission supplies values.',
      schema: formSchema,
    },
  );
}
