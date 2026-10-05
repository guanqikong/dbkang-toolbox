<script setup lang="ts">
import { publicAsset } from '../assets'
import { musicPlayer } from '../music'

const defaultCoverUrl = publicAsset('default-music.svg')
</script>

<template>
  <footer class="mini-player" aria-label="全局音乐播放器">
    <img
      class="album-cover"
      :src="musicPlayer.state.currentTrack?.coverUrl || defaultCoverUrl"
      :alt="musicPlayer.state.currentTrack ? `${musicPlayer.state.currentTrack.title} 专辑封面` : '尚未播放'"
      @error="($event.target as HTMLImageElement).src = defaultCoverUrl"
    />
    <div class="transport">
      <button type="button" aria-label="上一首" @click="musicPlayer.previous()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 6.5 9 12l10 5.5v-11Z" /></svg>
      </button>
      <button
        class="play-button"
        type="button"
        :aria-label="musicPlayer.state.playing ? '暂停' : '播放'"
        @click="musicPlayer.toggle()"
      >
        <svg v-if="musicPlayer.state.playing" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
      </button>
      <button type="button" aria-label="下一首" @click="musicPlayer.next()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 6.5 15 12 5 17.5v-11Z" /></svg>
      </button>
    </div>
  </footer>
</template>

<style scoped>
/*
 * 播放条是卡片的一部分，位于卡片底部，不再悬浮于整个视口。
 * 由 .app-shell 的 flex 布局把它压到内容区下方。
 */
.mini-player {
  z-index: 30;
  display: flex;
  flex-shrink: 0;
  gap: 24px;
  align-items: center;
  justify-content: center;
  height: 64px;
  padding: 8px 24px;
  border-top: 1px solid var(--dbk-border);
  background: #fff;
}
.album-cover { width:48px; height:48px; border-radius:5px; background:#edf1f7; object-fit:cover; }
.transport { display:flex; gap:10px; align-items:center; justify-content:center; }
.transport button { display:grid; width:36px; height:36px; padding:0; place-items:center; border:1px solid transparent; border-radius:50%; color:var(--dbk-text-muted); background:transparent; }
.transport button:hover { color:var(--dbk-text); background:#f1f4f8; }
.transport svg { width:19px; height:19px; fill:currentColor; }
.transport .play-button { width:40px; height:40px; color:#fff; background:var(--dbk-primary); }
.transport .play-button:hover { color:#fff; background:var(--dbk-primary-hover); }
</style>
