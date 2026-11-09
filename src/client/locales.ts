/** Copy for the settings card, in the two locales the dsh web client ships. */
import { workbenchEn, workbenchZh } from './workbench-locales.js'

/** Dictionary namespace owned by this plugin's browser half. */
export const NS = 'ai4scholar'

/** Copy keys of the card. */
export type Ai4ScholarLocaleKey =
  | keyof typeof workbenchEn
  | 'resultRemaining'
  | 'actionCompare'
  | 'actionDetails'
  | 'actionRead'
  | 'actionPdf'
  | 'actionCitations'
  | 'actionReferences'
  | 'actionRelated'
  | 'actionAuthors'
  | 'actionCitation'
  | 'actionVersions'
  | 'actionProfile'
  | 'actionPapers'
  | 'resultDraftReady'
  | 'resultDraftBusy'
  | 'resultDraftUnavailable'
  | 'resultError'
  | 'resultCount'
  | 'resultRunning'
  | 'resultCharge'
  | 'resultFullOutput'
  | 'resultInspect'
  | 'title'
  | 'settingsTitle'
  | 'settingsIntro'
  | 'description'
  | 'apiKeyLabel'
  | 'apiKeyPlaceholder'
  | 'getKey'
  | 'keyOffer'
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
  | 'cmdDefaults'
  | 'cmdHelp'
  | 'cmdFailed'
  | 'testKey'
  | 'recheckKey'
  | 'keyValid'
  | 'keySpent'
  | 'keyInvalid'
  | 'keyGroupTitle'
  | 'apiKeyPlaceholderReplace'
  | 'keyCheckTitle'
  | 'keyConfiguredTitle'
  | 'keyMissingTitle'
  | 'keyPendingTitle'
  | 'storedKey'
  | 'keyHidden'
  | 'showKey'
  | 'hideKey'
  | 'keyRevealFailed'
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
  | 'sourcesDetailsLabel'
  | 'sourcesDetails'
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
  | 'styleLabel'
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
    /** The Ai4Scholar settings card. */
    'ai4scholar': Ai4ScholarLocaleKey
  }
}

