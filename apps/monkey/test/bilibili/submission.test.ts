import { expect, it } from 'vitest';
import { isSubmissionWaiting } from '../../src/bilibili/submission';

const waitText = '等待视频上传完后会自动提交，请勿关闭当前页面 取消自动提交';

it('does not classify an ordinary visible editor as submission waiting', () => {
  // Native wait markup may already exist, and user text may contain these words.
  expect(isSubmissionWaiting(waitText, false, 1, true)).toBe(false);
  expect(isSubmissionWaiting('上传中... 基本设置 标题', false, 1, true)).toBe(false);
  expect(isSubmissionWaiting('', false, 1, false)).toBe(false);
});

it('accepts a genuine visible wait screen even if hidden title markup remains', () => {
  expect(isSubmissionWaiting(waitText, false, 1, false)).toBe(true);
});

it('recognizes the native wait phase only for a new submission with videos', () => {
  expect(isSubmissionWaiting(waitText, false, 1)).toBe(true);
  expect(isSubmissionWaiting(waitText, true, 1)).toBe(false);
  expect(isSubmissionWaiting(waitText, false, 2)).toBe(true);

  expect(isSubmissionWaiting('取消自动提交', false, 1)).toBe(false);
});
