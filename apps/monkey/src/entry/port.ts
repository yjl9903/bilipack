/** Native entry patch capabilities, injected by main independently of the execution port. */
export interface UploadEntry {
  directoryEntryTarget(): HTMLElement | null;
  directoryEntryPresentation(): { content: HTMLElement; icon: SVGElement } | null;
  nativeVideoEntry(files?: readonly File[]): void;
}
