<script setup lang="ts">
import type { NewlyUnlockedAchievement } from '@dbkang/shared'
import { onMounted, onUnmounted } from 'vue'
import { publicAsset } from '../assets'

defineProps<{ achievement: NewlyUnlockedAchievement }>()
const emit = defineEmits<{ close: [] }>()
const defaultAchievementUrl = publicAsset('default-achievement.svg')
let timer = 0

onMounted(() => {
  playChime()
  timer = window.setTimeout(() => emit('close'), 5200)
})
onUnmounted(() => window.clearTimeout(timer))

function playChime(): void {
  try {
    const AudioContextClass = window.AudioContext
    const context = new AudioContextClass()
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65)
    gain.connect(context.destination)
    for (const [index, frequency] of [659.25, 783.99, 987.77].entries()) {
      const oscillator = context.createOscillator()
      oscillator.frequency.value = frequency
      oscillator.type = 'sine'
      oscillator.connect(gain)
      oscillator.start(context.currentTime + index * 0.08)
      oscillator.stop(context.currentTime + 0.7)
    }
  } catch {
    // 浏览器不允许自动音频时，视觉通知仍正常展示。
  }
}
</script>

<template>
  <aside class="achievement-toast" role="status" @click="emit('close')">
    <img :src="achievement.iconUrl || defaultAchievementUrl" alt="" />
    <div><span>成就已解锁 · {{ achievement.unlockRate }}% 已获得</span><strong>{{ achievement.name }}</strong><p>{{ achievement.description }}</p></div>
  </aside>
</template>

<style scoped>
.achievement-toast { position:fixed; z-index:60; right:22px; bottom:92px; display:grid; grid-template-columns:72px 1fr; gap:14px; width:390px; padding:14px; border:1px solid #334157; border-radius:7px; color:#fff; background:#1e2838; box-shadow:0 14px 38px rgba(10,20,36,.32); animation:slide-in 220ms ease-out; cursor:pointer; }
.achievement-toast img { width:72px; height:72px; border-radius:5px; object-fit:cover; }
.achievement-toast div { min-width:0; }
.achievement-toast span { color:#aebdd2; font-size:11px; }
.achievement-toast strong { display:block; margin:6px 0 2px; font-size:16px; }
.achievement-toast p { margin:0; color:#d3dce8; font-size:12px; line-height:1.45; }
@keyframes slide-in { from { transform:translateX(28px); opacity:0; } }
</style>
