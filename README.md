# Bilipack

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-00485B?logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![Release](https://img.shields.io/github/v/release/yjl9903/bilipack?include_prereleases)](https://github.com/yjl9903/bilipack/releases)
[![CI](https://github.com/yjl9903/bilipack/actions/workflows/ci.yml/badge.svg)](https://github.com/yjl9903/bilipack/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/github/license/yjl9903/bilipack)](LICENSE)

**让 AI Agent 将素材与文案整理成视频包，用 Bilipack 一次导入 B 站投稿**

- 你准备好一堆视频, 封面, 字幕, 投稿要求
- AI Agent 协助批量生成投稿清单, 整理视频包
- 在 B 站官方页面上, 使用 Bilipack 上传视频包
- 交回你做最后检查和确认投稿

## 下载与安装

使用桌面浏览器和 [Tampermonkey](https://www.tampermonkey.net/) 扩展。

1. 在浏览器中安装并启用 Tampermonkey
2. 打开 [GitHub Releases](https://github.com/yjl9903/bilipack/releases) 下载附件 **`bilipack.user.js`**
3. 用 Tampermonkey 安装该文件并启用 Bilipack
4. 打开 [B 站视频投稿页](https://member.bilibili.com/platform/upload/video/frame)

## 开始使用

### 0. 准备投稿视频

准备好想要投稿到 B 站的视频, 封面, 字幕等等

### 1. 准备视频包

把下面的 prompt 交给你的 AI Agent：

```text
请帮我把现有视频整理成可以用 Bilipack 导入 B 站的视频包，并生成投稿清单配置。

素材目录：<我的视频、封面和字幕所在目录>
投稿要求：<填写你的要求，或请先和我讨论视频主题、标题、简介、分区、标签等内容>

请先阅读 https://github.com/yjl9903/bilipack 的 README 和
packages/bilipack/src/config/schema.ts，按 Bilipack 的配置格式处理：

根据实际素材和我们确定的投稿要求，为每个视频整理视频包并生成 bilipack.toml。
可以在原目录中整理，也可以创建临时目录，保留原始素材；不确定的内容先和我确认。

完成后，汇报视频包的路径和信息，引导我打开 B 站投稿页。
```

### 2. 导入投稿页

登录 B 站并打开 [视频投稿页](https://member.bilibili.com/platform/upload/video/frame)。

- **新投稿**：点击「上传 Bilipack 目录」选择视频包文件夹上传
- **编辑稿件**：在右下角浮窗点击导入视频包，确认差异后点击「写入配置」

### 3. 检查并提交

等待 bilipack 自动填写完成，确认无误后，投稿!

## 视频包结构

### 目录结构

视频包包含投稿清单配置和对应素材，目录结构如下：

```text
我的视频包/
├── bilipack.toml
├── video.mp4
├── cover.jpg
└── subtitles/
    └── zh.srt
```

### 清单文件

每个视频包的根目录都放一份 **`bilipack.toml`**，用于指定素材路径、投稿信息和设置。
清单示例如下：

```toml
[video]
file = "video.mp4"

[cover]
file = "cover.jpg"

[info]
title = "我的视频标题"
description = """
这里是视频简介。
可以直接换行。
"""
category = "动画"
tags = ["动画", "创作分享"]
declaration = "内容无需标注"

[[subtitles]]
file = "subtitles/zh.srt"
language = "中文"
```

只保留你这次需要设置的项目：没有封面或字幕，就删除对应的整个区块；
仅上传视频时，保留 `[video]` 和 `file` 两行即可。平台必填信息仍需补齐。
分区和创作声明等选项按页面上的名称填写。

素材名称可以自行安排，`file` 必须对应实际文件的相对路径。子目录用 `/` 分隔，
所有引用文件都要在选中的目录内。注意不要把配置保存成 `bilipack.toml.txt`。

完整配置结构与校验规则见 [配置 schema](packages/bilipack/src/config/schema.ts)。

#### 视频

| 配置字段 | 对应内容 | 写法示例 |
| --- | --- | --- |
| `video.file` | 视频文件路径 | `"video.mp4"` |

#### 封面

| 配置字段 | 对应内容 | 写法示例 |
| --- | --- | --- |
| `cover.mode` | 封面模式：单图或独立双图，默认单图 | `"single"` / `"dual"` |
| `cover.file` | 单图模式的封面文件路径 | `"cover.jpg"` |
| `cover.wide_position` | 单图模式的个人空间封面（16:9）裁剪位置，默认居中 | `[50, 50]` |
| `cover.standard_position` | 单图模式的首页推荐封面（4:3）裁剪位置，默认居中 | `[65, 50]` |
| `cover.wide_file` | 双图模式的个人空间封面（16:9）文件路径 | `"covers/16x9.jpg"` |
| `cover.standard_file` | 双图模式的首页推荐封面（4:3）文件路径 | `"covers/4x3.jpg"` |

单图模式使用同一张图片，分别指定两个比例的裁剪位置：

```toml
[cover]
file = "cover.jpg"
wide_position = [50, 50]      # 16:9 居中
standard_position = [65, 50]  # 4:3 向右移动
```

位置写作 `[水平百分比, 垂直百分比]`，范围是 0 到 100。
`[0, 0]` 为左上，`[50, 50]` 为居中，`[100, 100]` 为右下；没有裁剪余量的方向不受影响。

双图模式分别提供两张图片，图片比例分别为 16:9 和 4:3：

```toml
[cover]
mode = "dual"
wide_file = "covers/16x9.jpg"
standard_file = "covers/4x3.jpg"
```

#### 投稿信息

| 配置字段 | 对应内容 | 写法示例 |
| --- | --- | --- |
| `info.title` | 标题 | `"我的视频标题"` |
| `info.description` | 简介，支持多行文字 | `"这里是视频简介。"` |
| `info.category` | 分区，填写页面上的名称 | `"动画"` |
| `info.tags` | 标签列表 | `["动画", "创作分享"]` |
| `info.declaration` | 创作声明 | `"内容无需标注"` |

#### 展示与互动

| 配置字段 | 对应设置 | 写法示例 |
| --- | --- | --- |
| `display.watermark` | 添加水印 | `false` |
| `display.visibility` | 可见范围 | `"公开可见"` / `"仅自己可见"` |
| `display.hide_from_profile` | 在个人空间的投稿列表中隐藏 | `false` |
| `interaction.dynamic` | 粉丝动态文案，支持多行文字 | `"这次分享我的创作过程。"` |
| `interaction.comments` | 允许评论 | `true` |
| `interaction.danmaku` | 允许弹幕 | `true` |
| `interaction.selected_comments` | 开启精选评论 | `false` |

#### 字幕

每份字幕使用一个 `[[subtitles]]` 区块：

| 区块内字段 | 对应内容 | 写法示例 |
| --- | --- | --- |
| `file` | SRT 字幕文件路径 | `"subtitles/zh.srt"` |
| `language` | 字幕语言 | `"中文"` |

```toml
[[subtitles]]
file = "subtitles/zh.srt"
language = "中文"
```

## 开源协议

MIT License © 2026 [OneKuma](https://github.com/yjl9903)
