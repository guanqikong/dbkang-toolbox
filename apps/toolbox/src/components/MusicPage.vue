<script setup lang="ts">
import type { PlaybackMode, UserPreferences } from '@dbkang/shared'
import { computed } from 'vue'
import { publicAsset } from '../assets'
import { musicPlayer } from '../music'

const props = defineProps<{ preferences: UserPreferences }>()
const emit = defineEmits<{ preferences: [value: UserPreferences] }>()
const playlist = computed(() => musicPlayer.currentPlaylist())
const defaultCoverUrl = publicAsset('default-music.svg')

const modes: Array<{ value: PlaybackMode; label: string }> = [
  { value: 'sequential', label: '顺序播放' },
  { value: 'repeat-all', label: '列表循环' },
  { value: 'shuffle', label: '随机播放' },
  { value: 'repeat-one', label: '单曲循环' },
]

function choosePlaylist(id: string): void {
  musicPlayer.setPlaylist(id)
  emitPreferences({ lastPlaylistId: id })
}

function changeMode(mode: PlaybackMode): void {
  musicPlayer.setMode(mode)
  emitPreferences({ playbackMode: mode })
}

function changeVolume(volume: number): void {
  musicPlayer.setVolume(volume)
  emitPreferences({ musicVolume: volume })
}

function emitPreferences(partial: Partial<UserPreferences>): void {
  emit('preferences', { ...props.preferences, ...partial })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
</script>

<template>
  <section class="music-page">
    <header class="page-heading">
      <div><p>全课程共用音乐库</p><h1>音乐</h1></div>
      <div class="player-settings">
        <label>播放模式
          <select class="dbk-input" :value="musicPlayer.state.mode" @change="changeMode(($event.target as HTMLSelectElement).value as PlaybackMode)">
            <option v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</option>
          </select>
        </label>
        <label>音乐音量
          <input type="range" min="0" max="1" step="0.01" :value="musicPlayer.state.volume" @change="changeVolume(Number(($event.target as HTMLInputElement).value))" />
        </label>
      </div>
    </header>

    <div v-if="musicPlayer.state.loading" class="dbk-panel dbk-empty">正在读取音乐库…</div>
    <div v-else-if="musicPlayer.state.error && !musicPlayer.state.playlists.length" class="dbk-panel dbk-empty">{{ musicPlayer.state.error }}</div>
    <div v-else-if="!musicPlayer.state.playlists.length" class="dbk-panel dbk-empty">
      <div><strong>音乐库暂时为空</strong><p>在服务器 `assets/music/歌单名称/` 中放入 MP3，重启服务后即可出现。</p></div>
    </div>
    <div v-else class="library-layout dbk-panel">
      <aside>
        <h2>歌单</h2>
        <button
          v-for="item in musicPlayer.state.playlists"
          :key="item.id"
          type="button"
          :class="{ active: item.id === musicPlayer.state.currentPlaylistId }"
          @click="choosePlaylist(item.id)"
        >
          <img :src="item.coverUrl || defaultCoverUrl" alt="" @error="($event.target as HTMLImageElement).src = defaultCoverUrl" />
          <span><strong>{{ item.name }}</strong><small>{{ item.tracks.length }} 首歌曲</small></span>
        </button>
      </aside>
      <div class="track-list">
        <div class="track-list__header"><strong>{{ playlist?.name }}</strong><span>按文件名排序</span></div>
        <div v-if="!playlist?.tracks.length" class="empty-tracks">当前歌单没有可播放的曲目。</div>
        <button
          v-for="(track, index) in playlist?.tracks"
          :key="track.id"
          type="button"
          :class="['track-row', { active: track.id === musicPlayer.state.currentTrack?.id }]"
          @click="musicPlayer.selectTrack(track)"
        >
          <span class="track-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <img :src="track.coverUrl || defaultCoverUrl" alt="" @error="($event.target as HTMLImageElement).src = defaultCoverUrl" />
          <span class="track-title"><strong>{{ track.title }}</strong><small>{{ track.artist }}</small></span>
          <span>{{ track.album }}</span>
          <span>{{ formatDuration(track.durationSeconds) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-heading { display:flex; justify-content:space-between; align-items:end; margin-bottom:20px; }
.page-heading p { margin:0 0 5px; color:var(--dbk-text-muted); font-size:13px; }
.page-heading h1 { margin:0; font-size:28px; }
.player-settings { display:flex; gap:24px; align-items:end; }
.player-settings label { display:grid; gap:7px; color:var(--dbk-text-muted); font-size:12px; }
.player-settings select { width:150px; }
.player-settings input { width:160px; accent-color:var(--dbk-primary); }
.library-layout { display:grid; grid-template-columns:260px 1fr; min-height:560px; overflow:hidden; }
aside { padding:18px; border-right:1px solid var(--dbk-border); background:#fafbfd; }
aside h2 { margin:0 0 12px; font-size:14px; }
aside button { display:flex; gap:10px; align-items:center; width:100%; padding:9px; border:0; border-radius:6px; color:var(--dbk-text); text-align:left; background:transparent; }
aside button:hover, aside button.active { background:var(--dbk-primary-soft); }
aside img { width:42px; height:42px; border-radius:5px; object-fit:cover; }
aside span, .track-title { display:grid; min-width:0; }
aside small, .track-title small { margin-top:3px; color:var(--dbk-text-muted); }
.track-list { padding:8px 18px 18px; }
.track-list__header { display:flex; justify-content:space-between; padding:16px 10px; border-bottom:1px solid var(--dbk-border); }
.track-list__header span { color:var(--dbk-text-muted); font-size:12px; }
.empty-tracks { display:grid; min-height:220px; place-items:center; color:var(--dbk-text-muted); font-size:13px; }
.track-row { display:grid; grid-template-columns:34px 44px minmax(180px,1.4fr) minmax(120px,1fr) 60px; gap:12px; align-items:center; width:100%; padding:9px 10px; border:0; border-bottom:1px solid #eef1f5; color:var(--dbk-text-muted); text-align:left; background:#fff; }
.track-row:hover, .track-row.active { background:#f7f9fc; }
.track-row.active .track-title strong { color:var(--dbk-primary); }
.track-row img { width:40px; height:40px; border-radius:4px; object-fit:cover; }
.track-title strong { overflow:hidden; color:var(--dbk-text); text-overflow:ellipsis; white-space:nowrap; }
.track-index { color:#9aa5b5; font-variant-numeric:tabular-nums; }
</style>
