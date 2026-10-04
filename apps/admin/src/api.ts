const apiBaseUrl = (import.meta.env.VITE_DBKANG_BASE_URL || window.location.origin).replace(/\/$/, '')

export interface Dashboard {
  courseCount: number
  studentCount: number
  focusingStudentCount: number
  achievementCount: number
  announcementCount: number
}

export interface Course {
  id: number
  courseId: string
  name: string
  enabled: boolean
  memberCount: number
}

export interface AdminAchievement {
  id: number
  courseId: number
  name: string
  description: string
  tier: 'bronze' | 'silver' | 'gold'
  hidden: boolean
  triggerType: 'automatic' | 'manual'
  ruleExpression: string | null
  progressKey: string | null
  progressTarget: number | null
  sortOrder: number
}

export interface AdminAnnouncement {
  id: number
  courseId: number
  title: string
  content: string
  order: number
  createdAt: string
}

export interface AdminStudent {
  studentId: string
  realName: string
  nickname: string
  grade: number
  classNumber: number
  classId: string | null
  status: 'active' | 'disabled'
  disabledReason: string | null
  avatarUrl: string | null
  totalFocusSeconds: number
  totalPomodoros: number
  achievementCount: number
}

export async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // 保留状态码错误。
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
