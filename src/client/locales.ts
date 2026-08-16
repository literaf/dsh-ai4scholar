/** Copy for the settings card, in the two locales the dsh web client ships. */

/** Dictionary namespace owned by this plugin's browser half. */
export const NS = 'ai4scholar'

/** Copy keys of the card. */
export type Ai4ScholarLocaleKey =
  | 'title'
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

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The AI4Scholar settings card. */
    'ai4scholar': Ai4ScholarLocaleKey
  }
}

export const en: Record<Ai4ScholarLocaleKey, string> = {
  title: 'AI4Scholar',
  description: 'Academic search tools: Semantic Scholar, PubMed, Google Scholar',
  apiKeyLabel: 'API key',
  apiKeyPlaceholder: 'sk-user-…',
  apiKeyHint: 'Stored in the dsh credentials store (never shown again, never sent to the model). Takes effect on the next tool call.',
  getKey: 'Get a key at ai4scholar.net',
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
  testKey: 'Test key & show balance',
  recheckKey: 'Refresh',
  keyValid: '✓ Key works · {credits} credits available',
  keySpent: '{credits} spent by this key',
  keyInvalid: '✗ Key check failed: {message}',
}

export const zh: Record<Ai4ScholarLocaleKey, string> = {
  title: 'AI4Scholar',
  description: '学术检索工具：Semantic Scholar、PubMed、Google Scholar',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: 'sk-user-…',
  apiKeyHint: '保存到 dsh 凭据存储（不会回显，也不会发送给模型），下一次工具调用即生效。',
  getKey: '前往 ai4scholar.net 获取 Key',
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
  testKey: '测试 Key 并显示余额',
  recheckKey: '刷新',
  keyValid: '✓ Key 有效 · 可用积分 {credits}',
  keySpent: '此 Key 累计消耗 {credits}',
  keyInvalid: '✗ Key 检测失败：{message}',
}
