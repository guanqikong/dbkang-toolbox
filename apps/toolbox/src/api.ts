import type {
  BootstrapRequest,
  BootstrapResponse,
  FocusRequest,
  FocusResponse,
  FocusStopRequest,
  MusicPlaylist,
  ProfileUpdateRequest,
  UserProfile,
  UserPreferences,
} from '@dbkang/shared'

export const apiBaseUrl = (import.meta.env.VITE_DBKANG_BASE_URL || window.location.origin).replace(/\/$/, '')

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = '无法连接服务器，请稍后再试。'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) message = payload.detail
    } catch {
      // 保留统一错误信息。
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function bootstrap(request: BootstrapRequest): Promise<BootstrapResponse> {
  const response = await apiRequest<BootstrapResponse>('/api/v1/student/bootstrap', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  response.user.avatarUrl = response.user.avatarUrl ? absoluteAsset(response.user.avatarUrl) : null
  response.achievements = response.achievements.map((item) => ({
    ...item,
    iconUrl: item.iconUrl ? absoluteAsset(item.iconUrl) : null,
  }))
  response.newlyUnlocked = response.newlyUnlocked.map((item) => ({
    ...item,
    iconUrl: item.iconUrl ? absoluteAsset(item.iconUrl) : null,
  }))
  return response
}

export function startFocus(request: FocusRequest): Promise<FocusResponse> {
  return apiRequest('/api/v1/student/focus/start', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function heartbeatFocus(request: FocusRequest): Promise<FocusResponse> {
  return apiRequest('/api/v1/student/focus/heartbeat', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function pauseFocus(request: FocusRequest): Promise<FocusResponse> {
  return apiRequest('/api/v1/student/focus/pause', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function stopFocus(request: FocusStopRequest): Promise<FocusResponse> {
  return apiRequest('/api/v1/student/focus/stop', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function savePreferences(preferences: UserPreferences & { studentId: string }): Promise<UserPreferences> {
  return apiRequest('/api/v1/student/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  })
}

export async function saveProfile(profile: ProfileUpdateRequest): Promise<UserProfile> {
  const user = await apiRequest<UserProfile>('/api/v1/student/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
  user.avatarUrl = user.avatarUrl ? absoluteAsset(user.avatarUrl) : null
  return user
}

export async function getPlaylists(): Promise<MusicPlaylist[]> {
  const playlists = await apiRequest<MusicPlaylist[]>('/api/v1/music/playlists')
  return playlists.map((playlist) => ({
    ...playlist,
    coverUrl: playlist.coverUrl ? absoluteAsset(playlist.coverUrl) : null,
    tracks: playlist.tracks.map((track) => ({
      ...track,
      coverUrl: absoluteAsset(track.coverUrl),
      streamUrl: absoluteAsset(track.streamUrl),
    })),
  }))
}

export function absoluteAsset(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}
