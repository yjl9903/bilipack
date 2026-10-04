import type { Position } from 'bilipack';
import type { CoverImage } from '../input/types';
import { one, visible } from './controls';
import { assignFile, waitFor as poll, click, type Operation } from './operation';
import type { Evidence } from '../workflow/port';
/** Drag from the native editor's centered, minimum-fit image to the requested crop. */
export function coverPan(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  [horizontal, vertical]: Position
) {
  if (![width, height, viewportWidth, viewportHeight].every((n) => Number.isFinite(n) && n > 0))
    throw new Error('无效原生封面裁剪尺寸');
  const scale = Math.max(viewportWidth / width, viewportHeight / height);
  return {
    x: ((50 - horizontal) / 100) * (width * scale - viewportWidth),
    y: ((50 - vertical) / 100) * (height * scale - viewportHeight)
  };
}

export function createCover(doc: Document) {
  const all = <T extends Element = HTMLElement>(selector: string, root: ParentNode = doc) =>
    Array.from(root.querySelectorAll<T>(selector)).filter(visible);
  const get = <T extends Element = HTMLElement>(selector: string, root?: ParentNode) =>
    one(all<T>(selector, root), selector);
  const exact = (selector: string, text: string, root?: ParentNode) =>
    one(
      all(selector, root).filter((e) => e.textContent?.trim() === text),
      text
    );
  const coverDialog = () => get('.cover-editor');
  let stage = '附件';
  const waitFor: typeof poll = async (...args) => {
    try {
      return await poll(...args);
    } catch (error) {
      throw new Error(`${stage}：${(error as Error).message}`);
    }
  };
  const covers = new Map<string, string>();
  let expectedSync: boolean | undefined;
  const id = (ratio: string) => (ratio === '16:9' ? '16_9' : '4_3');
  const canvas = (ratio: string) =>
    get<HTMLCanvasElement>(`#editor_${id(ratio)} canvas.lower-canvas`, coverDialog());
  const syncInput = (ratio: string) =>
    one(
      Array.from(
        coverDialog().querySelectorAll<HTMLInputElement>(
          `.sync.ratio_${id(ratio)} input[type=checkbox]`
        )
      ),
      '封面同步开关'
    );
  // Small DOM canvas fingerprint, including crop geometry, of the current form.
  // This detects later changes; it proves neither source-pixel equality nor final save.
  function fingerprint(ratio: string) {
    const source = canvas(ratio),
      sample = doc.createElement('canvas');
    sample.width = 32;
    sample.height = 24;
    const ctx = sample.getContext('2d');
    if (!ctx || !source.width || !source.height) throw new Error('封面画布尚未就绪');
    ctx.drawImage(source, 0, 0, 32, 24);
    const pixels = ctx.getImageData(0, 0, 32, 24).data;
    if (!pixels.some((v, i) => i % 4 === 3 && v !== 0)) throw new Error('封面画布为空');
    const crop = get<HTMLElement>(`#editor_${id(ratio)} .crop-box-fixed`, coverDialog()).style;
    return sample.toDataURL() + [crop.left, crop.top, crop.width, crop.height].join(',');
  }
  async function openCover(operation: Operation) {
    operation.check();
    if (all('.cover-editor').length) throw new Error('已有封面弹窗，请先关闭后重试');
    stage = '打开封面编辑器';
    click(get('.cover-module-main .cover-img, .cover-module-main .cover-empty'), operation);
    await waitFor(() => (all('.cover-editor').length === 1 ? true : undefined), operation);
    await waitFor(
      () =>
        all('#editor_16_9', coverDialog()).length === 1 &&
        all('#editor_4_3', coverDialog()).length === 1
          ? true
          : undefined,
      operation
    );
  }
  async function closeCover(operation: Operation) {
    operation.check();
    stage = '关闭封面编辑器';
    click(get('.cover-editor-button .button:not(.submit)', coverDialog()), operation);
    await waitFor(() => (!all('.cover-editor').length ? true : undefined), operation);
  }
  return {
    async applyCovers(
      files: readonly Pick<CoverImage, 'ratio' | 'file' | 'source'>[],
      operation: Operation
    ) {
      covers.clear();
      expectedSync = undefined;
      const single = files[0].source.mode === 'single';
      expectedSync = single;
      await openCover(operation);
      for (const [index, { ratio, source }] of files.entries()) {
        stage = `激活 ${ratio} 封面槽位`;
        const dialog = coverDialog();
        // Single uses one synchronized source, dual uses independent sources.
        const slot = get(`#editor_${id(ratio)}`, dialog);
        const surface = get('canvas.upper-canvas', slot),
          rect = surface.getBoundingClientRect();
        for (const type of ['mousedown', 'mouseup', 'click'])
          operation.write(() =>
            surface.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: doc.defaultView,
                clientX: rect.x + rect.width / 2,
                clientY: rect.y + rect.height / 2,
                button: 0
              })
            )
          );
        await waitFor(
          () => (slot.parentElement?.classList.contains('active') ? true : undefined),
          operation
        );
        const sync = syncInput(ratio);
        if (sync.checked !== single)
          click(get(`.sync.ratio_${id(ratio)} .bcc-checkbox`, dialog), operation);
        await waitFor(() => (syncInput(ratio).checked === single ? true : undefined), operation);
        if (!single || index === 0) {
          const beforeSources = new Set(
            Array.from(dialog.querySelectorAll('img')).map((img) => img.src)
          );
          stage = `上传 ${ratio} 封面并读取画布`;
          assignFile(
            one(
              Array.from(
                dialog.querySelectorAll<HTMLInputElement>(
                  'input[type=file][accept="image/png, image/jpeg"]'
                )
              ),
              '封面文件'
            ),
            source.file,
            operation
          );
          let last = '',
            settled = Date.now();
          await waitFor(
            () => {
              // A new preview URL proves this file's change event was accepted even
              // when the user reimports the same image and its pixels are unchanged.
              if (
                !Array.from(dialog.querySelectorAll('img')).some(
                  (img) =>
                    img.src.startsWith('blob:') && !beforeSources.has(img.src) && img.complete
                )
              )
                return undefined;
              try {
                const value = fingerprint(ratio);
                if (value !== last) {
                  last = value;
                  settled = Date.now();
                }
                return Date.now() - settled >= 300 ? true : undefined;
              } catch {
                return undefined;
              }
            },
            operation,
            15_000
          );
        }
        if (source.mode === 'single') {
          stage = `调整 ${ratio} 原图裁剪位置`;
          const box = get('.crop-box-fixed', slot).getBoundingClientRect();
          const pan = coverPan(source.width, source.height, box.width, box.height, source.position);
          const x = box.x + box.width / 2,
            y = box.y + box.height / 2;
          operation.write(() =>
            surface.dispatchEvent(
              new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: doc.defaultView,
                button: 0,
                buttons: 1,
                clientX: x,
                clientY: y
              })
            )
          );
          operation.write(() =>
            doc.dispatchEvent(
              new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: doc.defaultView,
                button: 0,
                buttons: 1,
                clientX: x + pan.x,
                clientY: y + pan.y
              })
            )
          );
          operation.write(() =>
            doc.dispatchEvent(
              new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: doc.defaultView,
                button: 0,
                buttons: 0,
                clientX: x + pan.x,
                clientY: y + pan.y
              })
            )
          );
          let last = '',
            settled = Date.now();
          await waitFor(
            () => {
              const value = fingerprint(ratio);
              if (value !== last) {
                last = value;
                settled = Date.now();
              }
              return Date.now() - settled >= 300 ? true : undefined;
            },
            operation,
            15_000
          );
        }
      }
      stage = '统一确认双比例封面';
      click(get('.cover-editor-button .submit', coverDialog()), operation);
      await waitFor(
        () =>
          !all('.cover-editor').length && all('.cover-module-main .cover-img').length === 1
            ? true
            : undefined,
        operation,
        30_000
      );
      // Reopen the locally confirmed form state. This is not evidence of a saved
      // or published cover, or a pixel comparison with the requested source file.
      await openCover(operation);
      for (const { ratio } of files) {
        if (syncInput(ratio).checked !== expectedSync) throw new Error('封面同步状态未保持');
        const actual = await waitFor(
          () => {
            try {
              return fingerprint(ratio);
            } catch {
              return undefined;
            }
          },
          operation,
          15_000
        );
        covers.set(ratio, actual);
      }
      await closeCover(operation);
    },
    async verifyCover(ratio: '16:9' | '4:3', operation: Operation): Promise<Evidence> {
      const expected = covers.get(ratio);
      if (!expected) return { matches: false, message: '没有本次封面上传证据' };
      await openCover(operation);
      try {
        const actual = await waitFor(
          () => {
            try {
              return fingerprint(ratio);
            } catch {
              return undefined;
            }
          },
          operation,
          15_000
        );
        const matches = actual === expected && syncInput(ratio).checked === expectedSync;
        return {
          matches,
          actual: ratio,
          message: matches
            ? `${expectedSync ? '单图同步开启' : '双图同步关闭'}；当前表单封面重开读回一致；尚未提交保存`
            : '封面画布、裁剪或同步状态已变化'
        };
      } finally {
        await closeCover(operation);
      }
    }
  };
}
