<script setup lang="ts">
import type { BootstrapResponse } from '@dbkang/shared'
import { formatDuration } from '@dbkang/shared'
import { computed, ref } from 'vue'
import { publicAsset } from '../assets'

const props = defineProps<{ data: BootstrapResponse }>()
const currentAnnouncement = ref(0)
const teacherView = computed(() => props.data.user.role === 'teacher')
const unlockedCount = computed(() => props.data.achievements.filter((item) => item.unlocked).length)
const tierLabel = { bronze: '铜牌', silver: '银牌', gold: '金牌' } as const
const defaultAchievementUrl = publicAsset('default-achievement.svg')
</script>

<template>
  <section>
    <div v-if="data.announcements.length" class="announcement dbk-panel">
      <div class="announcement__marker">公告</div>
      <div><strong>{{ data.announcements[currentAnnouncement]?.title }}</strong><p>{{ data.announcements[currentAnnouncement]?.content }}</p></div>
      <select v-if="data.announcements.length > 1" v-model="currentAnnouncement" class="dbk-input" aria-label="切换公告">
        <option v-for="(item, index) in data.announcements" :key="item.id" :value="index">{{ item.title }}</option>
      </select>
    </div>

    <header class="achievement-header">
      <div><p>{{ data.course.courseName }}</p><h1>{{ teacherView ? '课程成就' : '我的成就' }}</h1></div>
      <dl>
        <div><dt>{{ teacherView ? '全部成就' : '已解锁' }}</dt><dd>{{ teacherView ? data.achievements.length : `${unlockedCount} / ${data.achievements.length}` }}</dd></div>
        <div><dt>累计专注</dt><dd>{{ formatDuration(data.summary.totalFocusSeconds) }}</dd></div>
        <div><dt>完成番茄</dt><dd>{{ data.summary.totalPomodoros }}</dd></div>
      </dl>
    </header>

    <div v-if="!data.achievements.length" class="dbk-panel dbk-empty">当前课程还没有配置成就。</div>
    <div v-else class="achievement-grid">
      <article v-for="achievement in data.achievements" :key="achievement.id" :class="['achievement-card', { locked: !teacherView && !achievement.unlocked }]">
        <img :src="achievement.iconUrl || defaultAchievementUrl" alt="" />
        <div class="achievement-card__body">
          <div class="achievement-card__meta"><span :data-tier="achievement.tier">{{ tierLabel[achievement.tier] }}</span><span>{{ achievement.unlockRate }}% 已解锁</span></div>
          <h2>{{ achievement.name }}</h2>
          <p>{{ achievement.description }}</p>
          <div v-if="!teacherView && achievement.progressTarget && !achievement.unlocked" class="achievement-progress">
            <span :style="{ width: `${Math.min(100, ((achievement.progressCurrent || 0) / achievement.progressTarget) * 100)}%` }" />
          </div>
          <small v-if="teacherView">教师仅查看，无法获得成就</small>
          <small v-else-if="achievement.unlockedAt">{{ new Date(achievement.unlockedAt).toLocaleString('zh-CN') }} 解锁</small>
          <small v-else-if="achievement.progressTarget">{{ achievement.progressCurrent || 0 }} / {{ achievement.progressTarget }}</small>
          <small v-else>尚未解锁</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.announcement { display:grid; grid-template-columns:auto 1fr 220px; gap:14px; align-items:center; margin-bottom:26px; padding:14px 18px; }
.announcement__marker { padding:5px 9px; border-radius:5px; color:var(--dbk-primary); font-size:12px; background:var(--dbk-primary-soft); }
.announcement strong { font-size:14px; }
.announcement p { margin:3px 0 0; color:var(--dbk-text-muted); font-size:13px; white-space:pre-wrap; }
.achievement-header { display:flex; justify-content:space-between; align-items:end; margin-bottom:22px; }
.achievement-header p { margin:0 0 5px; color:var(--dbk-text-muted); font-size:13px; }
.achievement-header h1 { margin:0; font-size:28px; }
.achievement-header dl { display:flex; gap:44px; margin:0; }
.achievement-header dl div { display:grid; gap:4px; }
.achievement-header dt { color:var(--dbk-text-muted); font-size:12px; }
.achievement-header dd { margin:0; font-size:18px; font-weight:650; }
.achievement-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.achievement-card { display:grid; grid-template-columns:94px 1fr; gap:16px; min-height:142px; padding:18px; border:1px solid var(--dbk-border); border-radius:9px; background:#fff; }
.achievement-card.locked { background:#fafbfd; }
.achievement-card > img { width:94px; height:94px; border-radius:8px; object-fit:cover; }
.achievement-card.locked > img { filter:grayscale(1); opacity:.55; }
.achievement-card__body { min-width:0; }
.achievement-card__meta { display:flex; justify-content:space-between; color:var(--dbk-text-muted); font-size:12px; }
.achievement-card__meta [data-tier="gold"] { color:#9a6b12; }
.achievement-card__meta [data-tier="silver"] { color:#64748b; }
.achievement-card__meta [data-tier="bronze"] { color:#9a572f; }
.achievement-card h2 { margin:8px 0 4px; font-size:17px; }
.achievement-card p { min-height:38px; margin:0 0 9px; color:var(--dbk-text-muted); font-size:13px; line-height:1.5; }
.achievement-card small { color:#8b96a7; }
.achievement-progress { height:4px; margin:4px 0 7px; overflow:hidden; border-radius:2px; background:#e8edf4; }
.achievement-progress span { display:block; height:100%; background:var(--dbk-primary); }
</style>
