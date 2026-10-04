/** Observed in the live new-upload form on 2026-10-04. See repository docs/reference/bilibili-upload.md.
 * Selectors are evidence of structure, not proof of upload/event acceptance. */
export const selectors = {
  form: '#video-up-app',
  entrance: '.video-entrance .upload-wrp',
  entranceInput: '.video-entrance .bcc-upload-wrapper input[type="file"][accept^=".mp4,"]',
  queue: '.upload-queue',
  task: '.upload-queue .task',
  taskTitle: '.task-title-text',
  taskStatus: '.task-status .text',
  title: 'input[placeholder="请输入稿件标题"]',
  uploadArea: '.bcc-upload-wrapper .upload-area',
  videoInput: 'input[type="file"][name="buploader"][accept^=".mp4,"]'
} as const;
