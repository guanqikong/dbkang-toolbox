<script setup lang="ts">
import type { BootstrapResponse, NewlyUnlockedAchievement, ToolboxContext, UserPreferences } from '@dbkang/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AchievementPage from './components/AchievementPage.vue'
import AchievementToast from './components/AchievementToast.vue'
import LofiPage from './components/LofiPage.vue'
import MiniPlayer from './components/MiniPlayer.vue'
import MusicPage from './components/MusicPage.vue'
import PlaceholderPage from './components/PlaceholderPage.vue'
import SettingsPage from './components/SettingsPage.vue'
import { bootstrap, savePreferences } from './api'
import { publicAsset } from './assets'
import { bindNativeLook, openToolboxTab, requestToolboxContext } from './bridge'
import { musicPlayer } from './music'

type TabId = 'home' | 'achievements' | 'study' | 'music' | 'chat' | 'settings'

/** 顶部菜单列。顺序与原生页卡的页签一致，功能未开放的先用占位页顶替。 */
const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'home', label: '主页' },
  { id: 'achievements', label: '成就大厅' },
  { id: 'study', label: '自习间' },
  { id: 'music', label: '音乐厅' },
  { id: 'chat', label: '留言聊天室' },
  { id: 'settings', label: '设置偏好' },
]

const initialTab = new URLSearchParams(window.location.search).get('tab')
const activeTab = ref<TabId>(isTabId(initialTab) ? initialTab : 'home')
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
    // 先挂上排版监听，再请求上下文，否则会漏掉脚本的应答。
    bindNativeLook()
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

function isTabId(value: string | null): value is TabId {
  return value !== null && tabs.some((tab) => tab.id === value)
}

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
        <nav class="main-nav" aria-label="工具箱主导航">
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
        <button class="profile-button" type="button" @click="navigate('settings')">
          <img :src="data.user.avatarUrl || defaultAvatarUrl" alt="" />
          <span><strong>{{ data.user.nickname }}</strong></span>
        </button>
      </header>

      <main :class="['app-content', { 'app-content--room': activeTab === 'study' }]">
        <PlaceholderPage v-if="activeTab === 'home'" title="主页" />
        <AchievementPage v-else-if="activeTab === 'achievements'" :data="data" />
        <LofiPage
          v-else-if="activeTab === 'study'"
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
        <PlaceholderPage v-else-if="activeTab === 'chat'" title="留言聊天室" />
        <SettingsPage v-else :data="data" @profile="updateProfile" />
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