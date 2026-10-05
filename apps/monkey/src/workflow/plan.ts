import { fieldTargets } from 'bilipack';
import type { Prepared } from '../input/types';
import type { Step } from './types';
import type { PageContext } from './port';
export function plan(prepared: Prepared, page: PageContext): Step[] {
  const steps: Step[] = [
    {
      id: 'video.upload',
      role: page.video === 'absent' ? 'target' : 'condition',
      expected: page.video === 'absent' ? prepared.video?.name : undefined,
      retry: 'execute',
      capability: { field: 'video' },
      dependsOn: [],
      ...(page.video !== 'absent' ? { skip: '页面已有视频，跳过视频上传' } : {}),
      async execute(c) {
        if (!c.prepared.video) throw new Error('缺少视频文件');
        await c.adapter.uploadVideo(c.prepared.video, c.signal, c.page);
      },
      verify(c) {
        const actual = c.adapter.context();
        const matches =
          actual.count === 1 && (actual.video === 'uploading' || actual.video === 'ready');
        return {
          matches,
          actual: actual.video,
          message: matches ? '视频选择成功，已进入上传流程' : '未确认视频选择成功'
        };
      }
    },
    {
      id: 'editor.ready',
      role: 'condition',
      retry: 'execute',
      dependsOn: ['video.upload'],
      execute: (c) => c.adapter.waitEditor(c.signal, c.page),
      verify: (c) => c.adapter.verifyEditor()
    }
  ];
  const fieldSteps: Step[] = fieldTargets(prepared.config).map((target) => ({
    id: target.field,
    role: 'target',
    capability: { field: target.field, value: target.value },
    expected: target.value,
    dependsOn:
      target.field === 'publish.at' && prepared.config.publish?.scheduled !== undefined
        ? ['editor.ready', 'publish.scheduled']
        : ['editor.ready'],
    execute: (c) => c.adapter.applyField(target, c.signal, c.page),
    verify: (c) => c.adapter.verifyField(target, c.signal, c.page),
    ...(target.field === 'info.tags'
      ? {
          repair: (c: import('./types').RunContext) =>
            c.adapter.applyField(target, c.signal, c.page)
        }
      : {})
  }));
  steps.push(...fieldSteps.filter((step) => step.id !== 'info.tags'));
  const coverGroup: import('./types').StepGroup = {
    id: 'covers',
    execute: (c) => c.adapter.applyCovers(c.prepared.covers, c.signal, c.page)
  };
  for (const cover of prepared.covers)
    steps.push({
      id: `cover.${cover.ratio}`,
      role: 'target',
      group: coverGroup,
      capability: { field: 'cover', value: prepared.config.cover },
      dependsOn: ['editor.ready'],
      expected: cover.source.file.name,
      verify: (c) => c.adapter.verifyCover(cover.ratio, c.signal, c.page)
    });
  steps.push(...fieldSteps.filter((step) => step.id === 'info.tags'));
  for (const s of prepared.subtitles)
    steps.push({
      id: `subtitles.${s.language}`,
      role: 'target',
      capability: { field: 'subtitles', value: s.language },
      dependsOn: ['editor.ready'],
      expected: s.file.name,
      execute: (c) => c.adapter.applySubtitle(s.language, s.file, c.signal, c.page),
      verify: (c) => c.adapter.verifySubtitle(s.language, c.signal, c.page)
    });
  steps.push({
    id: 'video.ready',
    role: 'condition',
    retry: 'execute',
    allowDuringSubmission: true,
    dependsOn: ['video.upload'],
    execute: (c) => c.adapter.waitVideo(c.signal, c.page),
    verify: (c) => c.adapter.verifyVideo()
  });
  return steps;
}
