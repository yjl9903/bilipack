# 职责分层与系统边界

需求依据：[产品职责与边界](../intent/README.md#2-产品职责与边界)。

## 系统边界

用户及上游工具负责制作素材、编写配置和组织视频包。Bilipack 负责解释输入、准备当前稿件、核验结果；B 站原生页面负责上传及表单交互，平台负责提交后的保存、审核和发布。

Bilipack 不接管内容制作、批量任务或最终提交，也不将平台内部状态或私有上传协议作为领域模型的一部分。自动化结束意味着准备结果已反馈，不能推断稿件已经保存或发布。

## 分层职责

领域能力位于 `packages/bilipack`，浏览器应用位于 `apps/monkey`。下表中应用内路径均相对于 `apps/monkey/src/`；协调、输入准备、流程和平台适配分别位于 `application/`、`input/`、`workflow/` 和 `bilibili/`。

| 职责 | 代码目录或入口 | 承担的工作与边界 |
| --- | --- | --- |
| 领域解释 | [packages/bilipack/src/](../../packages/bilipack/src/)：`config/`、`paths.ts`、`diagnostics.ts` | 解析配置、校验组合与路径、生成字段目标和诊断；通过 `index.ts` 导出平台无关能力，不依赖浏览器与 UI |
| 应用装配 | [main.ts](../../apps/monkey/src/main.ts) | 创建适配器与 controller，挂载浮窗和上传入口，将页面观察接入 controller，统一清理实例 |
| 目录与视频入口 | [entry/](../../apps/monkey/src/entry/)：`mount.ts`、`style.css` | 接收原生上传区的选择与拖放动作；目录交给 controller，普通视频通过注入回调转交原生控件 |
| 浮窗交互 | [panel/](../../apps/monkey/src/panel/)：`App.vue`、`components/`、`mount.ts`、`utils/` | 展示配置、附件预览与结果，消费 controller 状态并发起用户动作；不直接操作平台表单 |
| 应用协调 | [application/controller.ts](../../apps/monkey/src/application/controller.ts) | 管理导入、比对、确认写入、重试及清理，持有准备数据、页面绑定和取消信号，通过 presentation 投影附件、汇总及应用阶段，向 UI 发布 `ViewState` |
| 流程编排 | [workflow/](../../apps/monkey/src/workflow/)：`compare.ts`、`plan.ts`、`run.ts`、`types.ts`、`port.ts` | 只读比对、步骤规划、执行核验及显式收敛修复；通过平台端口工作，不识别具体控件 |
| 文件与素材准备 | [input/](../../apps/monkey/src/input/)：`prepare.ts`、`types.ts`、`picker.ts`、`drop.ts`、`files.ts`、`cover.ts` | 读取用户选定目录或拖放数据、索引文件、准备封面并管理预览资源；不操作投稿表单 |
| 平台适配 | [bilibili/](../../apps/monkey/src/bilibili/)：`adapter.ts`、`context.ts`、`lifecycle.ts`、`submission.ts`、`cover.ts`、`subtitles.ts` 及控件模块 | 识别页面与稿件、判断能力、操作原生控件、等待和读回结果；不调度上层业务，也不触发最终提交 |

`application/types.ts` 定义展示状态与协调阶段，`input/types.ts` 定义准备输入与封面资源，`workflow/types.ts` 定义执行上下文、步骤、组、进度和结果，`workflow/port.ts` 定义平台契约与读回错误。类型随各自链路解释，目录划分不要求每项职责另建一个包。

交互层由原生上传区入口 `entry/` 和独立浮窗 `panel/` 组成，两者不互相依赖，由应用入口分别装配。原生入口负责自有上传区的点击、拖放、挂载位置及原生入口呈现的隐藏与恢复；平台节点定位和原生视频操作由装配层传入的 UploadEntry 能力提供，目录导入交给 controller，拖放分类复用资源层能力。浮窗负责 Shadow Root、Vue 生命周期、配置与附件预览以及结果文案展示。两者分别维护自己的样式和卸载资源，平台表单与流程规则仍属于原有适配和编排层。

浮窗内部按标签页组织内容，目录卡片负责标签页装配、导航与共享的选择状态，各标签页负责对应内容展示。可复用的窗口、控件和展示组件集中在 `components/ui/`，供各标签页使用；用户操作仍通过上层连接 controller，组件划分不改变执行与核验职责。

## 依赖方向

`main.ts` 装配各部分；`entry/` 与 `panel/` 通过 `application/controller.ts` 发起目录流程和配置写入，controller 调用 input 形成 Prepared，并通过平台契约完成页面条件检查，然后调用 workflow 比对或执行。编排使用库的公开导出和 `workflow/port.ts` 的契约，具体操作由 `bilibili/adapter.ts` 承接。`packages/bilipack` 不依赖应用，`input/` 不依赖平台、controller 或 UI；`bilibili/` 不反向依赖 application 或 UI；workflow 不依赖 panel 文案。

上传区入口 `entry/mount.ts` 复用 `input/drop.ts` 解释拖放；普通视频转交原生控件的回调由 `main.ts` 注入，目录则交给 controller。它负责接收用户输入，不把平台控件规则带进入口或浮窗。

入口 patch 的 UploadEntry 契约独立于流程 PageAdapter，由 entry/port.ts 定义，仅提供入口定位、入口呈现素材及原生视频转发。bilibili 实现这两类能力，main 分别注入 controller 和 entry；流程 mock 不承担入口 DOM 呈现能力。平台内部 Operation 负责每次实际操作的有效性，workflow 负责目标调度。

平台操作契约围绕「获取上下文、判断能力、应用目标、核验结果」组织，而非暴露通用点击能力。这样，编排可讨论投稿准备的先后关系，平台适配可独立应对页面变化。

结果和证据向上返回；底层不通过修改 UI 状态来报告完成。资源准备可以为平台操作提供附件，但附件来源与上传行为仍分别归资源层和适配层所有。

这些关系在相应链路中展开：[输入准备](input.md) 说明配置与附件如何形成 `Prepared`；[任务执行](workflow.md) 说明运行绑定、步骤和证据如何形成结果；[交互反馈](interaction.md) 说明 controller 如何将输入与结果呈现给用户。数据结构随链路解释，不另建跨层类型汇总。

## 变化如何归属

新增配置含义先落实领域模型及用户意图；新增执行依赖调整编排；平台控件变化调整适配并补充上游证据；展示变化留在交互层。跨层改动通过 [实现计划](../plan/monkey.md) 说明涉及的契约，避免把一次平台修补扩散为整个系统的重新设计。
