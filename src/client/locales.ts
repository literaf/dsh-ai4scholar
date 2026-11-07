/** Copy for the settings card, in the two locales the dsh web client ships. */

/** Dictionary namespace owned by this plugin's browser half. */
export const NS = 'ai4scholar'

/** Copy keys of the card. */
export type Ai4ScholarLocaleKey =
  | 'title'
  | 'settingsTitle'
  | 'settingsIntro'
  | 'description'
  | 'apiKeyLabel'
  | 'apiKeyPlaceholder'
  | 'apiKeyHint'
  | 'getKey'
  | 'configured'
  | 'configuredVia'
  | 'notConfigured'
  | 'checking'
  | 'readOnly'
  | 'save'
  | 'saving'
  | 'remove'
  | 'saved'
  | 'removed'
  | 'failed'
  | 'expand'
  | 'collapse'
  | 'sourceEnv'
  | 'sourceFile'
  | 'sourceProjectEnv'
  | 'sourceUserEnv'
  | 'creditsAvailable'
  | 'statPermanent'
  | 'statMemberMonthly'
  | 'statSessionSpent'
  | 'statKeySpent'
  | 'statKeyCap'
  | 'topUp'
  | 'cmdFailed'
  | 'testKey'
  | 'recheckKey'
  | 'keyValid'
  | 'keySpent'
  | 'keyInvalid'
  | 'keyGroupTitle'
  | 'apiKeyPlaceholderReplace'
  | 'keyCheckTitle'
  | 'keyCheckHint'
  | 'keyConfiguredTitle'
  | 'keyConfiguredHint'
  | 'keyMissingTitle'
  | 'keyMissingHint'
  | 'keyPendingTitle'
  | 'keyPendingHint'
  | 'keyReplacePendingHint'
  | 'noteBilled'
  | 'noteFree'
  | 'unitResults'
  | 'unitChars'
  | 'searchIntro'
  | 'searchTitle'
  | 'searchUnsupported'
  | 'searchReadOnly'
  | 'sourcesLabel'
  | 'sourcesHint'
  | 'sourcesEmpty'
  | 'sourceSemantic'
  | 'sourcePubmed'
  | 'sourceArxiv'
  | 'sourceGoogle'
  | 'sourceChinese'
  | 'countLabel'
  | 'countHint'
  | 'countInvalid'
  | 'abstractLabel'
  | 'abstractHint'
  | 'abstractInvalid'
  | 'creditsLabel'
  | 'creditsHint'
  | 'restoreDefaults'
  | 'discard'
  | 'searchSaved'
  | 'searchReset'
  | 'searchFailed'
  | 'countLabelFor'
  | 'resultsTitle'
  | 'readLabel'
  | 'readHint'
  | 'readInvalid'
  | 'generationTitle'
  | 'generationIntro'
  | 'styleLabel'
  | 'styleHint'
  | 'styleIeee'
  | 'styleApa'
  | 'styleVancouver'
  | 'styleNature'
  | 'styleNumbered'
  | 'preprintsLabel'
  | 'preprintsHint'
  | 'modelLabel'
  | 'modelHint'
  | 'modelFlash'
  | 'modelFlash31'
  | 'modelPro'
  | 'modelGptImage'
  | 'sizeLabel'
  | 'sizeHint'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The AI4Scholar settings card. */
    'ai4scholar': Ai4ScholarLocaleKey
  }
}

