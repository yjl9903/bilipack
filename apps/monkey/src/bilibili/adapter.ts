import type { FieldTarget } from 'bilipack';
import { matchesContext, type PageAdapter, type PageContext } from '../workflow/port';
import { createContextReader } from './context';
import { selectors } from './selectors';
import { unique } from './controls';
import { createFields, matches } from './fields';
import { createCover } from './cover';
import { createSubtitles } from './subtitles';
import { createOperation, waitFor, assignFile } from './operation';
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
      page.count === 1 &&
      page.video !== 'failed' &&
      inputs.length === 1 &&
      inputs[0].isConnected &&
      !inputs[0].disabled &&
      !inputs[0].readOnly
    );
  };
  const videoInput = () =>
    unique<HTMLInputElement>(unique(doc, selectors.form), selectors.entranceInput);
  const validateVideo = (file: File) => {
    const extensions = videoInput()
      .accept.split(',')
      .map((s) => s.trim().toLowerCase());
    if (!file.size || !extensions.some((ext) => file.name.toLowerCase().endsWith(ext)))
      throw new Error('视频为空或文件扩展名不在页面支持的格式中');
  };
  const capability = (field: string, value?: unknown) => {
    if (field === 'cover') return { available: true };
    if (field.startsWith('media.') || (field === 'commercial.enabled' && value === true))
      return { available: false, reason: `${field}：高级媒体与启用商业推广尚未实测接入` };
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
    if (field === 'subtitles' && value !== undefined && value !== '中文')
      return {
        available: false,
        reason: '当前已实测的新投稿字幕语言为中文；其他语言暂未接入，将跳过'
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
  const readField = fields.read;
  const verifyField = async (target: FieldTarget, signal: AbortSignal, page: PageContext) => {
    const operation = createOperation(readContext, page, signal);
    operation.check();
    // Comparing an existing form also needs the native collapsed section opened.
    if (/^(display|interaction|media)\./.test(target.field)) await fields.expand(operation);
    const actual = await waitFor(() => readField(target.field), operation);
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
      await fields.apply(target, operation);
      operation.check();
    },
    async uploadVideo(file, signal, expected) {
      const operation = createOperation(readContext, expected, signal);
      operation.check();
      const page = readContext();
      if (!page.target || page.video !== 'absent' || page.count !== 0)
        throw new Error('页面已有视频或状态不明，不执行上传');
      validateVideo(file);
      const input = videoInput();
      readContext.expectUpload(file);
      try {
        assignFile(input, file, operation);
        await waitFor(
          () => {
            const actual = readContext();
            const taskName = doc
              .querySelector(`${selectors.form} ${selectors.task} ${selectors.taskTitle}`)
              ?.textContent?.trim();
            const hasTitle =
              doc.querySelectorAll(`${selectors.form} ${selectors.title}`).length === 1;
            return actual.count === 1 &&
              hasTitle &&
              (taskName === file.name || taskName === file.name.replace(/\.[^.]+$/, ''))
              ? true
              : undefined;
          },
          operation,
          15_000
        );
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
    async waitVideo(signal, expected) {
      const operation = createOperation(readContext, expected, signal, true);
      let previous = '',
        lastChange = Date.now();
      let unknownSince: number | undefined;
      await waitFor(
        () => {
          const context = readContext();
          if (!context.target || context.count !== 1 || context.video === 'failed')
            throw new Error('视频状态无法确认');
          if (context.video === 'unknown') {
            unknownSince ??= Date.now();
            if (Date.now() - unknownSince >= 15_000) throw new Error('视频状态连续十五秒无法确认');
            return undefined;
          }
          unknownSince = undefined;
          const status =
            doc.querySelector('.file-item-content')?.textContent ??
            doc.querySelector('.file-item-content-status')?.textContent ??
            '';
          if (status !== previous) {
            previous = status;
            lastChange = Date.now();
          }
          if (context.video !== 'ready' && Date.now() - lastChange > 3 * 60 * 1000)
            throw new Error('视频状态连续三分钟未变化，停止等待；请在原页面检查');
          return context.video === 'ready' ? true : undefined;
        },
        operation,
        30 * 60 * 1000,
        1000
      );
    },
    verifyVideo() {
      const actual = readContext().video;
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
