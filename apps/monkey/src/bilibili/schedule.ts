import { one, visible } from './controls';
import { click, waitFor, type Operation } from './operation';

const beijing = '(UTC+08:00) Beijing, Chongqing, Hong Kong SAR, Urumqi';

/** The native picker has minute precision. Never silently round a configured instant. */
export function scheduleParts(value: string) {
  const instant = Date.parse(value);
  const fraction = /:\d{2}\.(\d+)/.exec(value)?.[1];
  if (!Number.isFinite(instant) || instant % 60_000 !== 0 || (fraction && /[1-9]/.test(fraction)))
    throw new Error('定时控件仅支持分钟精度，不能设置非零秒或毫秒');
  const local = new Date(instant + 8 * 60 * 60_000).toISOString();
  return { date: local.slice(0, 10), hour: local.slice(11, 13), minute: local.slice(14, 16) };
}

export function scheduleInstant(date: string, time: string, zone: string) {
  const offset = /^\(UTC([+-]\d{2}:\d{2})\)/.exec(zone)?.[1];
  if (!offset || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('无法识别页面的定时日期、时间或时区');
  const instant = Date.parse(`${date}T${time}:00${offset}`);
  if (!Number.isFinite(instant)) throw new Error('页面定时时间无效');
  return new Date(instant).toISOString();
}

export function createSchedule(doc: Document) {
  const root = () => one([...doc.querySelectorAll('.time-container')].filter(visible), '定时发布');
  const all = (selector: string, scope: ParentNode = root()) =>
    [...scope.querySelectorAll<HTMLElement>(selector)].filter(visible);
  const get = (selector: string, scope?: ParentNode) => one(all(selector, scope), selector);
  const timezone = () =>
    get('.date-picker-timezone-wrp input.bcc-select-input-inner') as HTMLInputElement;
  const date = () => get('.date-picker-date .date-show').textContent!.trim();
  const time = () => get('.date-picker-timer .date-show').textContent!.trim();
  const enabled = (element: Element) => {
    if ([...element.classList].some((name) => /disabled/.test(name)))
      throw new Error('定时时间不在页面允许的范围内');
    return element;
  };
  const read = () => scheduleInstant(date(), time(), timezone().value);
  async function apply(value: string, operation: Operation) {
    const target = scheduleParts(value);
    if (
      all('.date-picker-nav-title, .time-picker-container, .date-picker-timezone-wrp .bcc-option')
        .length
    )
      throw new Error('已有定时选择菜单打开，请先关闭后重试');
    // Selecting a fixed-offset native zone avoids depending on the browser's timezone or DST.
    if (timezone().value !== beijing) {
      click(timezone(), operation);
      try {
        await waitFor(
          () => all('.date-picker-timezone-wrp .bcc-option').length || undefined,
          operation
        );
        click(
          one(
            all('.date-picker-timezone-wrp .bcc-option').filter(
              (e) => e.textContent?.trim() === beijing
            ),
            '北京时间'
          ),
          operation
        );
        await waitFor(() => timezone().value === beijing || undefined, operation);
        await waitFor(
          () => !all('.date-picker-timezone-wrp .bcc-option').length || undefined,
          operation
        );
      } finally {
        operation.check();
        if (all('.date-picker-timezone-wrp .bcc-option').length) click(timezone(), operation);
      }
    }
    if (date() !== target.date) {
      click(get('.date-picker-date'), operation);
      try {
        await waitFor(() => all('.date-picker-nav-title').length || undefined, operation);
        const month = Number(target.date.slice(0, 4)) * 12 + Number(target.date.slice(5, 7));
        for (let attempt = 0; attempt < 24; attempt++) {
          const heading = get('.date-picker-nav-title').textContent!.trim();
          const match = /^(\d{4})年(\d{1,2})月$/.exec(heading);
          if (!match) throw new Error('无法识别定时日历月份');
          const current = Number(match[1]) * 12 + Number(match[2]);
          if (current === month) break;
          click(enabled(get(current < month ? '.next-btn-month' : '.prev-btn-month')), operation);
          await waitFor(
            () => get('.date-picker-nav-title').textContent!.trim() !== heading || undefined,
            operation
          );
        }
        const heading = get('.date-picker-nav-title').textContent!.trim();
        if (heading !== `${Number(target.date.slice(0, 4))}年${Number(target.date.slice(5, 7))}月`)
          throw new Error('目标日期超出可遍历的日历范围');
        const day = one(
          all('.date-picker-body-item').filter(
            (e) => e.textContent?.trim() === String(Number(target.date.slice(8, 10)))
          ),
          '目标日期'
        );
        click(enabled(day), operation);
        await waitFor(() => date() === target.date || undefined, operation);
      } finally {
        operation.check();
        if (all('.date-picker-nav-title').length) click(get('.date-picker-date'), operation);
      }
    }
    if (time() !== `${target.hour}:${target.minute}`) {
      click(get('.date-picker-timer'), operation);
      try {
        await waitFor(
          () => all('.time-picker-panel-select-wrp').length === 2 || undefined,
          operation
        );
        for (const [index, text] of [target.hour, target.minute].entries()) {
          const panels = all('.time-picker-panel-select-wrp');
          if (panels.length !== 2) throw new Error('无法识别定时时分菜单');
          const options = all('.time-picker-panel-select-item', panels[index]).filter(
            (e) => e.textContent?.trim() === text
          );
          if (options.length !== 1)
            throw new Error(`页面不能精确选择${index ? '分钟' : '小时'} ${text}，未取整`);
          click(enabled(options[0]), operation);
          await waitFor(() => time().split(':')[index] === text || undefined, operation);
        }
      } finally {
        operation.check();
        if (all('.time-picker-container').length) click(get('.date-picker-timer'), operation);
      }
    }
    await waitFor(() => Date.parse(read()) === Date.parse(value) || undefined, operation);
  }
  return { read, apply };
}