export const en: Record<Ai4ScholarLocaleKey, string> = {
  title: 'AI4Scholar',
  settingsTitle: 'AI4Scholar API key',
  settingsIntro: 'Every search and full-text tool uses this key.',
  description: 'Find papers on Semantic Scholar, PubMed, Google Scholar, arXiv, bioRxiv/medRxiv, and Chinese literature, read full texts, and generate citations and figures. Powered by ai4scholar.net.',
  apiKeyLabel: 'API key',
  apiKeyPlaceholder: 'sk-user-…',
  apiKeyHint: 'Kept in the dsh credentials store. It is never shown again or sent to the model, and the next tool call uses it.',
  getKey: 'Get a key',
  configured: 'Configured',
  configuredVia: 'Configured via {source}',
  notConfigured: 'Not configured',
  checking: 'Checking…',
  readOnly: 'The key comes from the launching environment; unset it there to manage it here.',
  save: 'Save',
  saving: 'Saving…',
  remove: 'Remove',
  saved: 'Key saved.',
  removed: 'Key removed.',
  failed: 'Could not save: {message}',
  expand: 'Expand',
  collapse: 'Collapse',
  sourceEnv: 'environment',
  sourceFile: 'credentials file',
  sourceProjectEnv: 'project .env',
  sourceUserEnv: 'user .env',
  creditsAvailable: 'credits available',
  statPermanent: 'Permanent',
  statMemberMonthly: 'Member monthly left',
  statSessionSpent: 'Spent this session',
  statKeySpent: 'Spent by this key',
  statKeyCap: 'Key cap',
  topUp: 'Top up at ai4scholar.net ↗',
  cmdFailed: 'could not read the balance',
  testKey: 'Check balance',
  recheckKey: 'Refresh',
  keyValid: '✓ Key works · {credits} credits available',
  keySpent: '{credits} spent by this key',
  keyInvalid: '✗ Key check failed: {message}',
  keyGroupTitle: 'API key',
  apiKeyPlaceholderReplace: 'Saved. Paste a new key to replace it',
  keyCheckTitle: 'Credit balance',
  keyCheckHint: 'Check that the key works and how many credits it has left.',
  keyConfiguredTitle: 'API key is configured',
  keyConfiguredHint: 'The saved key is hidden for your privacy. No need to paste it again; check the balance to verify it works.',
  keyMissingTitle: 'No API key configured',
  keyMissingHint: 'Paste your AI4Scholar key above and click Save.',
  keyPendingTitle: 'New key has not been saved',
  keyPendingHint: 'Click Save to finish configuring your key.',
  keyReplacePendingHint: 'Click Save to replace the current key. Until then, the existing key is used.',
  noteBilled: 'One credit per search, up to {max} per call',
  noteFree: 'Free, up to {max} per call',
  unitResults: 'results',
  unitChars: 'chars',
  searchIntro: 'Defaults the model uses when it does not specify them.',
  searchTitle: 'Search',
  searchUnsupported: 'This version of DeepSeek Harness cannot edit these settings here. Set searchSources, defaultMaxResults, abstractMaxChars, and showCredits on the ai4scholar entry in your profile’s cordis.patch.yml.',
  searchReadOnly: 'This profile’s configuration is read-only here.',
  sourcesLabel: 'Platforms',
  sourcesHint: 'Ticked platforms are what search_papers queries when the model names none. Counts apply per call, including individual search tools. Every source supports paging for more; each additional request to a billed source costs credits.',
  sourcesEmpty: 'Pick at least one platform.',
  sourceSemantic: 'Semantic Scholar',
  sourcePubmed: 'PubMed',
  sourceArxiv: 'arXiv',
  sourceGoogle: 'Google Scholar',
  sourceChinese: 'Chinese literature',
  countLabel: 'Results per search',
  countHint: '1 to {max}.',
  countInvalid: 'Enter 1 to {max}.',
  abstractLabel: 'Abstract length',
  abstractHint: '0 leaves abstracts out, at most {max}. Longer abstracts use more context.',
  abstractInvalid: 'Enter a whole number from 0 to {max}.',
  creditsLabel: 'Show credits in results',
  creditsHint: 'Adds what each search cost and the remaining balance.',
  restoreDefaults: 'Restore defaults',
  discard: 'Discard',
  searchSaved: 'Saved. New conversations and the next tool call use it.',
  searchReset: 'Defaults restored.',
  searchFailed: 'Not saved. The host refused the change; check the values and try again.',
  countLabelFor: 'Results from {name}',
  resultsTitle: 'Results',
  readLabel: 'Full-text slice',
  readHint: 'How much of a paper read_* returns per call, {min} to {max} characters. The model asks for the rest as needed.',
  readInvalid: 'Enter {min} to {max}.',
  generationTitle: 'Citations and figures',
  generationIntro: 'Defaults for auto_cite and sci_draw; the model can still choose otherwise.',
  styleLabel: 'Reference style',
  styleHint: 'Format of the reference list auto_cite returns.',
  styleIeee: 'IEEE',
  styleApa: 'APA',
  styleVancouver: 'Vancouver',
  styleNature: 'Nature',
  styleNumbered: 'Numbered',
  preprintsLabel: 'Leave out preprints',
  preprintsHint: 'auto_cite cites peer-reviewed papers only.',
  modelLabel: 'Figure model',
  modelHint: 'Faster models cost fewer credits.',
  modelFlash: 'Flash (fastest)',
  modelFlash31: 'Flash 3.1 (balanced)',
  modelPro: 'Pro (best quality)',
  modelGptImage: 'GPT Image (illustrations)',
  sizeLabel: 'Figure resolution',
  sizeHint: 'Higher resolutions take longer.',
}
export const zh: Record<Ai4ScholarLocaleKey, string> = {
  title: 'AI4Scholar',
  settingsTitle: 'AI4Scholar API Key',
  settingsIntro: '所有检索和全文工具都通过这个 Key 调用。',
  description: '在 Semantic Scholar、PubMed、Google Scholar、arXiv、bioRxiv/medRxiv 及中文文献 上找论文，读取全文，生成引用和科研配图。由 ai4scholar.net 提供。',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: 'sk-user-…',
  apiKeyHint: '保存在 dsh 凭据存储里，不会再显示，也不会发送给模型，下一次工具调用即生效。',
  getKey: '获取 Key',
  configured: '已配置',
  configuredVia: '已配置（来源：{source}）',
  notConfigured: '未配置',
  checking: '检查中…',
  readOnly: 'Key 来自启动 dsh 的环境变量；请先在环境中移除，才能在这里管理。',
  save: '保存',
  saving: '保存中…',
  remove: '移除',
  saved: 'Key 已保存。',
  removed: 'Key 已移除。',
  failed: '保存失败：{message}',
  expand: '展开',
  collapse: '收起',
  sourceEnv: '环境变量',
  sourceFile: '凭据文件',
  sourceProjectEnv: '项目 .env',
  sourceUserEnv: '用户 .env',
  creditsAvailable: '可用积分',
  statPermanent: '永久积分',
  statMemberMonthly: '会员本月剩余',
  statSessionSpent: '本会话已用',
  statKeySpent: '此 Key 累计消耗',
  statKeyCap: 'Key 上限',
  topUp: '去 ai4scholar.net 充值 ↗',
  cmdFailed: '读取余额失败',
  testKey: '查询余额',
  recheckKey: '刷新',
  keyValid: '✓ Key 有效 · 可用积分 {credits}',
  keySpent: '此 Key 累计消耗 {credits}',
  keyInvalid: '✗ Key 检测失败：{message}',
  keyGroupTitle: 'API Key',
  apiKeyPlaceholderReplace: '已保存，粘贴新的 Key 可替换',
  keyCheckTitle: '积分余额',
  keyCheckHint: '检查 Key 是否可用，以及还剩多少积分。',
  keyConfiguredTitle: 'API Key 已配置',
  keyConfiguredHint: '为保护密钥，输入框不会回显已保存的 Key，无需重复填写。可查询余额验证是否可用。',
  keyMissingTitle: '尚未配置 API Key',
  keyMissingHint: '在上方粘贴 AI4Scholar 的 Key，然后点击「保存」。',
  keyPendingTitle: '新 Key 尚未保存',
  keyPendingHint: '点击「保存」后才能完成配置。',
  keyReplacePendingHint: '点击「保存」后将替换当前 Key；保存前仍使用原来的 Key。',
  noteBilled: '每次检索 1 积分，单次最多 {max} 条',
  noteFree: '免费，单次最多 {max} 条',
  unitResults: '条',
  unitChars: '字符',
  searchIntro: '模型没有指定时使用的默认值。',
  searchTitle: '检索设置',
  searchUnsupported: '当前版本的 DeepSeek Harness 不支持在这里修改这些设置。请在 profile 的 cordis.patch.yml 里，给 ai4scholar 这一行设置 searchSources、defaultMaxResults、abstractMaxChars 和 showCredits。',
  searchReadOnly: '当前 profile 的配置在这里是只读的。',
  sourcesLabel: '检索平台',
  sourcesHint: '勾选的平台是 search_papers 默认查询的来源。这里的条数是单次返回条数，也用于各来源的独立检索工具。所有来源均可继续翻页；收费来源每多请求一页都会计费。',
  sourcesEmpty: '至少选择一个平台。',
  sourceSemantic: 'Semantic Scholar',
  sourcePubmed: 'PubMed',
  sourceArxiv: 'arXiv',
  sourceGoogle: 'Google Scholar',
  sourceChinese: '中文文献',
  countLabel: '每次检索条数',
  countHint: '1 到 {max}。',
  countInvalid: '请输入 1 到 {max}。',
  abstractLabel: '摘要长度',
  abstractHint: '填 0 不提供摘要，最多 {max}。摘要越长，占用的上下文越多。',
  abstractInvalid: '请输入 0 到 {max} 之间的整数。',
  creditsLabel: '在结果里显示积分',
  creditsHint: '附上每次检索消耗的积分和剩余余额。',
  restoreDefaults: '恢复默认',
  discard: '放弃修改',
  searchSaved: '已保存。新对话和下一次工具调用会使用新设置。',
  searchReset: '已恢复默认设置。',
  searchFailed: '未保存：宿主拒绝了这次修改，请检查后重试。',
  countLabelFor: '{name} 返回条数',
  resultsTitle: '结果内容',
  readLabel: '全文每次读取长度',
  readHint: 'read_* 每次返回的全文字符数，{min} 到 {max}。模型需要时会接着读后面的部分。',
  readInvalid: '请输入 {min} 到 {max}。',
  generationTitle: '引用与配图',
  generationIntro: 'auto_cite 和 sci_draw 的默认值，模型仍可按需改用其他选项。',
  styleLabel: '参考文献格式',
  styleHint: 'auto_cite 返回的参考文献列表格式。',
  styleIeee: 'IEEE',
  styleApa: 'APA',
  styleVancouver: 'Vancouver',
  styleNature: 'Nature',
  styleNumbered: '数字编号',
  preprintsLabel: '排除预印本',
  preprintsHint: 'auto_cite 只引用经过同行评审的论文。',
  modelLabel: '配图模型',
  modelHint: '越快的模型消耗积分越少。',
  modelFlash: 'Flash（最快）',
  modelFlash31: 'Flash 3.1（均衡）',
  modelPro: 'Pro（质量最高）',
  modelGptImage: 'GPT Image（插画）',
  sizeLabel: '配图分辨率',
  sizeHint: '分辨率越高，生成越慢。',
}
