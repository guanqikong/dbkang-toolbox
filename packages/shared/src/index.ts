export type CourseAccessStatus = 'available' | 'disabled' | 'ended'
export type UserStatus = 'active' | 'disabled'
export type ToolboxRole = 'student' | 'teacher'
export type AchievementTier = 'bronze' | 'silver' | 'gold'
export type AchievementTrigger = 'automatic' | 'manual'
export type PlaybackMode = 'sequential' | 'repeat-all' | 'shuffle' | 'repeat-one'
export type AmbienceType = 'rain' | 'wind' | 'fire' | null

export interface ClassIdentity {
  grade: number
  classNumber: number
}

export interface StudentIdentity extends ClassIdentity {
  studentId: string
  realName: string
  classId: string
}

export interface ToolboxIdentity {
  role: ToolboxRole
  studentId: string
  realName: string
  grade: number | null
  classNumber: number | null
  classId: string
}

export interface ToolboxContext extends ToolboxIdentity {
  courseId: string
  courseName: string
  courseEnded: boolean
}

export interface BridgeContextMessage {
  source: 'dbkang-userscript'
  type: 'DBKANG_CONTEXT'
  payload: ToolboxContext
}

export interface RequestContextMessage {
  source: 'dbkang-toolbox'
  type: 'DBKANG_REQUEST_CONTEXT'
}

export interface CourseAccessResponse {
  courseId: string
  status: CourseAccessStatus
}

export interface UserProfile {
  role: ToolboxRole
  studentId: string
  realName: string
  nickname: string
  avatarUrl: string | null
  grade: number | null
  classNumber: number | null
  status: UserStatus
  disabledReason: string | null
}

export interface ProfileUpdateRequest {
  role: ToolboxRole
  studentId: string
  nickname: string
  avatarDataUrl: string | null
}

export interface CourseSummary {
  courseId: string
  classId: string
  courseName: string
}

export interface StudySummary {
  todayFocusSeconds: number
  totalFocusSeconds: number
  todayPomodoros: number
  totalPomodoros: number
  focusingStudentCount: number
}

export interface UserPreferences {
  focusMinutes: number
  restMinutes: number
  rounds: number
  musicVolume: number
  ambienceVolume: number
  ambienceType: AmbienceType
  playbackMode: PlaybackMode
  lastPlaylistId: string | null
}

export interface AchievementView {
  id: number
  name: string
  description: string
  iconUrl: string | null
  tier: AchievementTier
  hidden: boolean
  unlocked: boolean
  unlockedAt: string | null
  unlockRate: number
  unlockCount: number
  memberCount: number
  sortOrder: number
  progressCurrent: number | null
  progressTarget: number | null
}

export interface AnnouncementView {
  id: number
  title: string
  content: string
  order: number
  createdAt: string
}

export interface NewlyUnlockedAchievement {
  id: number
  name: string
  description: string
  iconUrl: string | null
  tier: AchievementTier
  unlockRate: number
}

export interface BootstrapRequest extends ToolboxContext {}

export interface BootstrapResponse {
  user: UserProfile
  course: CourseSummary
  summary: StudySummary
  preferences: UserPreferences
  achievements: AchievementView[]
  announcements: AnnouncementView[]
  newlyUnlocked: NewlyUnlockedAchievement[]
}

export interface FocusRequest extends ToolboxIdentity {
  courseId: string
  sessionId: string
}

export interface FocusStopRequest extends FocusRequest {
  completed: boolean
  disconnectedAt?: string | null
}

export interface FocusResponse {
  accepted: boolean
  connected: boolean
  summary: StudySummary
  newlyUnlocked: NewlyUnlockedAchievement[]
}

export interface HomeworkSnapshotInput {
  assignmentId: string
  assignmentName: string
  score: number | null
  totalScore: number | null
}

export interface MusicTrack {
  id: string
  playlistId: string
  title: string
  artist: string
  album: string
  durationSeconds: number | null
  coverUrl: string
  streamUrl: string
}

export interface MusicPlaylist {
  id: string
  name: string
  coverUrl: string | null
  tracks: MusicTrack[]
}

export interface AdminLoginResponse {
  accessToken: string
  tokenType: 'bearer'
  expiresAt: string
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

export function isBridgeContextMessage(value: unknown): value is BridgeContextMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<BridgeContextMessage>
  return message.source === 'dbkang-userscript' && message.type === 'DBKANG_CONTEXT'
}
