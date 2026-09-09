const templates = await import('../dist/index.js');
const core = await import('../dist/core.js');

if (templates.templateList.length < 1 || typeof core.compile !== 'function') {
  throw new Error('resume-templates ESM import smoke failed');
}

console.log(
  `resume-templates ESM import smoke passed (${templates.templateList.length} templates).`,
);
