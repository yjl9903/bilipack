import { z } from 'zod';

import { normalizePath } from '../paths';
import { validCalendarDate } from './dates';

const string = z.string({ error: '必须是 string' });
const boolean = z.boolean({ error: '必须是 boolean' });
const section = <S extends z.ZodRawShape>(shape: S) =>
  z.strictObject(shape, { error: '必须是配置区块' });

/** 相对于 bilipack.toml 所在目录的附件路径，引用文件必须位于视频包内。 */
const path = z.string({ error: '必须是文件相对路径' }).transform((value, ctx) => {
  try {
    return normalizePath(value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: (error as Error).message,
      params: { diagnosticCode: 'path' }
    });
    return z.NEVER;
  }
});

/** 裁剪框在单轴可移动范围内的位置百分比，范围为 0..100。 */
const coordinate = z
  .number({ error: '必须是两个 0..100 的数值' })
  .min(0, '必须是两个 0..100 的数值')
  .max(100, '必须是两个 0..100 的数值');

/**
 * [水平百分比, 垂直百分比]：左上为 [0, 0]，居中为 [50, 50]，右下为 [100, 100]。
 * 位置作用于最大内接裁剪框；某轴没有裁剪余量时，该轴位置不产生作用。
 */
export const positionSchema = z.tuple([coordinate, coordinate], {
  error: '必须是两个 0..100 的数值'
});

const tags = z
  .array(z.string({ error: '必须是字符串数组' }), { error: '必须是字符串数组' })
  .refine((value) => new Set(value).size === value.length, '不能包含重复标签');

// TomlDate.toISOString preserves the original offset and local/offset distinction.
const date = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z
    .string({ error: '必须是包含时区的日期时间' })
    .refine(
      (text) =>
        /^\d{4}-\d{2}-\d{2}[Tt ](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
          text
        ) &&
        Number.isFinite(Date.parse(text)) &&
        validCalendarDate(text),
      '必须是包含时区的日期时间'
    )
);

const cover = section({
  /** 单图 single 使用同一原图适配两种比例；双图 dual 使用独立文件。省略时默认 single。 */
  mode: z.enum(['single', 'dual'], { error: '只支持 single 或 dual' }).default('single'),
  /** 单图模式必填的封面原图路径，不能与双图文件字段混用。 */
  file: path.optional(),
  /** 双图模式必填的个人空间封面（16:9）路径，独立应用于该比例。 */
  wide_file: path.optional(),
  /** 双图模式必填的首页推荐封面（4:3）路径，独立应用于该比例。 */
  standard_file: path.optional(),
  /** 单图模式的个人空间封面（16:9）裁剪位置，省略时默认 [50, 50] 居中。 */
  wide_position: positionSchema.optional(),
  /** 单图模式的首页推荐封面（4:3）裁剪位置，省略时默认 [50, 50] 居中。 */
  standard_position: positionSchema.optional()
}).transform((value, ctx) => {
  if (value.mode === 'single') {
    if (!value.file)
      ctx.addIssue({ code: 'custom', path: ['file'], message: '单图模式必须指定文件' });
    if ('wide_file' in value || 'standard_file' in value)
      ctx.addIssue({ code: 'custom', message: '单图与双图字段不能混用' });
    if (!value.file) return z.NEVER;
    return {
      mode: value.mode,
      file: value.file,
      wide_position: value.wide_position ?? positionSchema.parse([50, 50]),
      standard_position: value.standard_position ?? positionSchema.parse([50, 50])
    };
  }
  if (!value.wide_file || !value.standard_file)
    ctx.addIssue({ code: 'custom', message: '双图模式必须提供两张封面' });
  if (['file', 'wide_position', 'standard_position'].some((key) => key in value))
    ctx.addIssue({ code: 'custom', message: '双图不能使用单图或裁剪位置字段' });
  if (!value.wide_file || !value.standard_file) return z.NEVER;
  return { mode: value.mode, wide_file: value.wide_file, standard_file: value.standard_file };
});

const subtitles = z
  .array(
    section({
      /** 该份字幕文件相对于配置文件的路径，首版使用 SRT。 */
      file: path,
      /** 字幕语言，例如“中文”；必须非空且不能重复，用于添加或更新对应语言的字幕。 */
      language: string.refine((value) => !!value.trim(), '缺少字幕语言')
    }),
    { error: '必须使用 [[subtitles]] 数组' }
  )
  .superRefine((values, ctx) => {
    const languages = new Set<string>();
    values.forEach((value, index) => {
      if (languages.has(value.language))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'language'],
          message: '同语言字幕重复'
        });
      languages.add(value.language);
    });
  });

