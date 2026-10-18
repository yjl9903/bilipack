import { createController } from '../../src/application/controller';
import type { PageAdapter } from '../../src/workflow/port';
import { onCleanup } from './cleanup';

/** Real controller and input/workflow chain, with failure-safe disposal. */
export function createTestController(adapter: PageAdapter) {
  const controller = createController(adapter);
  controller.dispose = onCleanup(controller.dispose);
  return controller;
}
