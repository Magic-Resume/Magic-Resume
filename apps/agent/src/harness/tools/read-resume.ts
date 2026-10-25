import { tool } from 'langchain';
import { z } from 'zod';
import { resumeMarkdown, type ResumeReader } from './reader.js';
export function createReadResume(read: ResumeReader) {
  return tool(
    async (_input, config) => {
      const resume = await read(config);
      return JSON.stringify({
        resume,
        markdown: resumeMarkdown(resume),
        path: '/workspace/resume.json',
      });
    },
    {
      name: 'read_resume',
      description:
        'Read the current workspace resume as exact JSON and a readable Markdown view. Use the JSON source for edits; the browser reviews all proposed changes.',
      schema: z.object({}),
    },
  );
}
