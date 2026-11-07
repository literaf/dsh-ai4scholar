为 DeepSeek Harness 提供学术文献能力：39 个原生工具，覆盖论文检索、全文精读、引用生成和科研配图。由 [ai4scholar.net](https://ai4scholar.net?src=dsh) 提供数据服务。

## 工具

- **论文检索** `search_papers`：默认查 Semantic Scholar，可在设置里改默认平台，或让模型临时指定 PubMed、arXiv、Google Scholar、中文文献。多平台结果按 DOI / arXiv id / PMID / 标题合并去重。
- **Semantic Scholar**：关键词检索、批量检索、全文片段、标题精确匹配、论文与作者详情、引文与参考文献、相似论文推荐。
- **PubMed**：生物医学检索、论文详情、引用与相关论文。
- **中文文献** `search_chinese`：期刊、学位论文和会议论文的题录与可用摘要，支持筛选、排序、分页；也可作为 `search_papers` 的 `chinese` 来源参与去重，默认不勾选。
- **Google Scholar**：覆盖最广，带被引数；每次最多 10 条，每次请求计费一次。
- **arXiv**：预印本检索，免费。
- **bioRxiv / medRxiv**：按学科浏览最新预印本，免费。
- **全文**：`read_*` 下载 PDF 并抽取正文，长文分段返回。
- **auto_cite**：给一段文字自动配真实引用，输出 IEEE / APA / Vancouver / Nature / 数字编号格式和 BibTeX。
- **sci_draw**：AI 生成或处理科研配图。
- **get_ai4scholar_credits**：查询积分余额。

## 使用

1. 打开 **设置 → AI4Scholar**，或在这个页面下方，粘贴 AI4Scholar API Key（[ai4scholar.net](https://ai4scholar.net?src=dsh) 获取），点**保存**。输入框下方会常驻显示「API Key 已配置」。Key 存进 dsh 的凭据存储，不会发送给模型，下一次工具调用即生效。
2. 在**检索设置**里可以调默认检索平台、每个平台单次返回的条数（所有来源均可继续翻页）、摘要长度、全文读取长度，以及 auto_cite 和 sci_draw 的默认选项。

arXiv 和 bioRxiv/medRxiv 免费；Semantic Scholar、PubMed、Google Scholar、中文文献和生成类工具按次消耗积分，开启"在结果里显示积分"后每次检索都会附上消耗和余额。
