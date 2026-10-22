import type { FieldTarget } from 'bilipack';
import { one, visible } from './controls';
import { waitFor, writeText, click, type Operation } from './operation';
import { reconcileTags, validateTagCapacity } from './tags';
import { createSchedule, scheduleParts } from './schedule';

// Native-control protocol adapted from the user's .rajio/scripts/bilibili/fill.js.
// No access to site component instances or stores; no submission controls.
export const normalizeText = (text: string) => text.replace(/\r/g, '').replace(/\n$/, '');
export function matches(field: string, actual: unknown, expected: unknown) {
  if (field === 'publish.at' && typeof actual === 'string' && typeof expected === 'string') {
    try {
      scheduleParts(expected);
      return Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected);
    } catch {
      return false;
    }
  }
  if (field === 'info.tags' && Array.isArray(actual) && Array.isArray(expected))
    return (
      actual.length === expected.length &&
      new Set(actual).size === actual.length &&
      expected.every((t) => actual.includes(t))
    );
  if (
    ['info.description', 'interaction.dynamic'].includes(field) &&
    typeof actual === 'string' &&
    typeof expected === 'string'
  )
    return normalizeText(actual) === normalizeText(expected);
  return actual === expected;
}
const textSelectors: Record<string, string> = {
  'info.title': 'input[placeholder="请输入稿件标题"]',
  'info.category': '.video-human-type .select-controller .select-item-cont',
  'info.declaration': '.statement-main input.bcc-select-input-inner',
  'info.source': 'input[placeholder^="转载视频请注明来源"]',
  'info.description': '[editor_id="desc_at_editor"] .ql-editor',
  'interaction.dynamic': '[editor_id="dynamic_at_editor"] .ql-editor'
};
const checks: Record<string, [string, boolean]> = {
  'publish.collection_update_push': ['此稿件不生成更新推送', true],
  'commercial.enabled': ['增加商业推广信息', false],
  'interaction.comments': ['关闭评论', true],
  'interaction.danmaku': ['关闭弹幕', true],
  'interaction.selected_comments': ['开启精选评论', false],
  'media.dolby_audio': ['杜比音效', false],
  'media.hires_audio': ['Hi-Res无损音质', false]
};
function canContinue(operation: Operation) {
  try {
    operation.check();
    return true;
  } catch {
    return false;
  }
}
export function createFields(doc: Document) {
  const schedule = createSchedule(doc);
  const root = () => one(Array.from(doc.querySelectorAll('#video-up-app')), '投稿表单');
  const all = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = root()) =>
    Array.from(scope.querySelectorAll<T>(selector)).filter(visible);
  const get = <T extends Element = HTMLElement>(selector: string, scope?: ParentNode) =>
    one(all<T>(selector, scope), selector);
  const exact = (selector: string, text: string, scope?: ParentNode) =>
    one(
      all(selector, scope).filter((e) => e.textContent?.trim() === text),
      text
    );
  const tagItems = () => all('#tag-container .tag-pre-wrp .label-item-v2-container');
  const ordinaryItems = () => tagItems().filter((e) => !e.querySelector('.topic-icon'));
  const tags = () =>
    ordinaryItems().map((e) => get('.label-item-v2-content', e).textContent!.trim());
  const topic = () => {
    get('#tag-container');
    const items = tagItems().filter((e) => e.querySelector('.topic-icon'));
    return items.length
      ? get('.label-item-v2-content', one(items, '已选话题')).textContent!.trim()
      : '';
  };
  const checkbox = (field: string) =>
    field === 'display.watermark'
      ? get('.watermark .bcc-checkbox')
      : one(
          all(
            field === 'publish.collection_update_push'
              ? '.video-season .bcc-checkbox'
              : '.bcc-checkbox'
          ).filter((e) =>
            e.querySelector('.bcc-checkbox-label')?.textContent?.trim().startsWith(checks[field][0])
          ),
          field
        );
  const toggle = (field: string) =>
    field === 'publish.scheduled'
      ? get('.time-container .switch-container')
      : get(
          '.switch-container',
          exact('.setting-label-title', '在个人空间-投稿中隐藏').parentElement!
        );
  const switchState = (e: Element) => {
    const aria = e.getAttribute('aria-checked');
    if (aria === 'true' || aria === 'false') return aria === 'true';
    if (e.className.trim() === 'switch-container') return false;
    if (e.classList.contains('switch-container-active')) return true;
    throw new Error('开关状态无法确认');
  };
  function read(field: string): unknown {
    if (field === 'info.tags') return tags();
    if (field === 'info.topic') return topic();
    if (field === 'publish.at') return schedule.read();
    if (field === 'publish.collection') {
      const control = get('.video-season .season-enter-text');
      return control.querySelector('.season-enter-text-default')
        ? ''
        : get('.season-enter-text-name', control).textContent!.trim();
    }
    if (field === 'info.category') return get(textSelectors[field]).textContent!.trim();
    if (field === 'info.description' || field === 'interaction.dynamic') {
      const el = get(textSelectors[field]);
      const lines = Array.from(el.children);
      return lines.every((line) => line.tagName === 'P')
        ? lines
            .map((line) => (line.textContent === '' ? '' : (line as HTMLElement).innerText))
            .join('\n')
        : el.innerText;
    }
    if (textSelectors[field]) return get<HTMLInputElement>(textSelectors[field]).value;
    if (field === 'publish.scheduled' || field === 'display.hide_from_profile')
      return switchState(toggle(field));
    if (field === 'display.visibility')
      return one(
        all('.vu-only-self .check-radio-v2-container').filter((e) =>
          e.querySelector('.check-radio-v2-box-checked')
        ),
        field
      )
        .querySelector('.check-radio-v2-name')!
        .textContent!.trim();
    if (field === 'display.watermark' || checks[field]) {
      const checked = one(
        Array.from(checkbox(field).querySelectorAll<HTMLInputElement>('input[type=checkbox]')),
        field
      ).checked;
      return checks[field]?.[1] ? !checked : checked;
    }
    throw new Error(`${field}：当前页面未提供可识别的控件`);
  }
  const supported = (field: string) =>
    !!textSelectors[field] ||
    !!checks[field] ||
    [
      'info.tags',
      'info.topic',
      'publish.at',
      'publish.collection',
      'publish.scheduled',
      'display.watermark',
      'display.visibility',
      'display.hide_from_profile'
    ].includes(field);
  async function expand(operation: Operation) {
    if (all(textSelectors['interaction.dynamic']).length) return;
    click(
      one(
        all('.title > .label').filter((e) => e.textContent?.trim().startsWith('更多设置')),
        '更多设置'
      ),
      operation
    );
    await waitFor(
      () => (all(textSelectors['interaction.dynamic']).length === 1 ? true : undefined),
      operation
    );
  }
  async function apply(target: FieldTarget, operation: Operation) {
    operation.check();
    const { field, value } = target;
    if (
      field.startsWith('display.') ||
      field.startsWith('interaction.') ||
      field.startsWith('media.')
    )
      await expand(operation);
    if (field !== 'info.tags' && matches(field, read(field), value)) return;
    if (field === 'info.title' || field === 'info.source') {
      const el = get<HTMLInputElement>(textSelectors[field]);
      if (el.maxLength >= 0 && value.length > el.maxLength)
        throw new Error(`${field === 'info.title' ? '标题' : '转载来源'}超出页面限制`);
      writeText(el, value, operation);
      operation.write(() => el.blur());
    } else if (field === 'info.description' || field === 'interaction.dynamic') {
      const el = get(textSelectors[field]);
      if (el.getAttribute('contenteditable') !== 'true') throw new Error('富文本框不可编辑');
      operation.write(() => el.focus());
      const selection = doc.defaultView!.getSelection()!,
        range = doc.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!operation.write(() => doc.execCommand('insertText', false, value)))
        throw new Error('原生富文本编辑失败');
      operation.write(() => el!.dispatchEvent(new Event('input', { bubbles: true })));
      operation.write(() => el.blur());
    } else if (field === 'info.category' || field === 'info.declaration') {
      const category = field === 'info.category';
      const trigger = category ? '.video-human-type .select-controller' : textSelectors[field];
      const options = category
        ? '.video-human-type .drop-list-v2-item .item-cont-main'
        : '.statement-main .bcc-option';
      if (!all(options).length) click(get(trigger), operation);
      try {
        await waitFor(() => (all(options).length ? true : undefined), operation);
        click(exact(options, value), operation);
        await waitFor(() => (read(field) === value ? true : undefined), operation);
      } finally {
        if (canContinue(operation) && all(options).length) click(get(trigger), operation);
      }
    } else if (field === 'publish.at') {
      await schedule.apply(value, operation);
    } else if (field === 'publish.collection') {
      if (!value) click(get('.video-season .clear'), operation);
      else {
        if (all('.video-season .season-list').length)
          throw new Error('已有合集菜单打开，请先关闭后重试');
        click(get('.video-season .season-enter'), operation);
        try {
          await waitFor(() => all('.video-season .season-list').length || undefined, operation);
          click(exact('.video-season .season-item-title', value), operation);
          await waitFor(() => read(field) === value || undefined, operation);
        } finally {
          if (canContinue(operation) && all('.video-season .season-list').length)
            click(get('.video-season .season-enter'), operation);
        }
      }
    } else if (field === 'info.topic') {
      if (all('.topic-dialog .bcc-dialog').length) throw new Error('已有话题弹窗，请先关闭后重试');
      const originalTags = tags();
      validateTagCapacity(originalTags, value ? [value] : []);
      const selected = tagItems().filter((e) => e.querySelector('.topic-icon'));
      if (selected.length) {
        click(get('.close', one(selected, '已选话题')), operation);
        await waitFor(() => topic() === '' || undefined, operation);
      }
      if (value) {
        click(get('#video-up-app .tag-more'), operation);
        try {
          await waitFor(() => all('.topic-dialog .bcc-dialog').length || undefined, operation);
          const dialog = () => get('.topic-dialog .bcc-dialog');
          const search = get('input.bcc-search-input', dialog()) as HTMLInputElement;
          writeText(search, value, operation);
          operation.write(() =>
            search.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })
            )
          );
          await waitFor(
            () =>
              all('.topic-tag-name', dialog()).some((e) => e.textContent?.trim() === value) ||
              undefined,
            operation,
            15_000
          );
          click(exact('.topic-tag-name', value, dialog()), operation);
          click(get('button.submit-add', dialog()), operation);
          await waitFor(() => !all('.topic-dialog .bcc-dialog').length || undefined, operation);
          await waitFor(() => topic() === value || undefined, operation);
        } finally {
          if (canContinue(operation) && all('.topic-dialog .bcc-dialog').length)
            click(get('.topic-dialog .bcc-dialog button.submit-cancel'), operation);
        }
      }
      // Topic selection owns its special tag only; preserve all ordinary tags.
      if (!matches('info.tags', tags(), originalTags))
        await apply({ field: 'info.tags', value: originalTags }, operation);
    } else if (field === 'info.tags') {
      validateTagCapacity(value, topic() ? [topic()] : []);
      const pause = async (ms: number) => {
        const end = Date.now() + ms;
        await waitFor(() => (Date.now() >= end ? true : undefined), operation, ms + 1000);
      };
      const setTag = (el: HTMLInputElement, text: string) => {
        if (el.disabled || el.readOnly) throw new Error('标签输入框不可编辑');
        operation.checkWrite();
        Object.getOwnPropertyDescriptor(
          doc.defaultView!.HTMLInputElement.prototype,
          'value'
        )!.set!.call(el, text);
        operation.write(() => el!.dispatchEvent(new Event('input', { bubbles: true })));
      };
      await reconcileTags(
        value,
        {
          read: tags,
          pause,
          async remove(index, tag) {
            const items = ordinaryItems();
            const item = items[index];
            // Vue can replace rows between reads. Reconcile again if it has changed.
            if (!item || get('.label-item-v2-content', item).textContent!.trim() !== tag) return;
            const before = tags().filter((t) => t === tag).length;
            click(get('.close', item), operation);
            await waitFor(
              () => (tags().filter((t) => t === tag).length < before ? true : undefined),
              operation,
              5000
            );
          },
          async add(tag) {
            if (tagItems().length >= 10) throw new Error('标签数量已满（含话题），等待清理');
            try {
              let el: HTMLInputElement | undefined;
              for (let refresh = 0; refresh < 3; refresh++) {
                el = get<HTMLInputElement>('#tag-container input.input-val');
                operation.write(() => el!.focus());
                setTag(el, tag);
                await pause(200);
                if (tags().includes(tag)) return;
                if (
                  el.isConnected &&
                  el === get('#tag-container input.input-val') &&
                  el.value === tag
                )
                  break;
                el = undefined;
              }
              if (!el) throw new Error(`标签输入框持续重建，未发送 Enter：${tag}`);
              for (const type of ['keydown', 'keypress', 'keyup'])
                operation.write(() =>
                  el!.dispatchEvent(
                    new doc.defaultView!.KeyboardEvent(type, {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                      cancelable: true
                    })
                  )
                );
              await waitFor(() => (tags().includes(tag) ? true : undefined), operation, 5000);
            } catch (error) {
              // Clear pending text so a later Enter cannot commit a stale tag.
              if (canContinue(operation)) {
                const inputs = all<HTMLInputElement>('#tag-container input.input-val');
                if (inputs.length === 1 && !inputs[0].disabled && !inputs[0].readOnly) {
                  setTag(inputs[0], '');
                }
              }
              throw error;
            }
          },
          finish() {
            const inputs = all<HTMLInputElement>('#tag-container input.input-val');
            if (inputs.length === 1) operation.write(() => inputs[0].blur());
          }
        },
        operation.signal
      );
    } else if (field === 'display.visibility') {
      click(
        exact('.vu-only-self .check-radio-v2-name', value).closest('.check-radio-v2-container')!,
        operation
      );
    } else if (field === 'publish.scheduled' || field === 'display.hide_from_profile')
      click(toggle(field), operation);
    else if (field === 'display.watermark' || checks[field]) {
      const control = checkbox(field);
      if (control.querySelector<HTMLInputElement>('input')?.disabled)
        throw new Error(`${field}：页面禁用此选项，请检查账号权限与评论等前置设置`);
      click(control, operation);
    } else throw new Error(`${field}：当前页面未提供可识别的控件`);
    await waitFor(() => (matches(field, read(field), value) ? true : undefined), operation);
  }
  return { read, apply, supported, expand };
}
