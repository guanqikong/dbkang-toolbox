<script setup lang="ts">
import type { BootstrapResponse, NewlyUnlockedAchievement, ToolboxContext, UserPreferences } from '@dbkang/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AchievementPage from './components/AchievementPage.vue'
import AchievementToast from './components/AchievementToast.vue'
import LofiPage from './components/LofiPage.vue'
import MiniPlayer from './components/MiniPlayer.vue'
import MusicPage from './components/MusicPage.vue'
import ProfilePage from './components/ProfilePage.vue'
import { bootstrap, savePreferences } from './api'
import { publicAsset } from './assets'
import { openToolboxTab, requestToolboxContext } from './bridge'
import { musicPlayer } from './music'

type TabId = 'achievements' | 'lofi' | 'music' | 'profile'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'achievements', label: '成就' },
  { id: 'lofi', label: 'Lo-fi 自习室' },
  { id: 'music', label: '音乐' },
]

const initialTab = new URLSearchParams(window.location.search).get('tab')
const activeTab = ref<TabId>(
  initialTab && ['achievements', 'lofi', 'music', 'profile'].includes(initialTab)
    ? (initialTab as TabId)
    : 'achievements',
)
const context = ref<ToolboxContext | null>(null)
const data = ref<BootstrapResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const focusing = ref(false)
const toastQueue = ref<NewlyUnlockedAchievement[]>([])
const currentToast = computed(() => toastQueue.value[0] || null)
const logoUrl = publicAsset('logo.svg')
const defaultAvatarUrl = publicAsset('default-avatar.svg')

onMounted(async () => {
  try {
    context.value = await requestToolboxContext()
    data.value = await bootstrap(context.value)
    toastQueue.value.push(...data.value.newlyUnlocked)
    musicPlayer.configure(data.value.preferences)
    await musicPlayer.loadLibrary()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法连接服务器，请稍后再试。'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => musicPlayer.destroy())

function navigate(tab: TabId): void {
  if (focusing.value && tab !== activeTab.value) {
    openToolboxTab(tab)
    return
  }
  activeTab.value = tab
}

function updateSummary(next: BootstrapResponse['summary']): void {
  if (data.value) data.value.summary = next
}

function updateProfile(next: BootstrapResponse['user']): void {
  if (data.value) data.value.user = next
}

function enqueueUnlocks(unlocks: NewlyUnlockedAchievement[]): void {
  if (!data.value || unlocks.length === 0) return
  toastQueue.value.push(...unlocks)
  void refresh()
}

async function refresh(): Promise<void> {
  if (!context.value) return
  const next = await bootstrap(context.value)
  next.newlyUnlocked = []
  data.value = next
}

async function updatePreferences(next: UserPreferences): Promise<void> {
  if (!data.value) return
  data.value.preferences = await savePreferences({ ...next, studentId: data.value.user.studentId })
}

function reloadPage(): void {
  window.location.reload()
}
</script>

<template>
  <div class="app-shell">
    <div v-if="loading" class="state-page">
      <div class="loading-line" />
      <p>正在进入 DBKang Toolbox…</p>
    </div>

    <div v-else-if="error" class="state-page state-page--error">
      <img :src="logoUrl" alt="" width="56" height="56" />
      <h1>暂时无法打开工具箱</h1>
      <p>{{ error }}</p>
      <button class="dbk-button" type="button" @click="reloadPage">重新加载</button>
    </div>

    <template v-else-if="data && context">
      <header class="topbar">
        <button class="brand" type="button" @click="navigate('achievements')">
          <img :src="logoUrl" alt="" width="32" height="32" />
          <span>
            <strong>DBKang Toolbox</strong>
            <small>{{ data.course.courseName }}</small>
          </span>
        </button>
        <nav aria-label="工具箱主导航">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            :class="['nav-link', { 'nav-link--active': activeTab === tab.id }]"
            @click="navigate(tab.id)"
          >
            {{ tab.label }}
          </button>
        </nav>
        <button class="profile-button" type="button" @click="navigate('profile')">
          <img :src="data.user.avatarUrl || defaultAvatarUrl" alt="" />
          <span><strong>{{ data.user.nickname }}</strong><small>{{ data.user.role === 'teacher' ? '教师 · ' : '' }}教学班 {{ data.course.classId }}</small></span>
        </button>
      </header>

      <main :class="['app-content', { 'app-content--room': activeTab === 'lofi' }]">
        <AchievementPage v-if="activeTab === 'achievements'" :data="data" />
        <LofiPage
          v-else-if="activeTab === 'lofi'"
          :context="context"
          :summary="data.summary"
          :preferences="data.preferences"
          @focus-state="focusing = $event"
          @summary="updateSummary"
          @unlocks="enqueueUnlocks"
          @preferences="updatePreferences"
        />
        <MusicPage
          v-else-if="activeTab === 'music'"
          :preferences="data.preferences"
          @preferences="updatePreferences"
        />
        <ProfilePage v-else :data="data" @profile="updateProfile" />
      </main>

      <MiniPlayer />

      <AchievementToast
        v-if="currentToast"
        :achievement="currentToast"
        @close="toastQueue.shift()"
      />
    </template>
  </div>
</template>
