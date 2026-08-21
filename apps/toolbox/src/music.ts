import type { MusicPlaylist, MusicTrack, PlaybackMode, UserPreferences } from '@dbkang/shared'
import { reactive } from 'vue'
import { absoluteAsset, getPlaylists } from './api'

interface PlayerState {
  playlists: MusicPlaylist[]
  currentPlaylistId: string | null
  currentTrack: MusicTrack | null
  playing: boolean
  currentSeconds: number
  durationSeconds: number
  volume: number
  mode: PlaybackMode
  loading: boolean
  error: string | null
}

class MusicPlayer {
  readonly state = reactive<PlayerState>({
    playlists: [],
    currentPlaylistId: null,
    currentTrack: null,
    playing: false,
    currentSeconds: 0,
    durationSeconds: 0,
    volume: 0.4,
    mode: 'repeat-all',
    loading: false,
    error: null,
  })

  private readonly audio = new Audio()
  private consecutiveFailures = 0
  private desiredPlaylistId: string | null = null

  constructor() {
    this.audio.preload = 'metadata'
    this.audio.addEventListener('timeupdate', this.handleTimeUpdate)
    this.audio.addEventListener('durationchange', this.handleDurationChange)
    this.audio.addEventListener('play', this.handlePlay)
    this.audio.addEventListener('pause', this.handlePause)
    this.audio.addEventListener('ended', this.handleEnded)
    this.audio.addEventListener('error', this.handleError)
  }

  configure(preferences: UserPreferences): void {
    this.state.volume = preferences.musicVolume
    this.state.mode = preferences.playbackMode
    this.desiredPlaylistId = preferences.lastPlaylistId
    this.audio.volume = preferences.musicVolume
  }

  async loadLibrary(): Promise<void> {
    this.state.loading = true
    try {
      this.state.playlists = await getPlaylists()
      const remembered = this.state.playlists.find((item) => item.id === this.desiredPlaylistId)
      this.state.currentPlaylistId = remembered?.id || this.state.playlists[0]?.id || null
      this.state.error = null
    } catch (reason) {
      this.state.error = reason instanceof Error ? reason.message : '音乐库暂时不可用。'
    } finally {
      this.state.loading = false
    }
  }

  setPlaylist(playlistId: string): void {
    if (this.state.playlists.some((item) => item.id === playlistId)) {
      this.state.currentPlaylistId = playlistId
    }
  }

  async selectTrack(track: MusicTrack, autoplay = true): Promise<void> {
    this.state.currentTrack = track
    this.state.currentPlaylistId = track.playlistId
    this.state.currentSeconds = 0
    this.state.durationSeconds = track.durationSeconds || 0
    this.state.error = null
    this.audio.src = absoluteAsset(track.streamUrl)
    this.audio.load()
    if (autoplay) await this.play()
  }

  async toggle(): Promise<void> {
    if (!this.state.currentTrack) {
      const first = this.currentPlaylist()?.tracks[0]
      if (first) await this.selectTrack(first)
      return
    }
    if (this.audio.paused) await this.play()
    else this.audio.pause()
  }

  async play(): Promise<void> {
    try {
      await this.audio.play()
      this.consecutiveFailures = 0
    } catch {
      this.state.error = '播放失败'
    }
  }

  setVolume(volume: number): void {
    const safe = Math.min(1, Math.max(0, volume))
    this.state.volume = safe
    this.audio.volume = safe
  }

  setMode(mode: PlaybackMode): void {
    this.state.mode = mode
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || seconds))
  }

  async next(fromFailure = false): Promise<void> {
    const playlist = this.currentPlaylist()
    if (!playlist?.tracks.length) return
    const currentIndex = playlist.tracks.findIndex((track) => track.id === this.state.currentTrack?.id)
    let nextTrack: MusicTrack | undefined
    if (this.state.mode === 'shuffle') {
      const candidates = playlist.tracks.filter((track) => track.id !== this.state.currentTrack?.id)
      nextTrack = candidates[Math.floor(Math.random() * candidates.length)] || playlist.tracks[0]
    } else if (currentIndex < playlist.tracks.length - 1) {
      nextTrack = playlist.tracks[currentIndex + 1]
    } else if (this.state.mode === 'repeat-all') {
      nextTrack = playlist.tracks[0]
    }
    if (!nextTrack || (this.state.mode === 'repeat-one' && fromFailure)) {
      this.audio.pause()
      return
    }
    await this.selectTrack(nextTrack)
  }

  async previous(): Promise<void> {
    const playlist = this.currentPlaylist()
    if (!playlist?.tracks.length) return
    const currentIndex = playlist.tracks.findIndex((track) => track.id === this.state.currentTrack?.id)
    const previous = currentIndex > 0 ? playlist.tracks[currentIndex - 1] : playlist.tracks.at(-1)
    if (previous) await this.selectTrack(previous)
  }

  currentPlaylist(): MusicPlaylist | undefined {
    return this.state.playlists.find((item) => item.id === this.state.currentPlaylistId)
  }

  destroy(): void {
    this.audio.pause()
    this.audio.removeEventListener('timeupdate', this.handleTimeUpdate)
    this.audio.removeEventListener('durationchange', this.handleDurationChange)
    this.audio.removeEventListener('play', this.handlePlay)
    this.audio.removeEventListener('pause', this.handlePause)
    this.audio.removeEventListener('ended', this.handleEnded)
    this.audio.removeEventListener('error', this.handleError)
  }

  private handleTimeUpdate = (): void => {
    this.state.currentSeconds = this.audio.currentTime || 0
  }

  private handleDurationChange = (): void => {
    this.state.durationSeconds = Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  private handlePlay = (): void => {
    this.state.playing = true
  }

  private handlePause = (): void => {
    this.state.playing = false
  }

  private handleEnded = async (): Promise<void> => {
    if (this.state.mode === 'repeat-one' && this.state.currentTrack) {
      this.seek(0)
      await this.play()
      return
    }
    await this.next()
  }

  private handleError = async (): Promise<void> => {
    this.state.error = '播放失败'
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= 5) {
      this.audio.pause()
      this.state.error = '多首歌曲连续播放失败，歌单暂时不可用。'
      return
    }
    await this.next(true)
  }
}

export const musicPlayer = new MusicPlayer()

