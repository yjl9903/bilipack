import { one, visible } from './controls';
import { assignFile, waitFor as poll, click, type Operation } from './operation';
import type { Evidence } from '../workflow/port';

export function createSubtitles(doc: Document, expand: (operation: Operation) => Promise<void>) {
  const all = <T extends Element = HTMLElement>(selector: string, root: ParentNode = doc) =>
    Array.from(root.querySelectorAll<T>(selector)).filter(visible);
  const get = <T extends Element = HTMLElement>(selector: string, root?: ParentNode) =>
    one(all<T>(selector, root), selector);
  const exact = (selector: string, text: string, root?: ParentNode) =>
    one(
      all(selector, root).filter((e) => e.textContent?.trim() === text),
      text
    );
  const subtitleDialog = () => get('.subtitle-upload .bcc-dialog');
  let stage = '附件';
  const waitFor: typeof poll = async (...args) => {
    try {
      return await poll(...args);
    } catch (error) {
      throw new Error(`${stage}：${(error as Error).message}`);
    }
  };
  const subtitles = new Map<string, string>();
  async function openSubtitle(operation: Operation) {
    operation.check();
    await expand(operation);
    if (all('.subtitle-upload .bcc-dialog').length) throw new Error('已有字幕弹窗，请先关闭后重试');
    stage = '打开字幕弹窗';
    const modify = all('.subtitle-list .operate');
    click(
      modify.length ? one(modify, '修改字幕') : exact('button', '上传字幕', get('#video-up-app')),
      operation
    );
    await waitFor(
      () => (all('.subtitle-upload .bcc-dialog').length === 1 ? true : undefined),
      operation
    );
  }
  const rows = () => all('.modal-content-file-list-item', subtitleDialog());
  const languageRows = (language: string) =>
    rows().filter((e) => e.querySelector('.type')?.textContent?.trim() === language);
  async function closeSubtitle(operation: Operation, confirm: boolean) {
    operation.check();
    click(exact('.modal-footer-button', confirm ? '确认' : '取消', subtitleDialog()), operation);
    await waitFor(
      () => (!all('.subtitle-upload .bcc-dialog').length ? true : undefined),
      operation
    );
  }
  /** The site's subtitle button creates a detached input synchronously. Capture
   * just that native click, supply the selected local File, and restore immediately.
   * No component internals, network API, global persistent hook or file picker. */
  function subtitleFile(button: HTMLElement, file: File, operation: Operation) {
    const proto = doc.defaultView!.HTMLInputElement.prototype;
    const original = proto.click;
    let captured: HTMLInputElement | undefined;
    proto.click = function () {
      if (this.type !== 'file') return original.call(this);
      if (captured) throw new Error('字幕上传触发多个文件控件');
      captured = this;
    };
    try {
      click(button, operation);
    } finally {
      proto.click = original;
    }
    if (!captured) throw new Error('未捕获字幕原生文件控件');
    const input = captured;
    if (!/srt/i.test(input.accept)) throw new Error('字幕文件控件格式无法确认');
    const detached = !input.isConnected;
    if (detached) {
      input.hidden = true;
      operation.write(() => subtitleDialog().append(input));
    }
    try {
      assignFile(input, file, operation);
    } finally {
      if (detached) input.remove();
    }
  }
  return {
    async applySubtitle(language: string, file: File, operation: Operation) {
      subtitles.delete(language);
      await openSubtitle(operation);
      const existing = languageRows(language);
      if (existing.length > 1) throw new Error('同语言存在多个字幕，停止修改');
      if (existing.length) {
        // The native menu explicitly says to delete the language before readding.
        stage = `移除待替换的 ${language} 字幕`;
        click(get('.icon img.grey-close', existing[0]), operation);
        await waitFor(() => (!languageRows(language).length ? true : undefined), operation);
      }
      stage = `选择 ${language} 字幕语言`;
      const select = get<HTMLInputElement>('input[placeholder="选择字幕语言"]', subtitleDialog());
      if (select.value !== language) {
        click(select, operation);
        await waitFor(
          () => (all('.bcc-option', subtitleDialog()).length ? true : undefined),
          operation
        );
        const option = one(
          all('.bcc-option', subtitleDialog()).filter(
            (e) =>
              e
                .querySelector('.modal-content-upload-select-option-text')
                ?.childNodes[0]?.textContent?.trim() === language
          ),
          language
        );
        if (option.classList.contains('is-disabled')) throw new Error('页面不允许选择此字幕语言');
        click(option, operation);
      }
      await waitFor(
        () =>
          get<HTMLInputElement>('input[placeholder="选择字幕语言"]', subtitleDialog()).value ===
          language
            ? true
            : undefined,
        operation
      );
      stage = `上传 ${language} 字幕`;
      subtitleFile(get('.modal-content-upload-button', subtitleDialog()), file, operation);
      await waitFor(
        () =>
          languageRows(language).length === 1 &&
          languageRows(language)[0].querySelector('.name')?.textContent?.trim() === file.name
            ? true
            : undefined,
        operation,
        30_000
      );
      await waitFor(
        () =>
          !get<HTMLButtonElement>('.modal-footer-button.bcc-button--primary', subtitleDialog())
            .disabled
            ? true
            : undefined,
        operation,
        30_000
      );
      await closeSubtitle(operation, true);
      await waitFor(
        () =>
          all('.subtitle-list .text').some((e) => e.textContent?.trim() === `【${language}】`)
            ? true
            : undefined,
        operation
      );
      subtitles.set(language, file.name);
    },
    async verifySubtitle(language: string, operation: Operation): Promise<Evidence> {
      const expected = subtitles.get(language);
      if (!expected) return { matches: false, message: '没有本次字幕更新证据' };
      await openSubtitle(operation);
      try {
        const found = languageRows(language);
        const actual =
          found.length === 1 ? found[0].querySelector('.name')?.textContent?.trim() : undefined;
        return {
          matches: actual === expected,
          actual,
          message:
            actual === expected
              ? '字幕确认后按语言与文件名重新打开读回一致'
              : '字幕语言或文件名不一致'
        };
      } finally {
        await closeSubtitle(operation, false);
      }
    }
  };
}
