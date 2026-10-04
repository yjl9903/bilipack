# 任务执行与核验

用户的视频包经过 [输入准备](input.md) 后，任务链路接收 `Prepared`：配置已解释，附件已解析，可以用于当前稿件的比对或写入。本篇沿一次任务说明输入如何变成操作、证据和结果；用户入口及结果展示见 [交互协调](interaction.md)。

```text
Prepared → 绑定页面上下文 → 已有视频只读比对 → 用户发起写入
                       └→ 空白页直接执行 ───┐
                                          ↓
                                   plan → Step[]
                                          ↓
                               execute → verify
                                          ↓
                                 Evidence → Result[]
                                          ↓
                                用户检查、接手并提交
```

流程的需求依据是 [用户故事](../intent/README.md#3-用户使用故事) 和 [页面交互规则](../intent/README.md#5-页面交互与执行规则)。下列类型摘录解释现有执行契约，完整定义见 [流程类型](../../apps/monkey/src/workflow/types.ts) 与 [平台端口](../../apps/monkey/src/workflow/port.ts)；需对齐的需求范围见 [实现计划](../plan/monkey.md)。

## 1. 接收输入，先确定正在处理哪个稿件

准备完成不等于可以向任意页面写入。平台适配器提供当前页面情况，协调层将它与 `Prepared`、适配器和终止信号绑定为本次工作的 `RunContext`：

```typescript
interface PageContext {
  identity: string;
  generation: number;
  video: VideoState;
  count: number;
  target: boolean;
  editor: boolean;
  submissionWaiting?: boolean;
}

interface RunContext {
  prepared: Prepared;
  page: PageContext;
  adapter: PageAdapter;
  signal: AbortSignal;
}
```

`identity` 标识稿件，`generation` 区分页面现场；`video` 和 `count` 决定视频前置条件及单视频范围，其他信息说明是否仍在目标页、是否为编辑页、是否已进入提交等待。平台端口的 `matchesContext` 统一身份、代次及视频数量规则：允许空白页出现第一个视频，已有单视频消失或出现多 P 则失效。任务通过 `assertContext(page)` 检查绑定，通过 `signal` 检查是否已终止。异步调用前后都需要检查，避免操作已经切换的稿件。所有异步页面操作和附件核验使用本轮传入的 AbortSignal，不另建无法随本轮终止的信号。

异步平台方法还接收本轮 `PageContext`，不是开始操作时重新绑定当前稿件。适配器为每次调用建立独立 Operation，保存身份与代次快照，在等待轮询、异步返回、每次控件写入及事件之间检查终止信号和实时上下文。长附件操作不能只依赖 controller 的观察频率或 runner 的前后检查。表单操作进入投稿等待即停止，失败清理也不能在另一稿件或等待阶段继续写入；视频完成等待只读观察同一绑定稿件，允许投稿等待而不终止整轮信号。离开稿件仍中止观察。该契约是应用设计，不是已经经过真实平台竞态复核的结论。

`prepared` 是本次使用的稳定输入，`adapter` 是操作和观察页面的唯一通道。现有结构不另设持久任务、输入版本或结果版本字段；旧任务与新输入的隔离由协调层管理上下文和终止信号，不能让旧异步结果更新新任务。

## 2. 从配置提取目标，决定比对还是执行

普通字段由 `fieldTargets(prepared.config)` 提取，保留显式关闭和清空的意图；未配置字段不产生目标，也不进入修改范围：

FieldTarget 由 Config 的普通字段区块推导为联合类型，field 与 value 的类型关联：例如 info.title 对应 string、info.tags 对应 string[]、publish.scheduled 对应 boolean。配置解析完成输入类型校验，后续平台实现直接使用已校验目标，保留对页面实际值和控件可操作性的检查。

`field` 是领域字段身份，`value` 是期望值。封面和字幕由准备好的附件承载目标，不强行塞进普通字段值。

页面已有视频时，`compare` 先用这些目标只读核验当前值，输出 `Result[]`，不上传或填写。字段匹配表示「当前值一致，尚未写入」；附件即使页面显示名称，也不能证明与新选本地文件一致，因此保留未确认或不支持的说明。用户发起写入后，输入才进入执行链路。

空白页无需先对不存在的表单做比对，直接基于准备输入执行。已有视频的写入也使用同一编排结构，但跳过视频上传，不替换页面视频。具体交互确认由协调层承担，`compare` 不决定何时授权写入。

## 3. 将目标组织为有前置条件的步骤

`plan(prepared, page)` 将字段、附件和等待条件组织为 `Step[]`，供执行器调度：

```typescript
type Step = {
  id: string;
  role: 'target' | 'condition';
  dependsOn: string[];
  skip?: string;
  capability?: { field: string; value?: unknown };
  retry?: 'execute';
  allowDuringSubmission?: boolean;
  pendingCompletion?: { step: string; verifiedMessage: string; unverifiedMessage: string };
  repair?(context: RunContext): Promise<void>;
  verify(context: RunContext): Promise<Evidence> | Evidence;
  expected?: unknown;
} & (
  | { execute(context: RunContext): Promise<void>; group?: never }
  | { group: StepGroup; execute?: never }
);
```

`id` 在本计划内唯一，也关联后续项目结果。`dependsOn` 引用同一计划的前置步骤，不能形成循环；`capability` 要求适配器确认当前能否处理该目标；`skip` 表达规划时已知的跳过原因。类型要求 `execute` 与 `group` 二选一，由编译检查完整性；`execute` 或 `group.execute` 负责动作或等待，`verify` 只提供结果证据，`repair` 显式声明可用的收敛操作，`expected` 保留用户期望供展示。

`retry=execute` 表示重试仍需重新等待或执行前置动作；`allowDuringSubmission` 仅授权必要的上传观察；`pendingCompletion` 将文件交接与后续完成证据关联。这些行为由计划声明，执行器不根据字段名猜测。pendingCompletion 的未匹配证据成为 waiting，允许依赖继续，在关联完成步骤独立核验后更新交接结果；未配置该策略的未匹配证据仍为 unverified。投稿等待中被拒绝的表单操作不再阻断计划授权的独立观察，但基础身份失效仍阻断后续步骤。

步骤不必与字段一一对应。等待编辑表单和确认视频完成是独立步骤；两比例封面共享声明的 StepGroup（id、execute），成员分别核验。组操作只执行一次，执行失败由组内成员共享，不能由数组位置或字段名前缀隐式决定批量行为；组缓存直接复用同一次操作的 Promise，成功和失败都由同一操作返回；部分核验失败仍分别保留结果。视频交给原生控件后，表单可用即可填写，视频上传则继续等待最终完成，不能把二者串成不必要的阻塞。

前置关系还承载页面联动：影响其他控件的设置先处理，易被联动覆盖的目标后处理。具体顺序由规划和适配共同落实；架构关注依赖是否充分，不把平台控件顺序固定为全局规则。

## 4. 执行动作，再用页面证据确认

`run` 接收步骤和上下文，先检查任务有效性、能力及依赖，再调用 `execute` 和 `verify`。适配器将实际观察返回为：

```typescript
interface Evidence {
  matches: boolean;
  actual?: unknown;
  message: string;
}
```

`matches` 回答本步骤能否确认目标匹配，`actual` 提供可读回的实际值，`message` 说明观察依据或限制。证据属于发起核验的步骤及当前稿件上下文，关联由调用链建立；类型没有独立的证据编号、时间戳或保存状态。

动作返回成功不是匹配证据。视频文件交给页面后仍需等待并确认上传完成；附件核验只覆盖页面可观察属性，例如字幕语言和文件名，不能推断正文一致。本地封面预览也不能替代平台读回。

执行器在相关上传和联动结束后，对已核验目标做最终读回，防止早先值被覆盖。标签目标显式声明 repair；即时核验和最终读回复用同一核验及修复流程；证据发现漂移后，执行器检查页面、终止信号、提交等待及能力，再进入 repair 阶段执行一次收敛并重新核验。不把写入藏在 verify 中，也不在 compare 中调用 repair。核验只能说明当时页面的状态；用户进入提交等待后停止表单写入和表单最终读回，保留此前结论的时间边界，不升级为最终保存或投稿成功。

## 5. 把步骤结果交回用户，而不是只报告整次成功

执行器将证据映射为项目结果，并通过进度回调及最终返回交给协调层：

```typescript
interface Result {
  id: string;
  role: 'target' | 'condition';
  status: Status;
  skipReason?: 'unsupported' | 'dependency';
  message: string;
  expected?: unknown;
  actual?: unknown;
}
```

Step 必须声明 `role`，run 原样保留到 Result。`target` 表示本轮用户目标，`condition` 表示前置条件或完成观察。空页面视频上传为 target，完成观察为 condition，通过 pendingCompletion 更新同一个上传目标；已有视频时上传跳过为 condition。字段、字幕和两个封面比例成员为 target，组本身不产生额外结果；编辑表单等待为 condition。比对结果为 target，输入校验和导入异常为 condition。汇总只消费分类，不通过 ID 推断语义。

执行结果的 `id` 对应步骤；比对结果使用字段或附件目标身份。`expected` 来源于目标，`actual` 来源于读回，`message` 保留原因和证据边界。结果不持有独立证据对象，也不单凭 `status` 表示执行过写入：只读比对同样可能得到匹配结果，必须结合本次处于比对还是执行阶段解释。

汇总需要区分已确认、差异或无法确认、失败及未执行。能力不足和依赖跳过通过 `skipReason` 关联处理原因；能力不足或依赖不足的跳过、失败及未确认均归入待处理；已有视频的正常跳过不影响准备完成。汇总文案与面板阶段使用同一完成判断，表单就绪等前置检查通过不能被描述为用户目标部分完成。当前执行器允许受支持的独立目标继续处理，其与用户意图的差异在计划中记录，不能由适配器自行改写产品策略。

例如，已有视频的未提交表单只配置简介和中文字幕：比对先读简介，字幕提示尚不能确认本地文件一致；写入计划跳过视频、只处理显式简介及字幕。之后分别读回文本和字幕可观察属性，结果交给用户检查，标题与封面不进入修改范围。

视频完成观察只依赖视频交接，不依赖编辑表单就绪。表单等待失败时，阻断字段和附件操作；同一稿件的视频仍可独立等待和核验，包括用户已进入投稿等待的情况。

## 6. 失败后保留现场，重试仍需重新确认

配置和素材问题在输入阶段阻断，不改页面。执行失败则保留已填写内容及上传状态；执行器根据上下文是否稳定决定能否继续独立步骤，未满足的依赖不得越过执行。

用户可以在同一稿件明确发起重试。`run` 接收此前 `Result[]`，已确认项目仍需重新核验，未完成项目重新执行；组内只要一个成员此前未确认完成（包括跳过或无结果），用户发起的新一轮就重新执行整组，再分别核验，不能只重传失败比例。重试不是自动上传循环，也不回滚页面。

稿件变化、上下文失效或终止信号触发后，停止后续调度，不能将旧结果用于新稿件。资源释放与任务替换由协调层负责；最终投稿、存草稿和保存修改始终由用户完成。任务结束后留下的是准备与核验结果，不是持久工作队列或平台提交凭证。