export const en: Record<Ai4ScholarLocaleKey, string> = {
  ...workbenchEn,
  actionCompare: 'Compare these authors',
  resultRemaining: '{count} remaining',
  actionDetails: 'Details',
  actionRead: 'Read full text',
  actionPdf: 'PDF',
  actionCitations: 'Cited by',
  actionReferences: 'References',
  actionRelated: 'Similar papers',
  actionAuthors: 'Authors',
  actionCitation: 'Citation formats',
  actionVersions: 'Versions',
  actionProfile: 'Profile',
  actionPapers: 'Papers',
  resultDraftReady: 'Added to the composer. You can edit it before sending.',
  resultDraftBusy: 'The composer already has a draft or is sending. Send or clear it first.',
  resultDraftUnavailable: 'Open this conversation to prepare a follow-up.',
  resultError: 'Request failed',
  resultCount: '{count} results',
  resultRunning: 'Working…',
  resultCharge: '{count} credits',
  resultFullOutput: 'Full result and credit details',
  resultInspect: 'Inspect call',
  title: 'Ai4Scholar',
  settingsTitle: 'Ai4Scholar API key',
  settingsIntro: 'Every search and full-text tool uses this key.',
  description: 'Find papers on Semantic Scholar, PubMed, Google Scholar, arXiv, bioRxiv/medRxiv, and Chinese literature, read full texts, and generate citations and figures. Powered by ai4scholar.net.',
  apiKeyLabel: 'API key',
  apiKeyPlaceholder: 'sk-user-…',
  getKey: 'Ai4Scholar',
  keyOffer: 'Claim 100 credits on the official site',
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
  cmdDefaults: 'Default search',
  cmdHelp: 'Commands & usage',
  topUp: 'Top up ↗',
  cmdFailed: 'could not read the balance',
  testKey: 'Check balance',
  recheckKey: 'Refresh',
  keyValid: '✓ Key works · {credits} credits available',
  keySpent: '{credits} spent by this key',
  keyInvalid: '✗ Key check failed: {message}',
  keyGroupTitle: 'API key',
  apiKeyPlaceholderReplace: 'Paste a new key to replace it',
  keyCheckTitle: 'Credit balance',
  keyConfiguredTitle: 'Key configured',
  keyMissingTitle: 'No API key configured',
  keyPendingTitle: 'New key has not been saved',
  storedKey: 'Saved API key',
  keyHidden: 'Saved API key, hidden',
  showKey: 'Show key',
  hideKey: 'Hide key',
  keyRevealFailed: 'Could not show the key. Please try again.',
  noteBilled: '1 credit / search · up to {max}',
  noteFree: 'Free · up to {max}',
  unitResults: 'results',
  unitChars: 'chars',
  searchIntro: 'Defaults the model uses when it does not specify them.',
  searchTitle: 'Search',
  searchUnsupported: 'This version of DeepSeek Harness cannot edit these settings here. Set searchSources, defaultMaxResults, abstractMaxChars, and showCredits on the ai4scholar entry in your profile’s cordis.patch.yml.',
  searchReadOnly: 'This profile’s configuration is read-only here.',
  sourcesLabel: 'Platforms',
  sourcesHint: 'Choose default sources and results per search.',
  sourcesDetailsLabel: 'Search details',
  sourcesDetails: 'Selected sources are used by default in combined searches. Counts also apply to individual search tools. Every source supports paging; each additional request to a billed source costs credits.',
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
  abstractHint: '0 omits abstracts; up to {max} characters.',
  abstractInvalid: 'Enter a whole number from 0 to {max}.',
  creditsLabel: 'Show credit usage and balance',
  restoreDefaults: 'Restore defaults',
  discard: 'Discard',
  searchSaved: 'Saved. New conversations and the next tool call use it.',
  searchReset: 'Defaults restored.',
  searchFailed: 'Not saved. The host refused the change; check the values and try again.',
  countLabelFor: 'Results from {name}',
  resultsTitle: 'Results',
  readLabel: 'Full-text slice',
  readHint: '{min}–{max} characters; continues reading as needed.',
  readInvalid: 'Enter {min} to {max}.',
  generationTitle: 'Citations and figures',
  styleLabel: 'Reference style',
  styleIeee: 'IEEE',
  styleApa: 'APA',
  styleVancouver: 'Vancouver',
  styleNature: 'Nature',
  styleNumbered: 'Numbered',
  preprintsLabel: 'Leave out preprints',
  preprintsHint: 'Applies to automatic citations.',
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
  ...workbenchZh,
  actionCompare: '比较这些作者',
  resultRemaining: '剩余 {count}',
  actionDetails: '查看详情',
  actionRead: '读全文',
  actionPdf: 'PDF',
  actionCitations: '谁引用了它',
  actionReferences: '参考文献',
  actionRelated: '相似论文',
  actionAuthors: '查看作者',
  actionCitation: '引用格式',
  actionVersions: '全部版本',
  actionProfile: '学者资料',
  actionPapers: '论文列表',
  resultDraftReady: '已填入输入框，可以修改后发送。',
  resultDraftBusy: '输入框已有草稿或正在发送，请先发送或清空。',
  resultDraftUnavailable: '请打开这段对话后继续操作。',
  resultError: '请求失败',
  resultCount: '{count} 条结果',
  resultRunning: '处理中…',
  resultCharge: '{count} 积分',
  resultFullOutput: '完整结果与积分明细',
  resultInspect: '查看调用',
  title: 'Ai4Scholar',
  settingsTitle: 'Ai4Scholar API Key',
  settingsIntro: '所有检索和全文工具都通过这个 Key 调用。',
  description: '在 Semantic Scholar、PubMed、Google Scholar、arXiv、bioRxiv/medRxiv 及中文文献 上找论文，读取全文，生成引用和科研配图。由 ai4scholar.net 提供。',
  apiKeyLabel: '密钥（API Key）',
  apiKeyPlaceholder: 'sk-user-…',
  getKey: 'Ai4Scholar',
  keyOffer: '官网领取100积分',
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
  statKeySpent: '此密钥累计消耗',
  statKeyCap: 'Key 上限',
  cmdDefaults: '默认检索',
  cmdHelp: '全部命令与用法',
  topUp: '官网充值 ↗',
  cmdFailed: '读取余额失败',
  testKey: '查询余额',
  recheckKey: '刷新',
  keyValid: '✓ Key 有效 · 可用积分 {credits}',
  keySpent: '此 Key 累计消耗 {credits}',
  keyInvalid: '✗ Key 检测失败：{message}',
  keyGroupTitle: '密钥（API Key）',
  apiKeyPlaceholderReplace: '粘贴新 Key 以替换',
  keyCheckTitle: '积分余额',
  keyConfiguredTitle: '密钥已配置',
  keyMissingTitle: '尚未配置 API Key',
  keyPendingTitle: '新 Key 尚未保存',
  storedKey: '已保存的密钥',
  keyHidden: '已保存的密钥，已隐藏',
  showKey: '显示密钥',
  hideKey: '隐藏密钥',
  keyRevealFailed: '暂时无法显示密钥，请重试。',
  noteBilled: '1 积分 / 次 · 最多 {max} 条',
  noteFree: '免费 · 最多 {max} 条',
  unitResults: '条',
  unitChars: '字符',
  searchIntro: '模型没有指定时使用的默认值。',
  searchTitle: '检索设置',
  searchUnsupported: '当前版本的 DeepSeek Harness 不支持在这里修改这些设置。请在 profile 的 cordis.patch.yml 里，给 ai4scholar 这一行设置 searchSources、defaultMaxResults、abstractMaxChars 和 showCredits。',
  searchReadOnly: '当前 profile 的配置在这里是只读的。',
  sourcesLabel: '检索平台',
  sourcesHint: '选择默认来源和每次返回条数。',
  sourcesDetailsLabel: '检索说明',
  sourcesDetails: '统一检索默认使用勾选的来源，条数也适用于各来源的独立检索。所有来源均可继续翻页，收费来源每次请求均计费。',
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
  abstractHint: '0 表示不返回摘要，最多 {max} 字符。',
  abstractInvalid: '请输入 0 到 {max} 之间的整数。',
  creditsLabel: '显示积分消耗与余额',
  restoreDefaults: '恢复默认',
  discard: '放弃修改',
  searchSaved: '已保存。新对话和下一次工具调用会使用新设置。',
  searchReset: '已恢复默认设置。',
  searchFailed: '未保存：宿主拒绝了这次修改，请检查后重试。',
  countLabelFor: '{name} 返回条数',
  resultsTitle: '结果内容',
  readLabel: '全文每次读取长度',
  readHint: '{min}–{max} 字符，可按需继续读取。',
  readInvalid: '请输入 {min} 到 {max}。',
  generationTitle: '引用与配图',
  styleLabel: '参考文献格式',
  styleIeee: 'IEEE',
  styleApa: 'APA',
  styleVancouver: 'Vancouver',
  styleNature: 'Nature',
  styleNumbered: '数字编号',
  preprintsLabel: '排除预印本',
  preprintsHint: '仅用于自动引用。',
  modelLabel: '配图模型',
  modelHint: '越快的模型消耗积分越少。',
  modelFlash: 'Flash（最快）',
  modelFlash31: 'Flash 3.1（均衡）',
  modelPro: 'Pro（质量最高）',
  modelGptImage: 'GPT Image（插画）',
  sizeLabel: '配图分辨率',
  sizeHint: '分辨率越高，生成越慢。',
}
