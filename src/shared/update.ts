export const UPDATE_ROUTE = '/api/ai4scholar/update'
export const RELEASES_URL = 'https://github.com/literaf/dsh-ai4scholar/releases'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  status: 'available' | 'current' | 'ahead'
}

export type UpdateResponse =
  | { ok: true; value: UpdateInfo }
  | { ok: false; currentVersion: string; code: 'CHECK_FAILED' | 'METHOD_NOT_ALLOWED' }
