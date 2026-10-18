import { expect, it } from 'vitest';
import { isSubmissionWaiting, acceptsSubmissionCaption } from '../../src/bilibili/submission';

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

it('recognizes the native wait phase only for a single new submission', () => {
  expect(isSubmissionWaiting(waitText, false, 1)).toBe(true);
  expect(isSubmissionWaiting(waitText, true, 1)).toBe(false);
  expect(isSubmissionWaiting(waitText, false, 2)).toBe(false);

  expect(isSubmissionWaiting('取消自动提交', false, 1)).toBe(false);
});

it('accepts the entered-title caption without accepting a different task or route', () => {
  expect(acceptsSubmissionCaption(true, true, true, '填写标题', '文件名', '填写标题')).toBe(true);
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(true, false, true, '填写标题', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(true, true, true, '另一稿件', '文件名', '填写标题')).toBe(false);
  expect(acceptsSubmissionCaption(false, true, true, '填写标题', '文件名', '填写标题')).toBe(true);
});

it('accepts a rebuilt waiting task only with the same native video file title', () => {
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题', true)).toBe(
    true
  );
  expect(acceptsSubmissionCaption(true, true, false, '填写标题', '文件名', '填写标题', false)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(true, false, false, '填写标题', '文件名', '填写标题', true)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(false, true, false, '填写标题', '文件名', '填写标题', true)).toBe(
    false
  );
  expect(acceptsSubmissionCaption(true, true, false, '另一稿件', '文件名', '填写标题', true)).toBe(
    false
  );
});
