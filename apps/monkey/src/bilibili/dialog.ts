import { visible } from './controls';
import { waitFor, type Operation } from './operation';

/** Restore only the scroll lock left by a dialog opened by this operation. */
export function captureDialogScroll(doc: Document) {
  const body = doc.body;
  const properties = ['overflow', 'overflow-x', 'overflow-y'];
  const before = Array.from(body.style)
    .filter((name) => properties.includes(name))
    .map((name) => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
  const initiallyLocked = ['hidden', 'clip'].includes(
    doc.defaultView!.getComputedStyle(body).overflowY || body.style.overflow
  );

  return async (operation: Operation) => {
    // BccDialog restores the value captured at mount, which may itself be hidden.
    // Let every native dialog finish closing before restoring or opening another.
    await waitFor(
      () =>
        !Array.from(
          doc.querySelectorAll(
            '.bcc-dialog__wrap, .bcc-dialog, [role="dialog"], [aria-modal="true"]'
          )
        ).some(visible) || undefined,
      operation
    );
    if (doc.body !== body || initiallyLocked || body.style.overflow !== 'hidden') return;
    operation.write(() => {
      for (const name of properties) body.style.removeProperty(name);
      for (const [name, value, priority] of before) body.style.setProperty(name, value, priority);
    });
  };
}
