# 测试与验证规范

## 验证目标

从 [需求意图](intent/README.md) 确定用户场景与预期结果，从 [架构契约](architecture/README.md) 确定边界、失败语义和资源生命周期。测试验证可观察结果，不只断言内部调用顺序。需求与现有测试冲突时先判断意图，不能以测试现状改写需求。

使用 Vitest，测试放在各 workspace 的 `test/` 中并命名为 `*.test.ts`。库使用默认 Node 环境，应用使用 jsdom；当前没有覆盖率阈值或专用覆盖率脚本。

| 范围 | 重点 |
| --- | --- |
| 配置库 | 文档 TOML 示例、未知字段、缺省与显式值、路径、时间与 SRT 错误 |
| 文件处理 | 根目录与附件索引、裁剪与拖放、资源释放 |
| 编排与 controller | 预检、只读比对、授权写入、依赖跳过、失败、重试与页面切换 |
| 自有 UI | 原文展示、入口状态、预览、结果与事件交互 |

库测试优先通过 `src/index.ts` 的公开导出表达输入输出。应用复用 `test/helpers.ts` 的文件与 mock adapter 辅助函数；异步测试控制页面上下文、等待结果和取消信号，不依赖真实上传、网络或开发机状态。每个测试释放 controller、挂载节点和预览资源，并恢复修改的 mock、全局对象及计时器。

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

实现变更先运行相关测试，交付或推送前运行 `pnpm build` 和 `pnpm test:ci`。检查范围随风险确定，已通过后只在出现新修改或未解决问题时扩大验证。仅修改开发文档时核对事实、相对链接与 `git diff --check`，无需运行时测试。报告实际运行结果及尚未核查项。
