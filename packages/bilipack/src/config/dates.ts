/** JavaScript Date (and the TOML parser's legacy date) silently rolls invalid days forward. */
export function validCalendarDate(text: string): boolean {
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

/** Strip comments and strings before checking bare TOML dates; never interpret prose as a date. */
export function invalidBareDate(source: string): string | undefined {
  let unquoted = '';
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === '#') {
      while (i < source.length && source[i] !== '\n') i++;
      unquoted += '\n';
    } else if (char === '"' || char === "'") {
      const multiline = source.slice(i, i + 3) === char.repeat(3);
      const delimiter = multiline ? char.repeat(3) : char;
      i += delimiter.length;
      while (i < source.length) {
        if (char === '"' && source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source.startsWith(delimiter, i)) {
          i += delimiter.length;
          // TOML permits one or two literal quote characters just before a multiline terminator.
          if (multiline) for (let extra = 0; extra < 2 && source[i] === char; extra++) i++;
          break;
        }
        i++;
      }
      unquoted += ' "" ';
    } else {
      unquoted += char;
      i++;
    }
  }
  for (const match of unquoted.matchAll(/\b\d{4}-\d{2}-\d{2}(?=[Tt\s,\]}]|$)/g))
    if (!validCalendarDate(match[0])) return match[0];
}
