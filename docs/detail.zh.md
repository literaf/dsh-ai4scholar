# Ai4Scholar 学术研究

在 DeepSeek Harness 中直接检索文献，或通过聊天调用 **43 个原生工具**完成论文定位、阅读、引用追踪和科研配图。由 [ai4scholar.net](https://ai4scholar.net?src=dsh_ai4scholar) 提供数据服务。

## 开始使用

1. 打开侧栏 **Ai4Scholar**，选择来源、输入主题即可检索。工作台无需聊天模型；arXiv、bioRxiv、medRxiv 无需 AI4Scholar API Key。
2. 使用收费来源时，在工作台右上角的**设置**、本插件详情页或 **设置 → AI4Scholar** 保存密钥。这些入口共用密钥与默认选项。
3. 要用自然语言继续阅读、追踪引用或绘图，请先配置 Harness 聊天模型，再直接提问或输入 `/ai4s-*` 命令。

工作台左侧显示结果列表，右侧显示摘要、匹配片段或专利详情。来源决定可用的筛选条件。结果和最近搜索保留在当前客户端会话中，回看已加载分页不重复请求；刷新页面会清空记录。

## 支持的研究任务

- **统一论文检索：** `search_papers` 默认只查 Semantic Scholar；可在设置中选择 PubMed、arXiv、Google Scholar 或中文文献，也可在单次请求中明确指定多平台并合并去重。
- **论文与作者追踪：** Semantic Scholar 的批量检索、标题匹配、论文和作者详情、参考文献、被引与相关推荐；PubMed 的论文详情、引用和相关推荐。
- **Google Scholar：** 论文、学者资料、已有论文的引用格式与导出链接。
- **全文片段与阅读：** 从索引中搜索标题、摘要或正文片段；使用 `read_*` 获取可访问 PDF 并分段抽取文本。摘要和片段不等于读过整篇论文。
- **中文文献与专利：** 中文期刊、学位论文和会议文献的题录及可用摘要；Google Patents 专利检索。
- **预印本：** arXiv 关键词检索；bioRxiv / medRxiv 按学科和时间窗口浏览。
- **自动引用与科研绘图：** 为文字补引用；生成、编辑、风格转换、多图合成、SVG 与矢量化。Seedream 5.5 支持 1K/2K 和最多 10 张参考图，也可选择 GPT Image 或 Nano Banana 系列。

## 斜杠命令

默认提供 **20 个研究命令＋`/ai4s` 状态命令**；`/ai4scholar` 是兼容别名。命令后直接接自然语言，未指定的条件继承设置。

| 命令 |用途 |
|---|---|
| `/ai4s` | 密钥状态、余额、默认来源和条数、功能索引 |
| `/ai4s-search` | 统一论文检索，可用自然语言临时指定多个来源并去重 |
| `/ai4s-google` | Google Scholar 论文检索 |
| `/ai4s-semantic` | Semantic Scholar 检索、批量收集和全文片段 |
| `/ai4s-snippets` | 在 Semantic Scholar 索引的全文中查找匹配片段 |
| `/ai4s-pubmed` | PubMed 生物医学论文 |
| `/ai4s-arxiv` | arXiv 预印本 |
| `/ai4s-chinese` | 中文期刊、学位论文和会议文献 |
| `/ai4s-biorxiv`、`/ai4s-medrxiv` | 按分类、时间浏览预印本 |
| `/ai4s-patents` | Google Patents 专利检索 |
| `/ai4s-author` | 找学者、看资料、论文列表和作者比较 |
| `/ai4s-paper` | 论文详情、标题匹配、批量详情、全文、PDF、被引、参考文献、相关推荐和引用格式 |
| `/ai4s-references` | 参考文献：这篇论文引用了谁（Semantic Scholar） |
| `/ai4s-citations` | 被引论文：谁引用了这篇论文 |
| `/ai4s-related` | 相似与推荐论文，支持多篇种子论文 |
| `/ai4s-read` | 读取论文全文，可按字符范围分段 |
| `/ai4s-pdf` | 获取 PDF 链接，不等于保存本地文件 |
| `/ai4s-export` | 获取已知论文的引用格式和 BibTeX 等导出链接（Google Scholar） |
| `/ai4s-cite` | 为一段文字补充真实引用 |
| `/ai4s-draw` | 科研绘图、编辑、风格转换、多图合成、SVG 与矢量化 |

```text
/ai4s-search 同时用 Google Scholar 和 Semantic Scholar 查固态电池，合并去重
/ai4s-read 读刚才第三篇的全文，重点解释研究方法
/ai4s-citations 查哪些论文引用了刚才第一篇
/ai4s-draw 用 Seedream 5.5 画一张带中文标注的细胞结构图，2K
```

空的研究命令只显示用法，不检索。来源专用命令约束本次调用，不改全局设置；研究结果进入当前对话，可以继续追问。结果卡片的适用操作会填入带准确标识的草稿，已有草稿会保留。

References 表示“它引用了谁”，Citations 表示“谁引用了它”；Export 获取已有论文的引用格式，Cite 为一段文字补引用。PDF 命令返回链接，不等于已保存本地文件。Google Scholar 引用格式需使用该来源的原始论文 ID。bioRxiv / medRxiv 按分类与时间浏览，不是关键词全文检索。

## 设置与费用

在设置中可调整默认检索来源及各自返回条数、摘要和全文长度、自动引用样式、绘图模型与分辨率。默认只查 Semantic Scholar，摘要 600 字符，全文每片 60,000 字符，引用样式 IEEE，绘图为 Nano Banana 2（`flash31`）、2K。

**在对话末尾显示命令卡片**默认关闭；启用后，最新回复结束时显示命令菜单。按钮只填入草稿，不自动发送。**检查更新**查询 npm 最新正式版并提供发布说明，不自动安装。

arXiv、bioRxiv、medRxiv 免费；DOI 与可访问 PDF 的读取不收本插件 API 积分。其他检索来源、自动引用和生成类工具按所调用 API 计费，收费来源的新分页也会产生费用，以实际回执为准。聊天模型的用量由所选模型服务另行计费。

需要独立画布与图层编辑，可另装 [PlotFig](https://ai4scholar.net/integrations/dsh-plotfig?src=dsh_ai4scholar)；需要保存为 HTML/CSV/JSON 的全文摘录报告，可另装 [Fulltext](https://ai4scholar.net/integrations/dsh-fulltext?src=dsh_ai4scholar)。

## 文档与许可

[完整中文 README 与当前截图](https://github.com/literaf/dsh-ai4scholar/blob/main/README_CN.md) · [English README](https://github.com/literaf/dsh-ai4scholar#readme)

0.7.0 起采用 **AGPL-3.0-only**，可另行协商书面商业授权；旧 MIT 授权和第三方许可继续适用。详见[许可说明](https://github.com/literaf/dsh-ai4scholar/blob/main/LICENSING.md)和[商业授权入口](https://github.com/literaf/dsh-ai4scholar/blob/main/COMMERCIAL-LICENSE.md)。
