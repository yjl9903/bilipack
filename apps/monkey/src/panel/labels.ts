// Field captions in the native form; execution progress keeps its action wording.
const labels: Record<string, string> = {
  'video.upload': '选择视频',
  'editor.ready': '投稿表单',
  'video.ready': '视频上传状态',
  import: '目录',
  'bilipack.toml': '配置文件',
  'cover.16:9': '个人空间封面（16:9）',
  'cover.4:3': '首页推荐封面（4:3）',
  'info.title': '标题',
  'info.category': '分区',
  'info.declaration': '创作声明',
  'info.tags': '标签',
  'info.description': '简介',
  'info.no_reprint': '禁止转载',
  'info.topic': '话题',
  'info.source': '转载来源',
  'info.copyright': '转载类型',
  'publish.scheduled': '定时发布',
  'publish.at': '发布时间',
  'publish.collection': '合集',
  'display.watermark': '水印',
  'display.visibility': '可见范围',
  'display.hide_from_profile': '在个人空间-投稿中隐藏',
  'commercial.enabled': '增加商业推广信息',
  'media.dolby_audio': '杜比音效',
  'media.hires_audio': 'Hi-Res无损音质',
  'media.panorama': '全景视频',
  'interaction.dynamic': '粉丝动态',
  'interaction.comments': '关闭评论',
  'interaction.danmaku': '关闭弹幕',
  'interaction.selected_comments': '开启精选评论'
};

export function resultName(id: string): string {
  if (id.startsWith('cover.')) return labels[id] ?? `封面 ${id.slice(6)}`;
  if (id.startsWith('subtitles.')) return `字幕 ${id.slice(10)}`;
  return labels[id] ?? '配置项';
}

const names: Record<string, string> = {
  'video.upload': '选择视频',
  'editor.ready': '等待投稿编辑表单',
  'video.ready': '确认视频上传完成',
  import: '导入目录',
  'bilipack.toml': '检查配置文件',
  'info.declaration': '设置创作声明',
  'info.no_reprint': '设置禁止转载',
  'info.topic': '设置话题',
  'publish.collection': '设置合集',
  'display.watermark': '设置水印',
  'display.visibility': '设置可见范围',
  'display.hide_from_profile': '设置个人空间展示',
  'commercial.enabled': '设置商业推广',
  'media.dolby_audio': '设置杜比音效',
  'media.hires_audio': '设置无损音质',
  'media.panorama': '设置全景视频',
  'interaction.dynamic': '填写动态',
  'interaction.comments': '设置评论',
  'interaction.danmaku': '设置弹幕',
  'interaction.selected_comments': '设置精选评论',
  'info.title': '填写标题',
  'info.description': '填写简介',
  'info.tags': '填写标签',
  'info.category': '选择分区',
  'info.source': '填写转载来源',
  'info.copyright': '设置转载类型',
  'publish.scheduled': '设置定时发布',
  'publish.at': '填写发布时间'
};
export function stepName(id: string): string {
  if (id.startsWith('cover.')) return `设置${resultName(id)}`;
  if (id.startsWith('subtitles.')) return `上传 ${id.slice(10)} 字幕`;
  return names[id] ?? id;
}

export function progressLabel(
  progress: import('../application/types').ApplicationProgress
): string {
  if (progress.phase === 'compared') return '比对完成，等待写入';
  const activities = {
    pick: '等待选择 Bilipack 目录',
    drop: '读取拖入的 Bilipack 目录',
    'read-config': '读取配置文件',
    prepare: '校验配置与准备附件',
    'check-page': '检查当前页面'
  };
  if (progress.phase in activities) return activities[progress.phase as keyof typeof activities];
  const phases = {
    execute: '正在执行',
    verify: '正在核验',
    observe: '等待视频',
    repair: '正在修复',
    compare: '正在比对'
  };
  const step = progress as import('../workflow/types').Progress;
  return `${phases[step.phase as keyof typeof phases]}：${stepName(step.id ?? '')}`;
}

export const resultStatusLabels = {
  verified: '已完成',
  skipped: '已跳过',
  failed: '失败',
  blocked: '未执行',
  unverified: '待核验',
  different: '有差异',
  pending: '等待执行',
  running: '执行中',
  verifying: '核验中',
  waiting: '等待上传完成'
};

export function resultStatusLabel(status: import('../workflow/types').Status, comparison = false) {
  return comparison && status === 'verified' ? '一致' : resultStatusLabels[status];
}

export const panelStatusLabels = {
  preparing: '准备中',
  comparing: '比对中',
  'awaiting-write': '待写入',
  'video-wait': '视频上传中',
  executing: '执行中',
  completed: '填写完成',
  attention: '待处理',
  error: '异常',
  interrupted: '已中断'
};
