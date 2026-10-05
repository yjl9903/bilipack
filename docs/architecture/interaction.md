# 从用户操作到状态反馈

用户通过入口选择目录、查看比对结果、确认写入并检查最终反馈。application/controller 连接这些动作与输入准备、任务执行，application/presentation 投影附件、汇总及结果阶段，UI 只展示 controller 提供的状态。本文沿用户操作链路说明状态如何产生及回到界面，不重新定义配置或执行器的数据模型。

## 1. 用户选择目录，controller 接管本轮流程

UI 调用 controller 的导入入口。原生目录选择必须在用户点击的调用链中同步触发；选择取消保留原结果，执行中禁用重复导入。

空白上传页的原生入口与已有视频页的浮窗分别订阅同一个 controller，由应用入口独立挂载。入口将目录点击和目录拖放交给 controller，视频点击与视频拖放转交 main 注入的独立 UploadEntry 原生视频操作；浮窗消费展示状态并发出导入、写入和清除意图。二者不直接调用对方，页面切换时各自按展示状态调整呈现。

controller 管理当前准备数据、活动取消信号和页面绑定，调用 [输入准备链路](input.md) 取得 `Prepared`。读取原文后即可展示原文；输入校验失败时反馈诊断，用户仍能检查配置，不需要成功执行才能查看输入。

## 2. 准备结果转换成可展示附件

UI 不直接使用配置对象决定平台行为。presentation 将已准备素材转换成 [Attachment](../../apps/monkey/src/application/types.ts)，同步投影文件名、大小、预览地址及输入准备时保存的字幕文本，不新增文件读取或异步展示前置条件：

```typescript
interface AttachmentMetadata {
  name: string;
  size: number;
  kind: string;
}
export type VideoAttachment = AttachmentMetadata & { type: 'video'; file: File };
export type CoverAttachment = AttachmentMetadata & {
  type: 'cover';
  cover: Pick<CoverImage, 'ratio' | 'source'>;
  url: string;
};
export type SubtitleAttachment = AttachmentMetadata & {
  type: 'subtitle';
  source: string;
  language: string;
};
export type Attachment = VideoAttachment | CoverAttachment | SubtitleAttachment;
```

Attachment 按 type 区分三种附件：视频必须带 file，封面必须带 cover 和 url，字幕必须带 language 和 source。组件只接收对应类型，不兼容缺少内部必需信息的附件；没有附件时以空集合表达。它们描述本地素材，不是平台上传成功的证明。资源由准备与协调流程管理，组件展示预览不能自行把结果标为通过。

封面的附件元信息与结果目标文件名来自 `CoverImage.source.file`，不展示内部裁剪预览文件名。预览、结果及进度统一使用「个人空间封面（16:9）」「首页推荐封面（4:3）」名称。

## 3. 按页面起点推进交互

空白页在预检通过后进入执行；已有视频页面先只读比对，controller 发布差异及可否写入，等待用户点击「写入配置」。写入前再次确认仍为同一稿件；页面变化使此前待写入状态失效。

具体比对、步骤调度和核验由 [任务执行链路](workflow.md) 完成。controller 接收 `Result[]` 与当前步骤反馈，更新界面状态；UI 不直接调用平台写入，也不从动画、进度或预览推断完成。

## 4. ViewState 将流程结果投影到 UI

[ViewState](../../apps/monkey/src/application/types.ts) 是 controller 的订阅数据，包含输入展示、结果展示及交互状态：

```typescript
export interface ViewState {
  directoryName: string | null;
  visible: boolean;
  panelVisible?: boolean;
  panelInitiallyExpanded?: boolean;
  busy: boolean;
  panelStatus?: PanelStatus;
  currentStep?: ApplicationProgress;
  comparison?: boolean;
  canWrite?: boolean;
  raw: string | null;
  attachments: Attachment[];
  results: Result[];
  summary: string;
}
```

- `raw`、`attachments` 保留本次输入供用户检查。
- `results`、`summary` 展示核验结论与未完成原因，不能用汇总隐藏单项失败。
- 校验页的结果清单隐藏内部「投稿表单就绪」步骤；该步骤仍参与执行与完成判断，异常原因保留在总结页。
- `busy`、`canWrite`、`comparison` 控制用户动作，`panelStatus`、`currentStep` 提供流程反馈。
- `visible`、`panelVisible` 等描述入口和面板呈现，不改变领域目标或平台事实。

controller 的 `subscribe` 提供初始状态及后续更新，卸载时取消订阅。展示状态由当前输入和流程结果派生，不成为第二份可修改配置或页面事实。

## 5. 用户接手，结束本轮生命周期

执行失败保留原生页面现场，结果说明哪些项目未完成；controller 在同一稿件允许手动重试时重新提供写入入口，由任务流程核验已完成项并处理未完成项。

清除目录只清除本地选择、结果和预览，不清空原生页面；运行期间不允许清除。页面或稿件变化停止旧任务并撤销待写入资格。卸载时终止异步工作、释放预览和监听，避免旧实例继续发布状态。

原生入口卸载时取消订阅、移除自有节点与样式，恢复其隐藏的原生内容和调整的挂载位置；浮窗卸载时清理 Vue 实例及 Shadow Root 宿主。应用装配层统一调用两侧清理及 controller、页面观察器清理。

表单操作结束后统一进入视频等待状态，界面说明页面已交还用户，仅继续观察视频完成；用户留在表单页或进入平台投稿等待页不改变此流程。观察结束后统一汇总结果，保留逐项核验的时间边界。最终投稿、存草稿及保存修改由用户在原生页面完成，准备结果不能被解释为最终提交成功。

## 展示投影与文案

Prepared 的原文、素材引用及结构化 Result 由 application/presentation 投影为 Attachment、汇总及应用阶段；controller 管理流程和发布，不内嵌附件展示组装。workflow 进度只提供 phase 和 id，不导入面板文案。panel/labels 统一字段、动作及状态文案，panel/status 管理颜色和 loading；面板将进度映射为用户可读动作。

浮窗可见性直接消费 PageContext.editor 或 submissionWaiting，不从视频数量推断编辑表单。字幕预览组件归一当前语言并通过 v-model 与目录卡片共享，供视频预览使用；目录卡片不重复归一同一状态。
