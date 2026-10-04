# 从视频包到可执行输入

用户选择的视频包先经过配置解释和素材准备，得到 `Prepared`，才能交给任务流程。本文沿这条链路说明领域库和浏览器资源层如何协作；不涉及页面写入和 UI 状态。

## 1. 读取目录，保留输入原文

目录选择提供用户授权访问的文件集合。资源层去除共同根目录，建立相对路径到 `File` 的索引，再读取根目录的 `bilipack.toml`。路径精确匹配，不模糊查找同名文件，也不能越过所选目录。

原文和文件索引是两份互补输入：原文表达用户意图，索引解析附件引用。配置错误时仍保留原文供诊断，不先修改平台表单。大视频保持文件引用，不整体读取为文本或复制到内存。

## 2. 解析配置，明确要修改的内容

领域库将 TOML 解析为 `Config`，检查字段、类型与组合规则。它只处理文本和配置语义，不依赖浏览器文件、UI 或平台控件。公开字段的用户含义由需求文档定义。

以下是 [配置类型](../../packages/bilipack/src/config/types.ts) 中的实际结构：

```typescript
/** Percent of crop travel on each axis (0..100), shared by preview and native drag mapping. */
export type Position = [number, number];

export interface Config {
  video?: { file: string };
  /** Source modes: single enables native sync and uploads one original, dual disables it.
   * wide = personal space (16:9), standard = home recommendation (4:3).
   * Schema validity does not imply support by the current page adapter.
   */
  cover?:
    | { mode: 'single'; file: string; wide_position: Position; standard_position: Position }
    | { mode: 'dual'; wide_file: string; standard_file: string };
  info?: {
    title?: string;
    declaration?: string;
    no_reprint?: boolean;
    category?: string;
    tags?: string[];
    topic?: string;
    description?: string;
  };
  publish?: { scheduled?: boolean; at?: string; collection?: string };
  display?: {
    watermark?: boolean;
    visibility?: '公开可见' | '仅自己可见';
    hide_from_profile?: boolean;
  };
  commercial?: { enabled?: boolean };
  media?: { dolby_audio?: boolean; hires_audio?: boolean; panorama?: boolean };
  interaction?: {
    dynamic?: string;
    comments?: boolean;
    danmaku?: boolean;
    selected_comments?: boolean;
  };
  subtitles?: { file: string; language: string }[];
}
```

可选字段不是默认填写整张表单：缺省表示保持现状，显式 `false`、空字符串和空列表仍表达关闭或清空的意图。封面的联合类型区分单原图加构图位置与独立双文件；字幕用语言关联素材路径。

这里得到的是有效配置，还不是可用附件，更不代表平台已支持所有字段。

## 3. 解析附件，完成流程所需的预检

应用预检将配置路径解析为文件，校验字幕并准备封面。协调层将页面上下文转换为明确的 PreparationConditions（requireVideo），input 不接收适配器或页面控件。空白页要求非空视频，已有视频页允许省略，并可保留本地视频供预览。视频格式、单稿件范围、未知或失败的视频状态、仅指定发布时间时的页面开关检查，由协调层通过平台契约在比对和写入之前完成；失败仍不修改页面。配置语义、附件合法性与平台操作能力分别判断。

封面准备使用 [CoverImage](../../apps/monkey/src/input/types.ts) 保存两个比例的素材和来源：

```typescript
export interface CoverImage {
  ratio: '16:9' | '4:3';
  file: File;
  url: string;
  source: CoverSource;
}
export type CoverSource = {
  file: File;
  width: number;
  height: number;
} & ({ mode: 'single'; position: Position } | { mode: 'dual' });
```

`file` 与 `url` 支持目标预览，`source` 必须保留原图及构图信息，单图必须携带裁剪位置，双图不携带位置；这些信息让后续平台操作能够区分原图和预览图。准备结果说明“准备使用什么”，不证明页面已接受附件。预览资源在替换输入或卸载时释放。

## 4. 交出稳定的 Prepared

预检通过后，将原文、配置和文件引用组合为 [Prepared](../../apps/monkey/src/input/types.ts)：

```typescript
export interface Prepared {
  raw: string;
  config: Readonly<Config>;
  covers: CoverImage[];
  subtitles: { language: string; file: File; source: string }[];
  video?: File;
}
```

`raw` 用于保留用户原文，`config` 用于业务判断，目录索引仅在准备阶段用于路径解析，不传入执行上下文；`covers`、`subtitles` 和可选 `video` 是已准备的附件。字幕的 source 保存校验 SRT 时一次读取的原文，后续展示不再读取文件。后续流程使用同一份 `Prepared`，不在执行时重新解释配置。

预检失败返回诊断并释放已经创建的临时资源，链路停在输入阶段。通过后进入 [任务执行与核验](workflow.md)：从 `config` 提取普通字段目标，结合页面上下文生成步骤。原文与附件如何呈现给用户，由 [交互与状态反馈](interaction.md) 说明。
