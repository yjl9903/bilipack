import type { Controller } from '../application/controller';

import { readUploadDrop } from '../input/drop';

import style from './style.css?style';

/** The adapter supplies native-page operations; the overlay owns only the upload UI. */
export function mountDirectoryEntry(
  controller: Controller,
  getTarget: () => HTMLElement | null,
  nativeVideoEntry: (files?: readonly File[]) => void,
  getPresentation: () => { content: HTMLElement; icon: SVGElement } | null
) {
  document.head.append(style);
  const section = document.createElement('section');
  section.id = 'bilipack-upload-section';
  section.setAttribute('aria-label', '上传视频或 Bilipack 目录');
  const area = document.createElement('div');
  area.className = 'bilipack-upload-area';
  const hint = document.createElement('p');
  hint.className = 'bilipack-upload-hint';
  hint.textContent = '点击上传或将视频、Bilipack 目录拖拽到此区域';
  const actions = document.createElement('div');
  actions.className = 'bilipack-upload-actions';
  const video = document.createElement('button');
  video.type = 'button';
  video.id = 'bilipack-video-entry';
  video.textContent = '上传视频';
  const directory = document.createElement('button');
  directory.type = 'button';
  directory.id = 'bilipack-directory-entry';
  directory.textContent = '上传 Bilipack 目录';
  const error = document.createElement('p');
  error.className = 'bilipack-upload-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  actions.append(video, directory);
  area.append(hint, actions, error);
  section.append(area);
  let busy = false;
  let anchor: HTMLElement | null = null;
  let resetPosition: (() => void) | undefined;
  let restorePresentation: (() => void) | undefined;
  const report = (e: unknown) => {
    error.textContent = e instanceof Error ? e.message : String(e);
    error.hidden = false;
  };
  const clearError = () => {
    error.hidden = true;
    error.textContent = '';
  };
  section.addEventListener('click', (event) => event.stopPropagation());
  directory.addEventListener('click', () => {
    if (busy) return;
    clearError();
    void controller.importDirectory();
  });
  video.addEventListener('click', () => {
    if (busy) return;
    clearError();
    try {
      nativeVideoEntry();
    } catch (e) {
      report(e);
    }
  });
  section.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    section.classList.toggle('dragging', !busy);
  });
  section.addEventListener('dragleave', (event) => {
    event.stopPropagation();
    if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget))
      section.classList.remove('dragging');
  });
  section.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    section.classList.remove('dragging');
    if (busy || !event.dataTransfer) return;
    clearError();
    try {
      const selection = readUploadDrop(event.dataTransfer);
      if (selection.kind === 'directory') void controller.importDirectory(selection.read);
      else nativeVideoEntry(selection.files);
    } catch (e) {
      report(e);
    }
  });
  const detach = () => {
    section.remove();
    restorePresentation?.();
    restorePresentation = undefined;
    resetPosition?.();
    resetPosition = undefined;
    anchor = null;
  };
  const unsubscribe = controller.subscribe((state) => {
    const target = state.visible ? getTarget() : null;
    busy = state.busy;
    if (state.panelStatus === 'error') {
      const messages = state.results
        .filter((result) => ['failed', 'blocked'].includes(result.status))
        .map((result) => result.message);
      if (messages.length) report(messages.join('；'));
    }
    video.disabled = directory.disabled = busy;
    section.setAttribute('aria-busy', String(busy));
    if (target?.isConnected) {
      if (anchor !== target || section.parentElement !== target) {
        detach();
        anchor = target;
        const presentation = getPresentation();
        if (presentation) {
          const { content, icon } = presentation;
          const copy = icon.cloneNode(true) as SVGElement;
          copy.classList.add('bilipack-upload-cloud');
          copy.setAttribute('aria-hidden', 'true');
          const style = getComputedStyle(icon);
          copy.style.color = style.color;
          copy.style.fill = style.fill;
          area.prepend(copy);
          // Keep the native controls mounted for forwarding, and retain their layout.
          const visibility = content.style.getPropertyValue('visibility');
          const priority = content.style.getPropertyPriority('visibility');
          content.style.setProperty('visibility', 'hidden');
          restorePresentation = () => {
            copy.remove();
            if (content.style.visibility === 'hidden')
              content.style.setProperty('visibility', visibility, priority);
          };
        }
        if (getComputedStyle(target).position === 'static' || !getComputedStyle(target).position) {
          const previous = target.style.position;
          target.style.position = 'relative';
          resetPosition = () => {
            if (target.style.position === 'relative') target.style.position = previous;
          };
        }
        target.append(section);
      }
    } else detach();
  });
  return () => {
    unsubscribe();
    detach();
    style.remove();
  };
}
