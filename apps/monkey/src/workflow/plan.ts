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
        : target.field === 'publish.collection_update_push'
          ? ['editor.ready', 'publish.collection']
          : prepared.config.info?.declaration !== undefined &&
              ['info.source', 'info.topic', 'display.watermark'].includes(target.field)
            ? ['editor.ready', 'info.declaration']
            : ['editor.ready'],
    async execute(c) {
      const tags = c.prepared.config.info?.tags;
      if (
        target.field === 'info.topic' &&
        target.value &&
        tags !== undefined &&
        c.adapter.readField('info.topic') !== target.value
      ) {
        const actual = c.adapter.readField('info.tags');
        if (!Array.isArray(actual) || !actual.every((tag) => typeof tag === 'string'))
          throw new Error('无法读取普通标签，未调整话题');
        // Only remove explicitly unwanted tags here; additions wait until after the topic.
        const retained = actual.filter((tag) => tags.includes(tag));
        if (retained.length !== actual.length) {
          const cleanup = { field: 'info.tags', value: retained } as const;
          const capability = c.adapter.capability(cleanup.field, cleanup.value);
          if (!capability.available) throw new Error(capability.reason ?? '无法清理普通标签');
          await c.adapter.applyField(cleanup, c.signal, c.page);
          c.signal.throwIfAborted();
          c.adapter.assertContext(c.page);
          const evidence = await c.adapter.verifyField(cleanup, c.signal, c.page);
          c.signal.throwIfAborted();
          c.adapter.assertContext(c.page);
          if (!evidence.matches)
            throw new Error(`普通标签清理尚未确认，未调整话题：${evidence.message}`);
        }
      }
      await c.adapter.applyField(target, c.signal, c.page);
    },
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
