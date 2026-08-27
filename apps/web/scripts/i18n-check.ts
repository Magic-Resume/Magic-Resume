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
  // `.ts` 也要忽略：夹具里全是中文样例数据，它们不是界面文案。原来只写了 `.tsx`，
  // 所以 `app.test.ts` 一直在被扫。
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/node_modules/**',
  // 法务文档不走 i18n 键。一份隐私政策 / 用户协议 / 退款政策是一个整体的、
  // 需要逐句复核的法律文本,不是一袋可替换的字符串——把它拆成 key 再由另一份
  // 翻译拼回来,等于让机器改写法律承诺。要做多语言就整份另写并各自送审。
  'src/app/legal/**',
  // 页面元信息（SEO / OG）不是界面文案：它由 Next 的 metadata 机制按站点产出，
  // 拆成 key 再拼回来只会让搜索结果里的标题变成半成品。要多语言就整份另写。
  'src/lib/constants/metaConfig.ts',
  // 注意不要写 `s/[shareId]/**`：方括号在 glob 里是字符类，那样匹配不到这个目录。
  'src/app/s/**',
  // 模型/服务商目录里的中文是**专有名词**（「通义千问 Qwen」「火山方舟 豆包」）。
  // 翻译品牌名是错的，不是漏做。
  'src/lib/constants/modals.ts',
  // 开发期陈列 / 验收页，不进生产（组件自身 `process.env.NODE_ENV` 兜底）。
  'src/app/genui/**',
  // 与 genui 同类：仅开发环境的陈列 / 实验页，生产返回 404。
  // 它的文案是给开发者读的调试标签，不是产品 UI——翻译它没有消费方。
  'src/app/template-lab/**',
  // ⚠️ 这条**是欠账，不是例外**。
  //
  // `FORM_DEFS` 里有 80 条中文：42 条 title/label/placeholder，外加 `opts(...)` 里
  // 38 条选项文案（岗位类别、行业、资历档）。它们全部会渲染进 AI 的采集卡，英文界面下
  // 原样是中文。
  //
  // 没有一起做完，是因为那 38 条选项要的是产品措辞判断（「在校/应届」在英文里该怎么说），
  // 不是机械替换；只译一半会得到一张半中半英的表单，比现在更差。
  // 做的时候连 `opts()` 的参数一起过——只修被这份检查逮到的 42 条，等于把剩下的藏起来。
  'src/app/dashboard/edit/_components/ai/widgets/registry.ts',
];
const ATTRIBUTES_TO_CHECK = ['placeholder', 'title', 'alt', 'label'];

/**
 * 对象字面量里承载**用户可见文案**的属性名。
 *
 * 此前这份检查只看 JSX 文本和 JSX 属性，于是 `addMessage({ content: '正在读取你的简历…' })`
 * 这类完全畅通——而它渲染出来就是一条聊天消息。AI 模块里当时有 43 条这样的中文，
 * 英文界面下原样是中文，检查却一路绿灯。绿灯比没有灯更危险。
 */
const OBJECT_KEYS_TO_CHECK = [
  'content',
  'message',
  'label',
  'title',
  'body',
  'text',
  'placeholder',
  'description',
];

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
/** 看着像 i18n key 的字符串：点分、全小写开头、至少两段。用来在表达式里认出 key。 */
const LIKELY_KEY = /^[a-z][\w-]*(\.[\w-]+)+$/;

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
          // A2. 动态 key：`t(\`aiLab.history.group.${label}\`)`。
          //
          // 具体那一段拼出什么只有运行时知道，但**前缀是静态的**——校验它对应的父对象
          // 存不存在，就能挡住整块文案缺失这一类。之前挡不住：一整块 `history.group`
          // 没有，检查器全绿，而界面上直接显示出 `aiLab.history.group.today` 这串 key。
          if (args.length > 0 && Node.isTemplateExpression(args[0])) {
            const head = args[0].getHead().getLiteralText();
            const prefix = head.replace(/\.$/, '');
            if (prefix.includes('.')) checkKeyPrefix(prefix, node, relativePath);
          }
          // A3. key 藏在表达式里：`t(cond ? 'a.b.c' : \`a.b.${x}\`)`。
          //
          // 上面两条只看 `args[0]` 本身是不是字面量/模板串，三元、逻辑或、变量一概
          // 落空——线上就是这么漏的：`aiLab.interview.prep.*` 整组不存在，检查全绿，
          // 而面试间的屏幕正中直接把 key 印给了用户。往里走一层。
          if (
            args.length > 0 &&
            !Node.isStringLiteral(args[0]) &&
            !Node.isTemplateExpression(args[0])
          ) {
            args[0].forEachDescendant((inner) => {
              if (Node.isStringLiteral(inner)) {
                const key = inner.getLiteralText();
                if (LIKELY_KEY.test(key)) checkKey(key, node, relativePath);
              } else if (Node.isTemplateExpression(inner)) {
                const prefix = inner.getHead().getLiteralText().replace(/\.$/, '');
                if (LIKELY_KEY.test(prefix)) checkKeyPrefix(prefix, node, relativePath);
              }
            });
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

      // C2. 检查对象字面量里的文案属性（`{ content: '…' }`）。
      //     只查中文：这里的属性名（content/message/title…）也大量用于非文案场景
      //     （SSE 载荷、给模型的指令、CSS 值），按"像文案"判会把它们全部误报。
      if (Node.isPropertyAssignment(node) && OBJECT_KEYS_TO_CHECK.includes(node.getName())) {
        const initializer = node.getInitializer();
        if (
          (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) &&
          hasChinese(initializer.getLiteralText()) &&
          !shouldIgnore(node)
        ) {
          errors.push({
            file: relativePath,
            line: node.getStartLineNumber(),
            type: 'HARDCODED_TEXT',
            message: `Hardcoded object literal ${node.getName()}: "${initializer.getLiteralText()}"`,
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
   * 动态 key 的静态前缀下必须挂着**至少一个**子键。
   *
   * 只能验到这一层：`${kind}` 取什么值这里推不出来。但整块消失是最常见也最刺眼的失败
   * （界面上直接把 key 印出来给用户看），而它恰好只需要前缀就能挡住。
   */
  function checkKeyPrefix(prefix: string, node: Node, file: string) {
    for (const lang of LANGUAGES) {
      const keys = translationKeys[lang];
      if (!keys) continue;
      const needle = `${prefix}.`;
      let found = false;
      for (const key of keys) {
        if (key.startsWith(needle)) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push({
          file,
          line: node.getStartLineNumber(),
          type: 'MISSING_KEY',
          message: `Missing key group "${prefix}.*" in ${lang}/translation.json (used as a dynamic key)`,
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
