为 DeepSeek Harness 提供学术文献能力：43 个原生工具，覆盖论文检索、全文精读、引用生成和科研配图。由 [ai4scholar.net](https://ai4scholar.net?src=dsh) 提供数据服务。

## 工具

- **论文检索** `search_papers`：默认查 Semantic Scholar，可在设置里改默认平台，或让模型临时指定 PubMed、arXiv、Google Scholar、中文文献。多平台结果按 DOI / arXiv id / PMID / 标题合并去重。
- **Semantic Scholar**：关键词检索、批量检索、全文片段、标题精确匹配、论文与作者详情、引文与参考文献、相似论文推荐。
- **PubMed**：生物医学检索、论文详情、引用与相关论文。
- **中文文献** `search_chinese`：期刊、学位论文和会议论文的题录与可用摘要，支持筛选、排序、分页；也可作为 `search_papers` 的 `chinese` 来源参与去重，默认不勾选。
- **Google Scholar**：论文检索、学者候选与资料、单篇论文引用格式。论文检索每次最多 10 条，保留原始 ID、被引与版本信息。
- **Google Patents**：专利检索，支持受让人、发明人、国家、状态和日期筛选。
- **arXiv**：预印本检索，免费。
- **bioRxiv / medRxiv**：按学科浏览最新预印本，免费。
- **全文**：`read_*` 下载 PDF 并抽取正文，长文分段返回。
- **auto_cite**：给一段文字自动配真实引用，输出 IEEE / APA / Vancouver / Nature / 数字编号格式和 BibTeX。
- **sci_draw**：AI 生成或处理科研配图。
- **get_ai4scholar_credits**：查询积分余额。

## 斜杠命令：后面接自然语言

用斜杠选择能力，再直接说明条件，无需记忆参数名。未指定的来源和条数沿用插件设置。

| 命令 | 用途 |
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
| `/ai4s-draw` | 科研绘图、编辑、风格、合成、迭代、点评、SVG 和矢量化 |

```text
/ai4s-google 固态电池，2022 年以来的 10 篇
/ai4s-search 同时用 Google Scholar 和 Semantic Scholar 查固态电池，合并去重
/ai4s-author 用 Semantic Scholar 查 Geoffrey Hinton，先确认作者身份，再看资料和代表论文
/ai4s-read 读刚才第三篇论文，重点解释研究方法
/ai4s-snippets 查找固态电池界面阻抗的实验描述，返回 5 段
/ai4s-references 查刚才第一篇引用的参考文献
/ai4s-citations 查哪些论文引用了刚才第一篇
/ai4s-export 获取刚才第一篇的 APA 引用格式和 BibTeX 链接
/ai4s-patents 找宁德时代近五年在中国申请的固态电池专利
```

空命令显示用法，不调用检索接口。研究命令作为当前对话的新请求排队，由已配置的模型理解自然语言并调用工具；结果进入对话历史，可以继续追问。执行前模型会简要说明理解出的来源和条件，遇到来源冲突或作者重名才澄清。来源命令在执行时校验来源，独立操作命令会校验操作类型，不修改全局设置。关闭对应能力时入口会隐藏，即使仍有可用的论文定位工具。旧 `/ai4scholar` 与 `/ai4s` 都可查看状态。

默认提供 20 个研究命令，加上 `/ai4s` 状态入口共 21 个主命令；旧 `/ai4scholar` 继续兼容。Snippets 返回匹配片段，不是整篇全文；References 是向外引用，Citations 是被引关系，Export 是已有论文的引用格式，Cite 是为文字补充引用。

当前 Harness 的论文、作者和专利结果卡片提供适用的后续操作。点击按钮会把带有准确标识的自然语言请求填入输入框，修改后发送即可；已有草稿会保留。PDF 和来源链接直接打开。旧版 Harness 没有对应卡片插槽时仍显示普通工具结果。

Google Scholar 论文保留原始论文 ID、被引和版本 ID；引用格式接口只接受原始论文 ID，不接受 DOI、URL 或作者页面的 citationId。作者查询默认 Semantic Scholar，明确指定 Google Scholar 时使用其作者接口；Google 返回的是可用论文列表，不能据此声称是全部成果，也不提供 h-index。bioRxiv/medRxiv 按分类与时间浏览，不是关键词全文检索。专利结果独立于论文统一检索。

## 使用

0.6.0 新增左侧 **Ai4Scholar** 工作台。0.6.1 起，侧栏入口采用随主题变色的单色放大镜图标。直接选择来源、输入查询、筛选和翻页，左侧浏览结果、右侧查看详情。工作台搜索不经过聊天模型，需要宿主的认证插件 Fetch 通道，已在 Harness 0.2.2-rc.1 验证。右上角的**设置**复用下方设置页面，API Key 和默认参数由所有入口共同使用。搜索与最近记录在本次运行期间保留，回看已经加载的页面不重复请求；新搜索和新分页按来源的 API 规则计费。全文片段不等于读取整篇论文，Google Scholar 的来源摘要也不等于全文。

**设置**旁的**检查更新**会查询 npm 最新正式版并显示当前与最新版本；本地测试版领先时会明确提示，不建议降级。可查看发布说明，发现新版本后可进入**管理插件**。检查本身不会安装或替换插件，也不消耗 API 积分。

1. 打开 **设置 → AI4Scholar**，或在这个页面下方，粘贴 AI4Scholar API Key（[ai4scholar.net](https://ai4scholar.net?src=dsh) 获取），点**保存**。输入框下方显示隐藏的密钥，点击眼睛可显示或隐藏，右侧标注「密钥已配置」。Key 存进 dsh 的凭据存储，不会发送给模型，下一次工具调用即生效。
2. 在**检索设置**里可以调默认检索平台、每个平台单次返回的条数（所有来源均可继续翻页）、摘要长度、全文读取长度，以及 auto_cite 和 sci_draw 的默认选项。

arXiv 和 bioRxiv/medRxiv 免费；Semantic Scholar、PubMed、Google Scholar、Google Patents、中文文献和生成类工具按次消耗积分，开启「显示积分消耗与余额」后每次检索都会附上消耗和余额。