/**
 * 视频包配置的结构与语义依据 docs/intent/README.md 第 4 节。
 * 未配置的项目保持页面原状；显式 false、空字符串和空列表保留关闭或清空的意图。
 * 页面能力与账号权限单独核验，不反向限制配置范围；最终提交及保存修改由用户完成。
 */
export const configSchema = section({
  /** 单个视频：空白页面必须提供；页面已有视频时允许省略，即使提供也不替换已有视频。 */
  video: section({
    /** 视频文件相对于 bilipack.toml 所在目录的路径。 */
    file: path
  }).optional(),
  /** 封面配置：按所选模式更新两种比例，包括已有稿件；省略时保持原有封面。 */
  cover: cover.optional(),
  /** 投稿信息：只修改显式提供的字段，省略的字段保持页面原状。 */
  info: section({
    /** 稿件标题；空字符串表达清空意图，平台必填要求由页面核验。 */
    title: string.optional(),
    /** 稿件简介，支持多行文字；空字符串表示清空。 */
    description: string.optional(),
    /** 视频内容性质的创作声明，使用需求定义的选项；与内容授权声明独立配置。 */
    declaration: string
      .refine(
        (value) =>
          [
            '内容无需标注',
            '含AI生成内容',
            '含虚构演绎内容',
            '内容含营销信息',
            '个人观点，仅供参考',
            '内容为转载'
          ].includes(value),
        '不支持的创作声明'
      )
      .optional(),
    /** 是否声明“内容为自制：未经作者允许，禁止转载”；显式 false 表示关闭。 */
    no_reprint: boolean.optional(),
    /** 稿件所属分区，按页面上的分区名称填写。 */
    category: string.optional(),
    /** 目标标签列表，不允许重复；空数组表示清空，不擅自增加标签。 */
    tags: tags.optional(),
    /** 希望参与的平台话题或活动，与标签分别配置，不擅自加入话题。 */
    topic: string.optional()
  }).optional(),
  /** 发布与归档设置；自动设置后仍由用户检查并提交。 */
  publish: section({
    /** 是否定时发布：true 必须提供 at，false 不能同时指定 at；省略时保持开关原状。 */
    scheduled: boolean.optional(),
    /** 期望的发布时间，必须含时区且为有效日历日期；仅指定时间时要求页面已启用定时。 */
    at: date.optional(),
    /** 希望加入的已有合集名称。 */
    collection: string.optional()
  })
    .superRefine((value, ctx) => {
      if (value.scheduled === true && !value.at)
        ctx.addIssue({
          code: 'custom',
          path: ['at'],
          message: '开启定时发布必须提供时间'
        });
      if (value.scheduled === false && 'at' in value)
        ctx.addIssue({
          code: 'custom',
          path: ['at'],
          message: '关闭定时发布时不能指定时间'
        });
    })
    .optional(),
  /** 展示设置：水印、可见范围与个人空间展示分别配置。 */
  display: section({
    /** 是否添加水印；显式 false 表示关闭。 */
    watermark: boolean.optional(),
    /** 稿件可见范围：“公开可见”或“仅自己可见”。 */
    visibility: z.enum(['公开可见', '仅自己可见'], { error: '不支持的可见范围' }).optional(),
    /** 是否在个人空间的投稿列表中隐藏稿件，与可见范围独立。 */
    hide_from_profile: boolean.optional()
  }).optional(),
  /** 商业推广信息设置。 */
  commercial: section({
    /** 是否开启页面中的“增加商业推广信息”选项。 */
    enabled: boolean.optional()
  }).optional(),
  /** 音视频设置：只设置显式配置的项目，不给省略的开关添加默认值。 */
  media: section({
    /** 是否开启杜比音效。 */
    dolby_audio: boolean.optional(),
    /** 是否开启 Hi-Res 无损音质。 */
    hires_audio: boolean.optional(),
    /** 是否启用全景视频。 */
    panorama: boolean.optional()
  }).optional(),
  /** 互动设置：粉丝动态文案及评论、弹幕开关。 */
  interaction: section({
    /** 投稿的粉丝动态文案，支持多行文字；空字符串表示清空。 */
    dynamic: string.optional(),
    /** 是否允许评论；显式 false 表示关闭评论。 */
    comments: boolean.optional(),
    /** 是否允许弹幕；显式 false 表示关闭弹幕。 */
    danmaku: boolean.optional(),
    /** 是否开启精选评论。 */
    selected_comments: boolean.optional()
  }).optional(),
  /** 可选字幕列表，以 [[subtitles]] 编写；省略或空列表不操作字幕，未列出的语言保持原状。 */
  subtitles: subtitles.optional()
});
