/** Exact, case-sensitive package paths; never resolve outside the chosen root. */
export function normalizePath(input: string): string {
  if (!input || input.startsWith('/') || /[\\\u0000-\u001f:]/.test(input))
    throw new Error('路径须为使用 / 的相对路径，不能包含盘符、URL 或控制字符');
  const parts = input.split('/');
  if (parts.includes('..')) throw new Error('路径不能包含 ..');
  const path = parts.filter((p) => p !== '' && p !== '.').join('/');
  if (!path) throw new Error('路径不能为空');
  return path;
}
