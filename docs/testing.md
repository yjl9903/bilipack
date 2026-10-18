# 测试与验证规范

## 验证目标

从 [需求意图](intent/README.md) 确定用户场景与预期结果，从 [架构契约](architecture/README.md) 确定边界、失败语义和资源生命周期。测试验证可观察结果，不只断言内部调用顺序。需求与现有测试冲突时先判断意图，不能以测试现状改写需求。

使用 Vitest，测试放在各 workspace 的 `test/` 中并命名为 `*.test.ts`。库使用默认 Node 环境，应用使用 jsdom；当前没有覆盖率阈值或专用覆盖率脚本。

## 分组与被测范围

应用按被测职责组织目录，不按历史修复名称堆放，也不机械区分 unit / integration。一个文件围绕一个职责或契约；跨层场景归入负责协调该链路的层。库保持少量按公开能力命名的文件，不额外嵌套目录。

| 目录 / 文件 | 重点 |
| --- | --- |
| `packages/bilipack/test/{examples,parse,schema,field-targets,paths,srt}.test.ts` | 文档示例、解析及诊断、字段目标、路径和字幕；通过 `src/index.ts` 公开导出验证 |
| `apps/monkey/test/input/` | 目录索引、选择与拖放、输入准备、封面裁剪、资源释放 |
| `apps/monkey/test/workflow/` | 比对、步骤规划、执行器、依赖、分组重试、结果证据和取消 |
| `apps/monkey/test/application/` | controller 的真实输入与 workflow 链路、页面条件、展示状态及资源生命周期 |
| `apps/monkey/test/bilibili/` | 平台纯规则、能力声明、适配器与 Operation 契约；不模拟源站 DOM |
| `apps/monkey/test/panel/` | 自有 Vue 组件、面板与 controller 的连接、预览和文案 |
| `apps/monkey/test/entry/` | 自有入口呈现、目录导入、注入的原生视频转发回调及卸载 |

## Mock 边界

| 被测职责 | 保留真实实现 | 替换的边界 |
| --- | --- | --- |
| 配置库、输入纯函数 | 解析、路径、SRT、裁剪计算 | 无 |
| 浏览器输入与封面准备 | `prepare`、文件索引、资源生命周期 | 文件选择事件、图片解码、Canvas、Object URL 等浏览器 API |
| workflow | `compare`、`plan`、`run` 与领域库 | `PageAdapter`；不从 `bilibili/` 导入实现填入 fake |
| application | controller、input、workflow、presentation | `PageAdapter` 和目录来源；只在准备过程延迟/释放测试中局部替换 input 模块 |
| 平台适配器 | adapter、Operation、匹配规则 | 上下文 reader 和控件工厂；纯规则测试直接调用真实函数 |
| panel / entry | 自有组件、Vue 和所需 controller | `PageAdapter`、注入的入口回调、浏览器缺失 API、Shiki CDN 加载入口 |

workflow 断言结构化状态、证据与进度；展示文案由 application/panel 测试负责。不要在 mock 中调用被隔离层的真实实现，也不要用 mock 重写平台容量、匹配或裁剪算法。平台拒绝、读回不一致、上下文变化等由具体用例显式提供返回值或异常。

`test/support/` 按用途直接导入，不设全能 helpers 或 barrel：

- `fixtures.ts` 仅创建文件、封面等输入数据，`run-context.ts` 组装执行上下文。
- `page-adapter.ts` 的 `fakeAdapter` 每次创建独立字段存储，通过 `Partial<PageAdapter>` 覆盖所需方法。默认字段读回比较值；视频和附件默认返回成功证据，`assertContext` 默认为空操作。这些只是流程替身，不证明平台能力。测试取消、稿件切换、上传失败或读回失败时，必须显式模拟相应行为。
- `controller.ts`、`vue.ts` 创建真实实例并注册兜底清理；`cleanup.ts` 的 `onCleanup` 用于其他监听、挂载等资源，按创建的逆序释放。显式清理可用于验证卸载行为，随后自动清理不会重复执行。

`test/setup.ts` 在每条用例后先释放资源，再清 DOM、恢复 spy、全局对象与真实计时器。会修改模块级 mock 实现的套件在 `beforeEach` 重置实现，不能只 `clearAllMocks` 后依赖上一条用例留下的行为。只有验证模块缓存本身的测试使用 `resetModules`。异步测试显式控制完成、失败和取消，不依赖真实上传、网络或开发机状态。

## 平台验证边界

页面交互通过 mock adapter 隔离。不对不稳定的 B 站源站页面建立自动化测试，也不保留依赖其 DOM 结构的测试或 HTML fixtures。自有 UI 的 jsdom 测试可以保留。

适配器变更按影响范围进行真实页面核查，使用测试素材并停在用户最终提交之前；若未经明确授权，不点击投稿、存草稿或保存修改。核查结论记录在 [reference](reference/README.md)，交付状态同步对应实现计划。本地 mock 通过不代替事件接受性、账号权限、正式脚本安装或最终保存验证。

## 命令与完成条件

使用 Node.js 24 或更新版本及 `package.json` 固定的 pnpm；以 `pnpm install --frozen-lockfile` 安装依赖。CI 的具体 Node 版本以 `.github/workflows/ci.yml` 为准。

- `pnpm build`：构建全部 workspace，同时检查用户脚本元信息与产物约束。
- `pnpm typecheck`：库、Vue 和构建配置类型检查。
- `pnpm test:ci`：根任务通过 Turbo 先构建及类型检查，再非交互运行测试。
- `pnpm --filter bilipack test:ci`、`pnpm --filter @bilipack/monkey test:ci`：单 workspace 测试；直接执行不自动经过 Turbo 前置任务，先确保依赖已构建。
- `pnpm --filter bilipack test`：库测试的本地监听模式。
- `pnpm --filter @bilipack/monkey test:ci test/workflow`：按职责运行应用测试。
- `pnpm --filter @bilipack/monkey test:ci --sequence.shuffle --sequence.seed=20261019`：重构共享 mock 或清理机制时，以固定种子乱序运行，检查用例顺序依赖。

实现变更先运行相关测试，交付或推送前运行 `pnpm build` 和 `pnpm test:ci`。检查范围随风险确定，已通过后只在出现新修改或未解决问题时扩大验证。仅修改开发文档时核对事实、相对链接与 `git diff --check`，无需运行时测试。报告实际运行结果及尚未核查项。
