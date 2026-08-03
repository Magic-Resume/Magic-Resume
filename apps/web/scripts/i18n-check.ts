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
];
const ATTRIBUTES_TO_CHECK = ['placeholder', 'title', 'alt', 'label'];

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
        if (expression.getText() === 't') {
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

  // 辅助检查是否忽略
  function shouldIgnore(node: Node): boolean {
    const fullText = node.getSourceFile().getFullText();
    const lineEnd = node.getEnd();
    const lineText = fullText.substring(0, lineEnd).split('\n').pop() || '';
    const nextText = fullText.substring(lineEnd).split('\n')[0] || '';
    return lineText.includes('i18n-ignore') || nextText.includes('i18n-ignore');
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
