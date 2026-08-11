import { Project, SyntaxKind, Node, JsxText, JsxAttribute, CallExpression } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// --- 配置 ---
const LOCALES_DIR = path.join(process.cwd(), 'src/locales');
const SCAN_DIR = path.join(process.cwd(), 'src');
const LANGUAGES = ['en', 'zh'];
const IGNORE_PATTERNS = [
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/node_modules/**',
  // 法务文档不走 i18n 键。一份隐私政策 / 用户协议 / 退款政策是一个整体的、
  // 需要逐句复核的法律文本,不是一袋可替换的字符串——把它拆成 key 再由另一份
  // 翻译拼回来,等于让机器改写法律承诺。要做多语言就整份另写并各自送审。
  'src/app/legal/**',
  // 语言包本身就是文案，不是硬编码。
  'src/locales/**',
];
const ATTRIBUTES_TO_CHECK = ['placeholder', 'title', 'alt', 'label'];

/**
 * CJK 字面量的冻结基线：`{ 文件: 条数 }`。
 *
 * 补上「JSX 之外的中文字面量」这条规则，一次点亮了六百多处存量——把它们全部当成 CI
 * 失败，只会让所有人第一天就把这个检查关掉。所以只做**棘轮**：某个文件的条数只能减、
 * 不能增，新文件一条都不许有。
 *
 * 里面有相当一部分永远不该被翻译（学校 / 专业 / 岗位词典是数据，不是文案）。它们留在
 * 基线里就好——基线是「今天的事实」，不是「待办清单」。
 *
 * 条数取的是「所有在途分支的逐文件最大值」，不是当前 master 的快照：基线偏松只是少拦一次，
 * 偏紧却会让一条与 i18n 毫无关系的 PR 在合并时莫名其妙地红——那正是让人去关掉检查的那种失败。
 */
const CJK_BASELINE_FILE = path.join(process.cwd(), 'scripts/i18n-cjk-baseline.json');

// --- 类型 ---
interface I18nError {
  file: string;
  line: number;
  message: string;
  type: 'MISSING_KEY' | 'HARDCODED_TEXT';
}

// --- 工具函数 ---
function flattenObject(obj: any, prefix = ''): Set<string> {
  let keys = new Set<string>();
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = new Set([...keys, ...flattenObject(obj[key], fullKey)]);
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function isLikelyHardcoded(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return false;
  // 排除全是数字、符号的情况
  if (/^[0-9\s!@#$%^&*()_+={}\[\]:;"'<>,.?/\\|`~-]+$/.test(trimmed)) return false;
  // 排除明显的 Tailwind 类名或颜色值
  if (trimmed.includes(' ') && trimmed.split(' ').every(s => /^[a-z0-9-]+$/.test(s))) return false;
  return true;
}

// --- 核心逻辑 ---
async function run() {
  console.log('🚀 Starting i18n validation check...');

  // 1. 加载翻译文件
  const translationKeys: Record<string, Set<string>> = {};
  for (const lang of LANGUAGES) {
    const filePath = path.join(LOCALES_DIR, lang, 'translation.json');
    if (fs.existsSync(filePath)) {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      translationKeys[lang] = flattenObject(content);
    } else {
      console.warn(`⚠️ Warning: Translation file not found for ${lang}: ${filePath}`);
    }
  }

  // 2. 初始化 ts-morph
  const project = new Project();
  const args = process.argv.slice(2);
  let filesToScan: string[] = [];

  if (args.length > 0) {
    // 增量模式 (lint-staged)
    filesToScan = args.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
    console.log(`Checking ${filesToScan.length} staged files...`);
  } else {
    // 全量模式
    filesToScan = glob.sync('src/**/*.{ts,tsx}', { ignore: IGNORE_PATTERNS });
    console.log(`Checking ${filesToScan.length} files in src...`);
  }

  project.addSourceFilesAtPaths(filesToScan);
  const errors: I18nError[] = [];

  // 3. 扫描文件
  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = path.relative(process.cwd(), sourceFile.getFilePath());

    sourceFile.forEachDescendant(node => {
      // A. 检查 t('key') 调用
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression();
        // `t(...)`、`i18n.t(...)`、`i18next.t(...)` 都是取键——只认第一种，会漏掉
        // 整片以实例方式调用的代码。
        if (/^(t|i18n\.t|i18next\.t)$/.test(expression.getText())) {
          const args = node.getArguments();
          if (args.length > 0 && Node.isStringLiteral(args[0])) {
            const key = args[0].getText().replace(/['"]/g, '');
            checkKey(key, node, relativePath);
          }
        }
      }

      // B. 检查 <Trans i18nKey="key" />
      if (Node.isJsxAttribute(node) && node.getNameNode().getText() === 'i18nKey') {
        const initializer = node.getInitializer();
        if (Node.isStringLiteral(initializer)) {
          const key = initializer.getText().replace(/['"]/g, '');
          checkKey(key, node, relativePath);
        }
      }

      // C. 检查 JSX 文本
      if (Node.isJsxText(node)) {
        const text = node.getText();
        if (isLikelyHardcoded(text) || hasChinese(text)) {
          if (!shouldIgnore(node)) {
            errors.push({
              file: relativePath,
              line: node.getStartLineNumber(),
              type: 'HARDCODED_TEXT',
              message: `Hardcoded JSX text: "${text.trim()}"`
            });
          }
        }
      }

      // E. JSX 之外的 CJK 字面量
      //
      // 这是本检查最大的一个盲区：它此前只看 JSX 文本、4 个白名单属性和字面量 `t('...')`，
      // 从不看普通的 `StringLiteral`。于是 `_components/ai/` 整片、以及 BFF、services 里
      // 所有写在 `const msg = '账户额度不足…'` 这种位置的中文，CI 一声都不响。
      if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.getLiteralText();
        if (hasChinese(text) && !isTranslationSite(node) && !shouldIgnore(node)) {
          errors.push({
            file: relativePath,
            line: node.getStartLineNumber(),
            type: 'HARDCODED_TEXT',
            message: `Hardcoded CJK string: "${text.trim().slice(0, 60)}"`
          });
        }
      }

      // D. 检查特定属性
      if (Node.isJsxAttribute(node) && ATTRIBUTES_TO_CHECK.includes(node.getNameNode().getText())) {
        const initializer = node.getInitializer();
        if (Node.isStringLiteral(initializer)) {
          const text = initializer.getLiteralText();
          if (isLikelyHardcoded(text) || hasChinese(text)) {
            if (!shouldIgnore(node)) {
              errors.push({
                file: relativePath,
                line: node.getStartLineNumber(),
                type: 'HARDCODED_TEXT',
                message: `Hardcoded attribute ${node.getNameNode().getText()}: "${text}"`
              });
            }
          }
        }
      }
    });
  }

  // 辅助验证 Key
  function checkKey(key: string, node: Node, file: string) {
    for (const lang of LANGUAGES) {
      if (translationKeys[lang] && !translationKeys[lang].has(key)) {
        errors.push({
          file,
          line: node.getStartLineNumber(),
          type: 'MISSING_KEY',
          message: `Missing key "${key}" in ${lang}/translation.json`
        });
      }
    }
  }

  /**
   * 这个字面量本身就是「翻译」的一部分吗。
   *
   * `t('key', { defaultValue: '中文' })` 里的兜底文案、以及 `i18n-ignore` 标注过的地方，
   * 都不算硬编码——前者已经在 i18n 体系内，后者是刻意的（比如根布局崩溃时那一档，
   * 它不能依赖 i18n，因为 i18n 可能正是崩掉的那个）。
   */
  function isTranslationSite(node: Node): boolean {
    let current: Node | undefined = node.getParent();
    let depth = 0;
    while (current && depth < 4) {
      if (Node.isCallExpression(current)) {
        return /(^|\.)t$/.test(current.getExpression().getText());
      }
      // 只穿过对象字面量与属性赋值（defaultValue 的形状），不无限上溯。
      if (
        !Node.isObjectLiteralExpression(current) &&
        !Node.isPropertyAssignment(current)
      ) {
        return false;
      }
      current = current.getParent();
      depth += 1;
    }
    return false;
  }

  // 辅助检查是否忽略
  function shouldIgnore(node: Node): boolean {
    const fullText = node.getSourceFile().getFullText();
    const lineEnd = node.getEnd();
    const lineText = fullText.substring(0, lineEnd).split('\n').pop() || '';
    const nextText = fullText.substring(lineEnd).split('\n')[0] || '';
    return lineText.includes('i18n-ignore') || nextText.includes('i18n-ignore');
  }

  // 3.5 CJK 字面量走冻结基线：只减不增，而不是一次性把六百多处存量变成 CI 失败。
  const cjkErrors = errors.filter(e => e.message.startsWith('Hardcoded CJK string'));
  const cjkCounts: Record<string, number> = {};
  for (const e of cjkErrors) cjkCounts[e.file] = (cjkCounts[e.file] ?? 0) + 1;

  if (process.env.I18N_WRITE_BASELINE === '1') {
    fs.writeFileSync(CJK_BASELINE_FILE, JSON.stringify(cjkCounts, null, 2) + '\n');
    console.log(`\n📌 CJK baseline written: ${Object.keys(cjkCounts).length} files, ${cjkErrors.length} entries\n`);
    process.exit(0);
  }

  const baseline: Record<string, number> = fs.existsSync(CJK_BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(CJK_BASELINE_FILE, 'utf-8'))
    : {};

  const regressions: I18nError[] = [];
  for (const [file, count] of Object.entries(cjkCounts)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) {
      regressions.push({
        file,
        line: cjkErrors.find(e => e.file === file)?.line ?? 0,
        type: 'HARDCODED_TEXT',
        message: allowed === 0
          ? `新文件出现 ${count} 处硬编码中文——请走 t('...')，或在该行标注 i18n-ignore`
          : `硬编码中文从 ${allowed} 涨到 ${count} 处；基线只减不增`,
      });
    }
  }

  // 基线压住的那些不计为失败，但要说出被压住了多少——静默截断读起来像「全都干净」。
  const filtered = errors.filter(e => !e.message.startsWith('Hardcoded CJK string'));
  errors.length = 0;
  errors.push(...filtered, ...regressions);
  if (cjkErrors.length > 0) {
    console.log(`\nℹ️  ${cjkErrors.length} 处存量硬编码中文在基线内（scripts/i18n-cjk-baseline.json），本次不计为失败。`);
  }

  // 4. 输出结果与记录日志
  const logDir = path.join(process.cwd(), 'scripts/i18n-logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'scan.md');
  const now = new Date().toLocaleString();

  if (errors.length > 0) {
    console.error(`\n❌ Found ${errors.length} i18n issues:\n`);
    
    let logContent = `# i18n Scan Report (${now})\n\nFound ${errors.length} issues in ${Object.keys(errors.reduce((a, c) => ({...a, [c.file]: 1}), {})).length} files.\n\n`;

    const grouped = errors.reduce((acc, err) => {
      acc[err.file] = acc[err.file] || [];
      acc[err.file].push(err);
      return acc;
    }, {} as Record<string, I18nError[]>);

    for (const file in grouped) {
      console.error(`📄 ${file}`);
      logContent += `## 📄 ${file}\n\n`;
      
      grouped[file].sort((a, b) => a.line - b.line).forEach(err => {
        const output = `  L${err.line}: [${err.type}] ${err.message}`;
        console.error(output);
        logContent += `- L${err.line}: **[${err.type}]** ${err.message}\n`;
      });
      console.error('');
      logContent += '\n';
    }

    fs.writeFileSync(logFile, logContent);
    console.log(`\n📝 Detailed log saved to: ${logFile}\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All i18n checks passed!\n');
    const logContent = `# i18n Scan Report (${now})\n\n✅ All checks passed! No issues found.`;
    fs.writeFileSync(logFile, logContent);
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal error during i18n check:', err);
  process.exit(1);
});
