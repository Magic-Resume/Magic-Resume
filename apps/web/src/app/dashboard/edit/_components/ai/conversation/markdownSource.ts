/**
 * 丢掉只有 Markdown 列表标记、还没有正文的行。
 *
 * 流式响应经常会把 `- ` 和后面的文字拆成两个 chunk。ReactMarkdown 若先看到前半个
 * chunk，会立刻画出一个空圆点；连续几个前导标记就会留下空列表项，最后的写入光标还会
 * 被塞进空 `<li>`。空列表项本身没有可读信息，完成态同样不该保留。
 */
export function normalizeMarkdownSource(source: string): string {
  const withoutEmptyItems = source
    .split('\n')
    .filter((line) => {
      const item = /^\s*(?:[-+*]|\d+[.)])(?:\s+(.*))?\s*$/.exec(line);
      if (!item) return true;
      const body = (item[1] ?? '').replace(/\s/g, '');
      // chunk 可能停在 `- **` / `- __` / `- [ ]`：它们解析后同样只有 marker，
      // 等下一块正文到达再显示整行，避免半成品闪一下。
      return body !== '' && !/^(?:[*_~`]+|\[[xX]?\])+$/.test(body);
    })
    .join('\n');

  // 去掉末尾空行，让流式光标紧跟最后一个有意义的 token，而不是单独掉到下一行。
  return withoutEmptyItems.replace(/\n(?:[ \t]*\n)*[ \t]*$/, '');
}
