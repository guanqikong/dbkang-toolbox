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

/**
 * 从学习通页面实测得到的排版特征，用来让嵌入页卡的工具箱看起来像原生界面。
 *
 * 原生内容页签是跨域 iframe，工具箱读不到它的样式，因此由脚本在可读的
 * 外层文档里量好，再通过消息传给工具箱。全为主动实测值，缺失时才用兜底值。
 */
export interface NativeLook {
  /** 原生正文字体族，例如 `"PingFang SC", "Microsoft YaHei", …`。 */
  fontFamily: string
  /** 原生正文字号。 */
  fontSize: string
  /** 原生正文字重。 */
  fontWeight: string
  /** 原生正文行高。 */
  lineHeight: string
  /** 原生正文颜色。 */
  color: string
  /** 顶部菜单列左端与卡片边缘之间的空隙。 */
  navInsetLeft: string
}

export interface BridgeLookMessage {
  source: 'dbkang-userscript'
  type: 'DBKANG_NATIVE_LOOK'
  payload: NativeLook
}

/**
 * 学习通新旧课程页共用的排版近似值。
 * 只在读不到原生样式时使用（独立预览、或页面结构异常）。
 */
export const DEFAULT_NATIVE_LOOK: NativeLook = {
  fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  fontSize: '14px',
  fontWeight: '400',
  lineHeight: '1.5',
  color: 'rgb(51, 51, 51)',
  navInsetLeft: '20px',
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

export function isBridgeLookMessage(value: unknown): value is BridgeLookMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<BridgeLookMessage>
  if (message.source !== 'dbkang-userscript' || message.type !== 'DBKANG_NATIVE_LOOK') return false
  const payload = message.payload
  if (!payload || typeof payload !== 'object') return false
  // 只接受六个字段齐全的载荷，避免把残缺的值写进 CSS 变量。
  return NATIVE_LOOK_KEYS.every((key) => typeof payload[key] === 'string' && payload[key] !== '')
}

const NATIVE_LOOK_KEYS: Array<keyof NativeLook> = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'navInsetLeft',
]
