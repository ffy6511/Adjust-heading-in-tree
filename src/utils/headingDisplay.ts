/**
 * 将标题文本简化为适合 UI 展示的形式（不影响原始文本和跳转）。
 */
export function sanitizeHeadingForDisplay(
  text: string,
  kind: "markdown" | "typst"
): string {
  let result = text ?? "";

  if (kind === "typst") {
    result = stripTypstInline(result);
  }

  // 压缩空白
  result = result.replace(/\s+/g, " ").trim();

  // 兜底：避免空字符串
  if (!result) {
    return text;
  }

  return result;
}

function stripTypstInline(text: string): string {
  let result = text;

  // #link("url")[...]
  result = result.replace(/#link\s*\([^)]*\)\s*\[(.*?)\]/g, "$1");

  // #emph[...] #strong[...] #underline[...] #strike[...] #quote[...] #math[...]
  result = result.replace(
    /#(?:emph|strong|underline|strike|quote|math)\s*\[(.*?)\]/g,
    "$1"
  );

  // #code("...") / #raw("...") / #emph("...") 等字符串参数
  result = result.replace(
    /#(?:code|raw|emph|strong|underline|strike|quote|math)\s*\(\s*["']([^"']+)["']\s*\)/g,
    "$1"
  );

  // Typst 标签形如 <tag> 或 <tag:arg>，在展示时去除
  result = result.replace(/<[^>]+>/g, " ");

  // 简单行内数学 $...$
  result = result.replace(/\$(.+?)\$/g, "$1");

  // 转义符去掉前导反斜杠
  result = result.replace(/\\([\\\[\]\(\)\{\}])/g, "$1");

  return result;
}
