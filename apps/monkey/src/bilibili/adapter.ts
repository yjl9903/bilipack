import type { FieldTarget } from 'bilipack';
import { matchesContext, type PageAdapter, type PageContext } from '../workflow/port';
import { createContextReader } from './context';
import { selectors } from './selectors';
import { unique, visible, one } from './controls';
import { createFields, matches } from './fields';
import { createCover } from './cover';
import { createSubtitles, subtitleLanguage } from './subtitles';
import { createOperation, waitFor, click, writeText, captureFileInput } from './operation';
import { createVideoReader } from './videos';
import type { UploadEntry } from '../entry/port';

export function createBilibiliAdapter(
  doc: Document = document,
  readContext = createContextReader(doc)
): PageAdapter & { entry: UploadEntry } {
  const fields = createFields(doc);
  const covers = createCover(doc);
  const subtitles = createSubtitles(doc, fields.expand);
  const editorReady = () => {
    const page = readContext();
    const inputs = doc.querySelectorAll<HTMLInputElement>(`${selectors.form} ${selectors.title}`);
    return (
      page.target &&
      page.count > 0 &&
      page.video !== 'failed' &&
      inputs.length === 1 &&
      inputs[0].isConnected &&
      !inputs[0].disabled &&
      !inputs[0].readOnly
    );
  };
  const videoInput = () =>
    unique<HTMLInputElement>(unique(doc, selectors.form), selectors.entranceInput);
  const videoRows = createVideoReader(doc);
  const readVideo = (part: number) => {
    const row = videoRows()[part - 1];
    if (!row) throw new Error(`P${part} 无法定位`);
    return { title: row.title, state: row.state };
  };
  const validateVideo = (file: File) => {
    const extensions = videoInput()
      .accept.split(',')
      .map((s) => s.trim().toLowerCase());
    if (!file.size || !extensions.some((ext) => file.name.toLowerCase().endsWith(ext)))
      throw new Error('视频为空或文件扩展名不在页面支持的格式中');
  };
  const capability = (field: string, value?: unknown) => {
    if (field === 'subtitles.parts' || (field === 'subtitles' && readContext().count > 1))
      return {
        available: false,
        reason: '多 P 字幕需投稿后前往播放页处理，当前流程未接入；已保留所属 P'
      };
    if (field === 'videos.title') return { available: true };
    if (field === 'cover') return { available: true };
    if (['info.source', 'info.topic', 'display.watermark'].includes(field)) {
      let declaration: unknown;
      try {
        declaration = fields.read('info.declaration');
      } catch {
        // An unavailable editor is not evidence that a declaration hides a field.
      }
      if (
        declaration === '内容为转载' &&
        (field === 'info.topic' || (field === 'display.watermark' && value !== false))
      )
        return {
          available: false,
          reason: `当前创作声明为转载，页面不提供${field === 'info.topic' ? '参与话题' : '水印'}选项，已跳过`
        };
      if (
        field === 'info.source' &&
        typeof declaration === 'string' &&
        declaration &&
        declaration !== '内容为转载'
      )
        return { available: false, reason: '当前创作声明不是转载，页面不提供转载来源，已跳过' };
    }
    const editing =
      new URL(readContext().identity, 'https://member.bilibili.com').searchParams.get('type') ===
      'edit';
    if (editing && ['publish.scheduled', 'publish.at'].includes(field))
      return {
        available: false,
        reason: '已发布视频无需定时发布，已跳过'
      };
    if (editing && field === 'subtitles')
      return {
        available: false,
        reason: '已发布稿件不在视频编辑页操作字幕；请通过字幕管理或播放器字幕入口处理'
      };
    if (field === 'subtitles' && value !== undefined && !subtitleLanguage(value))
      return {
        available: false,
        reason: '当前已实测的新投稿字幕语言为中文、英语、日语；其他语言暂未接入，将跳过'
      };
    if (
      editing &&
      ['interaction.comments', 'interaction.danmaku', 'interaction.selected_comments'].includes(
        field
      )
    )
      return { available: false, reason: `${field}：已发布视频编辑页未提供此互动控件` };
    if (field === 'video') {
      try {
        const page = readContext(),
          input = videoInput();
        return {
          available:
            page.target &&
            page.video === 'absent' &&
            !input.disabled &&
            typeof DataTransfer !== 'undefined',
          reason: '当前页面的原生视频上传控件不可用'
        };
      } catch (e) {
        return { available: false, reason: (e as Error).message };
      }
    }
    return {
      available: fields.supported(field) || field === 'subtitles',
      reason: `${field}：当前页面能力未接入或账号不支持`
    };
  };
  const reprintWatermark = (field: string) =>
    field === 'display.watermark' && fields.read('info.declaration') === '内容为转载';
  const readField = (field: string) => (reprintWatermark(field) ? false : fields.read(field));
  const verifyField = async (target: FieldTarget, signal: AbortSignal, page: PageContext) => {
    const operation = createOperation(readContext, page, signal);
    operation.check();
    if (reprintWatermark(target.field))
      return {
        matches: target.value === false,
        actual: false,
        message:
          target.value === false
            ? '当前创作声明为转载，不添加水印，符合配置；无需操作水印控件'
            : '当前创作声明为转载，不支持添加水印'
      };
    // Comparing an existing form also needs the native collapsed section opened.
    if (/^(display|interaction|media)\./.test(target.field)) await fields.expand(operation);
    const actual = await waitFor(() => readField(target.field), operation);
    if (target.field === 'commercial.enabled' && target.value === true && actual === true)
      return {
        matches: false,
        actual,
        message: '已开启商业推广信息；合作类型与推广详情需在原页面手动补充确认'
      };
    const matched = matches(target.field, actual, target.value);
    return {
      matches: matched,
      actual,
      message: matched ? '页面读回一致' : '页面实际值与配置不一致'
    };
  };
  return {
    context: readContext,
    entry: {
      directoryEntryTarget() {
        if (!readContext().target || readContext().video !== 'absent') return null;
        try {
          return unique<HTMLElement>(unique(doc, selectors.form), selectors.entrance);
        } catch {
          return null;
        }
      },
      directoryEntryPresentation() {
        try {
          const entrance = unique<HTMLElement>(unique(doc, selectors.form), selectors.entrance);
          const content = unique<HTMLElement>(entrance, '.bcc-upload');
          const icon = unique<SVGElement>(content, '.upload-area .upload-icon');
          return { content, icon };
        } catch {
          return null;
        }
      },
      nativeVideoEntry(files) {
        const page = readContext();
        if (!page.target || page.video !== 'absent' || page.count !== 0 || page.submissionWaiting)
          throw new Error('当前页面不再是视频上传入口');
        const input = videoInput();
        if (input.disabled) throw new Error('原生视频上传控件不可用');
        if (!files) {
          input.click();
          return;
        }
        if (!files.length) return;
        if (files.length > 1 && !input.multiple) throw new Error('请一次拖入一个视频文件');
        files.forEach(validateVideo);
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    validateVideo,
    readVideo,
    assertContext(expected: PageContext) {
      const actual = readContext();
      if (!matchesContext(expected, actual))
        throw new Error('页面或稿件已变化；停止后续操作，保留已有填写与上传');
    },
    capability,
    readField,
    verifyField,
    async applyField(target, signal, page) {
      const operation = createOperation(readContext, page, signal);
      operation.check();
      if (reprintWatermark(target.field)) {
        if (target.value !== false) throw new Error('当前创作声明为转载，不支持添加水印');
        return;
      }
      await fields.apply(target, operation);
      operation.check();
    },
    async renameVideo(part, title, signal, expected) {
      const operation = createOperation(readContext, expected, signal);
      operation.check();
      if (readVideo(part).title === title) return;
      const row = videoRows()[part - 1];
      const label = unique<HTMLElement>(row.node, '.title-text, .task-title-text');
      readContext.expectRename(part, title);
      try {
        click(label, operation);
        const input = await waitFor(() => {
          const inputs = row.node.querySelectorAll<HTMLInputElement>(
            'input:not([type=file]):not([type=checkbox])'
          );
          return inputs.length === 1 ? inputs[0] : undefined;
        }, operation);
        if (input.maxLength >= 0 && title.length > input.maxLength)
          throw new Error('分 P 名称超过页面长度限制');
        operation.write(() => input.focus());
        writeText(input, title, operation);
        operation.write(() => input.blur());
        await waitFor(() => {
          const actual = readVideo(part);
          return actual.title === title && (!input.isConnected || !visible(input))
            ? true
            : undefined;
        }, operation);
      } finally {
        readContext.cancelExpectedRename();
      }
    },
    async uploadVideos(files, signal, expected) {
      const operation = createOperation(readContext, expected, signal);
      operation.check();
      const page = readContext();
      if (!page.target || page.video !== 'absent' || page.count !== 0)
        throw new Error('页面已有视频或状态不明，不执行上传');
      if (!files.length) throw new Error('缺少视频文件');
      files.forEach(validateVideo);
      const assign = (input: HTMLInputElement, selected: readonly File[]) => {
        if (input.disabled || input.type !== 'file' || (selected.length > 1 && !input.multiple))
          throw new Error('原生视频文件控件不可用');
        const extensions = input.accept
          .toLowerCase()
          .split(',')
          .map((value) => value.trim());
        if (
          selected.some(
            (file) => !extensions.some((ext) => ext && file.name.toLowerCase().endsWith(ext))
          )
        )
          throw new Error('分 P 文件控件格式无法确认');
        const transfer = new DataTransfer();
        selected.forEach((file) => transfer.items.add(file));
        operation.write(() => {
          input.files = transfer.files;
        });
        operation.write(() => input.dispatchEvent(new Event('change', { bubbles: true })));
      };
      const waitRows = (count: number) =>
        waitFor(
          () => {
            const rows = videoRows();
            return rows.length === count &&
              rows.every(
                (row, index) =>
                  [files[index].name, files[index].name.replace(/\.[^.]+$/, '')].includes(
                    row.title
                  ) && ['uploading', 'ready'].includes(row.state)
              )
              ? true
              : undefined;
          },
          operation,
          15_000
        );
      readContext.expectUpload(files);
      try {
        // The entrance creates separate submissions for multiple files.
        assign(videoInput(), files.slice(0, 1));
        await waitRows(1);
        if (files.length > 1) {
          const root = unique(doc, selectors.form);
          const button = await waitFor(() => {
            const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(
              (el) => visible(el) && el.textContent?.trim() === '添加分P'
            );
            return buttons.length ? one(buttons, '添加分P') : undefined;
          }, operation);
          const input = captureFileInput(button, operation);
          const detached = !input.isConnected;
          if (detached) {
            input.hidden = true;
            operation.write(() => root.append(input));
          }
          try {
            assign(input, files.slice(1));
            await waitRows(files.length);
          } finally {
            if (detached) input.remove();
          }
        }
      } finally {
        readContext.cancelExpectedUpload();
      }
    },
    async waitEditor(signal, expected) {
      const operation = createOperation(readContext, expected, signal);
      await waitFor(
        () => {
          const actual = readContext();
          if (actual.video === 'failed') throw new Error('投稿编辑表单上下文已变化');
          return editorReady() ? true : undefined;
        },
        operation,
        15_000
      );
    },
    verifyEditor() {
      const matches = editorReady();
      return { matches, message: matches ? '投稿编辑表单可操作' : '投稿编辑表单尚不可操作' };
    },
    async waitVideo(signal, expected, part) {
      const operation = createOperation(readContext, expected, signal, true);
      let previous = '',
        lastChange = Date.now();
      let unknownSince: number | undefined;
      await waitFor(
        () => {
          const context = readContext();
          if (!context.target || context.count < part) throw new Error('视频状态无法确认');
          const state = readVideo(part).state;
          if (state === 'failed') throw new Error(`P${part} 上传失败`);
          if (state === 'unknown') {
            unknownSince ??= Date.now();
            if (Date.now() - unknownSince >= 15_000) throw new Error('视频状态连续十五秒无法确认');
            return undefined;
          }
          unknownSince = undefined;
          const status = videoRows()[part - 1]?.node.textContent ?? '';
          if (status !== previous) {
            previous = status;
            lastChange = Date.now();
          }
          if (state !== 'ready' && Date.now() - lastChange > 3 * 60 * 1000)
            throw new Error('视频状态连续三分钟未变化，停止等待；请在原页面检查');
          return state === 'ready' ? true : undefined;
        },
        operation,
        30 * 60 * 1000,
        1000
      );
    },
    verifyVideo(part) {
      const actual = readVideo(part).state;
      return {
        matches: actual === 'ready',
        actual,
        message: actual === 'ready' ? '页面明确显示上传完成' : '未确认视频上传完成'
      };
    },
    async applyCovers(files, signal, page) {
      const operation = createOperation(readContext, page, signal);
      operation.check();
      await covers.applyCovers(files, operation);
      operation.check();
    },
    async verifyCover(ratio, signal, page) {
      const operation = createOperation(readContext, page, signal);
      operation.check();
      const evidence = await covers.verifyCover(ratio, operation);
      operation.check();
      return evidence;
    },
    async applySubtitle(language, file, signal, page) {
      const operation = createOperation(readContext, page, signal);
      operation.check();
      const cap = capability('subtitles', language);
      if (!cap.available) throw new Error(cap.reason);
      await subtitles.applySubtitle(language, file, operation);
      operation.check();
    },
    async verifySubtitle(language, signal, page) {
      const operation = createOperation(readContext, page, signal);
      operation.check();
      const cap = capability('subtitles', language);
      if (!cap.available) return { matches: false, message: cap.reason! };
      const evidence = await subtitles.verifySubtitle(language, operation);
      operation.check();
      return evidence;
    },
    stable() {
      return (
        readContext().target &&
        !Array.from(doc.querySelectorAll('.bcc-dialog, .cover-editor')).some(
          (el) => el.getClientRects().length > 0
        )
      );
    }
  };
}
