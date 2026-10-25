/** Stable semantic keys consumed by the editor's localized tool chips. */
export const TOOL_DISPLAY: Readonly<
  Record<string, { verb: string; icon: string }>
> = {
  read_resume: { verb: 'read', icon: 'read' },
  analyze_resume: { verb: 'analyze', icon: 'analyze' },
  evaluate_fit: { verb: 'evaluate', icon: 'analyze' },
  explain_changes: { verb: 'explain', icon: 'analyze' },
  push_ui: { verb: 'show', icon: 'card' },
  request_form: { verb: 'ask', icon: 'ask' },
  ask_choice: { verb: 'ask', icon: 'ask' },
  read_file: { verb: 'read', icon: 'read' },
  write_file: { verb: 'write', icon: 'write' },
  edit_file: { verb: 'edit', icon: 'edit' },
  delete_file: { verb: 'edit', icon: 'edit' },
  ls: { verb: 'browse', icon: 'read' },
  glob: { verb: 'browse', icon: 'read' },
  grep: { verb: 'search', icon: 'search' },
  write_todos: { verb: 'plan', icon: 'plan' },
  task: { verb: 'delegate', icon: 'delegate' },
};
