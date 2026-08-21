<script setup lang="ts">
import type {
  NewlyUnlockedAchievement,
  StudySummary,
  ToolboxContext,
  UserPreferences,
} from '@dbkang/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { absoluteAsset, heartbeatFocus, pauseFocus, startFocus, stopFocus } from '../api'

type TimerPhase = 'idle' | 'focus' | 'rest'

const props = defineProps<{
  context: ToolboxContext
  summary: StudySummary
  preferences: UserPreferences
}>()
const emit = defineEmits<{
  'focus-state': [value: boolean]
  summary: [value: StudySummary]
  unlocks: [value: NewlyUnlockedAchievement[]]
  preferences: [value: UserPreferences]
}>()

const phase = ref<TimerPhase>('idle')
const paused = ref(false)
const currentRound = ref(1)
const remainingSeconds = ref(props.preferences.focusMinutes * 60)
const sessionId = ref<string | null>(null)
const phaseDeadline = ref(0)
const backgroundReady = ref(false)
const backgroundFailed = ref(false)
const connected = ref(navigator.onLine)
const ambienceError = ref<string | null>(null)
const failedAmbiences = ref<Array<Exclude<UserPreferences['ambienceType'], null>>>([])
const ambienceBuffers = new Map<Exclude<UserPreferences['ambienceType'], null>, AudioBuffer>()
let ambienceContext: AudioContext | null = null
let ambienceGain: GainNode | null = null
let ambienceSource: AudioBufferSourceNode | null = null
let currentAmbience: UserPreferences['ambienceType'] = null
let ambienceRequestId = 0
let ticker: number | null = null
let heartbeatTimer: number | null = null
let transitionPending = false
let disconnectedAt: string | null = null
const pendingStops: Array<{ sessionId: string; completed: boolean; disconnectedAt: string | null }> = []

const backgroundUrl = absoluteAsset('/assets/lofi/background.mp4')
const ambienceOptions = [
  { value: null, label: '关闭环境音' },
  { value: 'rain', label: '雨声' },
  { value: 'wind', label: '风声' },
  { value: 'fire', label: '篝火声' },
] as const

const running = computed(() => phase.value !== 'idle')
const timerLabel = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
const phaseLabel = computed(() => {
  if (phase.value === 'focus') return paused.value ? '专注已暂停' : '专注中'
  if (phase.value === 'rest') return paused.value ? '休息已暂停' : '休息中'
  return '准备开始'
})

onMounted(() => {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('beforeunload', stopOnUnload)
  window.addEventListener('pointerdown', resumeAmbience, { passive: true })
  if (props.preferences.ambienceType) void applyAmbience(props.preferences.ambienceType)
})

onBeforeUnmount(() => {
  clearTimers()
  stopAmbienceSource()
  void ambienceContext?.close()
  ambienceContext = null
  ambienceGain = null
  ambienceBuffers.clear()
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('beforeunload', stopOnUnload)
  window.removeEventListener('pointerdown', resumeAmbience)
  document.title = 'DBKang Toolbox'
  emit('focus-state', false)
  if (phase.value === 'focus' && sessionId.value) {
    void stopFocus({ ...focusIdentity(), sessionId: sessionId.value, completed: false }).catch(() => undefined)
  }
})

watch(timerLabel, (value) => {
  if (running.value) document.title = `${value} · ${phaseLabel.value} · DBKang Toolbox`
})

function focusIdentity() {
  return {
    role: props.context.role,
    studentId: props.context.studentId,
    realName: props.context.realName,
    grade: props.context.grade,
    classNumber: props.context.classNumber,
    classId: props.context.classId,
    courseId: props.context.courseId,
  }
}

function makeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function begin(): Promise<void> {
  if (!backgroundReady.value || backgroundFailed.value || running.value) return
  currentRound.value = 1
  emit('focus-state', true)
  await beginFocus()
}

async function beginFocus(): Promise<void> {
  phase.value = 'focus'
  paused.value = false
  remainingSeconds.value = props.preferences.focusMinutes * 60
  sessionId.value = makeSessionId()
  phaseDeadline.value = Date.now() + remainingSeconds.value * 1000
  startTicker()
  await sendStart()
}

function beginRest(): void {
  phase.value = 'rest'
  paused.value = false
  remainingSeconds.value = props.preferences.restMinutes * 60
  phaseDeadline.value = Date.now() + remainingSeconds.value * 1000
  startTicker()
}

async function sendStart(): Promise<void> {
  if (!sessionId.value || !navigator.onLine) {
    connected.value = false
    return
  }
  try {
    const response = await startFocus({ ...focusIdentity(), sessionId: sessionId.value })
    consumeResponse(response)
    startHeartbeat()
  } catch {
    connected.value = false
  }
}

function startTicker(): void {
  if (ticker != null) window.clearInterval(ticker)
  ticker = window.setInterval(tick, 250)
  tick()
}

function tick(): void {
  if (paused.value || phase.value === 'idle') return
  remainingSeconds.value = Math.max(0, Math.ceil((phaseDeadline.value - Date.now()) / 1000))
  if (remainingSeconds.value === 0 && !transitionPending) void finishPhase()
}

async function finishPhase(): Promise<void> {
  transitionPending = true
  try {
    if (phase.value === 'focus') {
      await sendStop(true)
      if (currentRound.value >= props.preferences.rounds) {
        finishAll()
      } else {
        beginRest()
      }
    } else if (phase.value === 'rest') {
      currentRound.value += 1
      await beginFocus()
    }
  } finally {
    transitionPending = false
  }
}

async function togglePause(): Promise<void> {
  if (!running.value) return
  if (!paused.value) {
    remainingSeconds.value = Math.max(0, Math.ceil((phaseDeadline.value - Date.now()) / 1000))
    paused.value = true
    stopHeartbeat()
    if (phase.value === 'focus' && sessionId.value && navigator.onLine) {
      try {
        const response = await pauseFocus({ ...focusIdentity(), sessionId: sessionId.value })
        consumeResponse(response)
      } catch {
        connected.value = false
      }
    }
    return
  }

  paused.value = false
  phaseDeadline.value = Date.now() + remainingSeconds.value * 1000
  if (phase.value === 'focus') await sendStart()
}

async function endEarly(): Promise<void> {
  if (phase.value === 'focus') await sendStop(false)
  finishAll()
}

function finishAll(): void {
  clearTimers()
  phase.value = 'idle'
  paused.value = false
  sessionId.value = null
  remainingSeconds.value = props.preferences.focusMinutes * 60
  document.title = 'DBKang Toolbox'
  emit('focus-state', false)
}

async function sendStop(completed: boolean): Promise<void> {
  stopHeartbeat()
  if (!sessionId.value) return
  if (!navigator.onLine) {
    pendingStops.push({ sessionId: sessionId.value, completed, disconnectedAt })
    connected.value = false
    return
  }
  try {
    const response = await stopFocus({
      ...focusIdentity(),
      sessionId: sessionId.value,
      completed,
      disconnectedAt,
    })
    consumeResponse(response)
  } catch {
    connected.value = false
  }
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = window.setInterval(() => void sendHeartbeat(), 10_000)
}

function stopHeartbeat(): void {
  if (heartbeatTimer != null) window.clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

async function sendHeartbeat(): Promise<void> {
  if (phase.value !== 'focus' || paused.value || !sessionId.value || !navigator.onLine) return
  try {
    const response = await heartbeatFocus({ ...focusIdentity(), sessionId: sessionId.value })
    consumeResponse(response)
  } catch {
    connected.value = false
  }
}

function consumeResponse(response: Awaited<ReturnType<typeof heartbeatFocus>>): void {
  connected.value = response.connected
  emit('summary', response.summary)
  if (response.newlyUnlocked.length) emit('unlocks', response.newlyUnlocked)
}

async function handleOnline(): Promise<void> {
  connected.value = true
  const queued = pendingStops.splice(0)
  try {
    for (const item of queued) {
      const response = await stopFocus({ ...focusIdentity(), ...item })
      consumeResponse(response)
    }
    if (phase.value === 'focus' && sessionId.value) {
      if (disconnectedAt && !queued.some((item) => item.sessionId === sessionId.value)) {
        const response = await stopFocus({
          ...focusIdentity(),
          sessionId: sessionId.value,
          completed: false,
          disconnectedAt,
        })
        consumeResponse(response)
      }
      if (!paused.value) await sendStart()
    }
    disconnectedAt = null
  } catch {
    pendingStops.unshift(...queued)
    connected.value = false
  }
}

function handleOffline(): void {
  connected.value = false
  disconnectedAt ||= new Date().toISOString()
  stopHeartbeat()
}

function stopOnUnload(event: BeforeUnloadEvent): void {
  if (phase.value !== 'focus' || !sessionId.value) return
  void fetch(`${absoluteAsset('/api/v1/student/focus/stop')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...focusIdentity(), sessionId: sessionId.value, completed: false }),
    keepalive: true,
  })
  event.preventDefault()
  event.returnValue = ''
}

function clearTimers(): void {
  if (ticker != null) window.clearInterval(ticker)
  ticker = null
  stopHeartbeat()
}

function updateTimerSetting(key: 'focusMinutes' | 'restMinutes' | 'rounds', value: number): void {
  const limits = { focusMinutes: [1, 180], restMinutes: [1, 60], rounds: [1, 20] } as const
  const [minimum, maximum] = limits[key]
  const safe = Math.max(minimum, Math.min(maximum, Math.round(value)))
  emitPreferences({ [key]: safe })
  if (key === 'focusMinutes' && phase.value === 'idle') remainingSeconds.value = safe * 60
}

async function applyAmbience(value: UserPreferences['ambienceType']): Promise<void> {
  if (value && failedAmbiences.value.includes(value)) return
  ambienceError.value = null
  const requestId = ++ambienceRequestId
  stopAmbienceSource()
  currentAmbience = value
  if (value) {
    try {
      await nextTick()
      const context = ensureAmbienceContext()
      const buffer = await loadAmbienceBuffer(context, value)
      if (requestId !== ambienceRequestId || currentAmbience !== value) return
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(ambienceGain!)
      source.start()
      ambienceSource = source
      void context.resume()
    } catch {
      handleAmbienceError(value, requestId)
      return
    }
  }
  emitPreferences({ ambienceType: value })
}

function changeAmbienceVolume(value: number): void {
  const safe = Math.max(0, Math.min(1, value))
  if (ambienceContext && ambienceGain) {
    ambienceGain.gain.setValueAtTime(safe, ambienceContext.currentTime)
  }
  emitPreferences({ ambienceVolume: safe })
}

function ensureAmbienceContext(): AudioContext {
  if (!ambienceContext) {
    ambienceContext = new AudioContext()
    ambienceGain = ambienceContext.createGain()
    ambienceGain.gain.value = props.preferences.ambienceVolume
    ambienceGain.connect(ambienceContext.destination)
  }
  return ambienceContext
}

async function loadAmbienceBuffer(
  context: AudioContext,
  value: Exclude<UserPreferences['ambienceType'], null>,
): Promise<AudioBuffer> {
  const cached = ambienceBuffers.get(value)
  if (cached) return cached
  const response = await fetch(absoluteAsset(`/assets/lofi/${value}.mp3`))
  if (!response.ok) throw new Error(`环境音加载失败：${response.status}`)
  const buffer = await context.decodeAudioData(await response.arrayBuffer())
  ambienceBuffers.set(value, buffer)
  return buffer
}

function stopAmbienceSource(): void {
  if (!ambienceSource) return
  ambienceSource.stop()
  ambienceSource.disconnect()
  ambienceSource = null
}

function resumeAmbience(): void {
  if (ambienceContext?.state === 'suspended') void ambienceContext.resume()
}

function handleAmbienceError(
  value: Exclude<UserPreferences['ambienceType'], null>,
  requestId: number,
): void {
  if (requestId !== ambienceRequestId) return
  stopAmbienceSource()
  if (!failedAmbiences.value.includes(value)) {
    failedAmbiences.value = [...failedAmbiences.value, value]
  }
  ambienceError.value = '该环境音加载失败，已禁用；其他功能不受影响。'
  currentAmbience = null
  emitPreferences({ ambienceType: null })
}

function emitPreferences(partial: Partial<UserPreferences>): void {
  emit('preferences', { ...props.preferences, ...partial })
}

</script>

<template>
  <section class="lofi-page">
    <div class="room-shell">
      <header class="room-rail room-rail--top">
        <div class="room-title">
          <p>Lo-fi 自习室</p>
          <h1>{{ phaseLabel }}</h1>
        </div>
        <div class="online-state">
          <span :class="{ offline: !connected }" />
          {{ connected ? `${summary.focusingStudentCount} 人正在专注` : '连接已断开，本地计时继续' }}
        </div>
      </header>

      <div class="room-body">
        <aside class="room-side room-side--ambience" aria-label="环境音控制">
          <div class="side-heading">
            <span>环境音</span>
            <small v-if="ambienceError" title="该环境音加载失败">加载失败</small>
          </div>
          <div class="ambience-options">
            <button
              v-for="item in ambienceOptions"
              :key="String(item.value)"
              type="button"
              :class="{ active: preferences.ambienceType === item.value }"
              :disabled="item.value !== null && failedAmbiences.includes(item.value)"
              @click="applyAmbience(item.value)"
            >{{ item.label }}</button>
          </div>
          <label class="volume-control">
            <span>音量</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="preferences.ambienceVolume"
              @change="changeAmbienceVolume(Number(($event.target as HTMLInputElement).value))"
            />
          </label>
        </aside>

        <div class="room-video-frame">
          <video
            class="room-background"
            :src="backgroundUrl"
            muted
            loop
            autoplay
            playsinline
            @canplay="backgroundReady = true"
            @error="backgroundFailed = true"
          />
          <div v-if="backgroundFailed" class="room-blocker">
            <div>
              <h2>背景加载失败，请稍后重试。</h2>
              <p>Lo-fi 自习室需要完整加载背景视频后才能使用。</p>
            </div>
          </div>
          <div v-else-if="!backgroundReady" class="room-blocker">
            <div><div class="loading-line" /><p>正在布置自习室…</p></div>
          </div>
        </div>

        <aside class="room-side room-side--timer" aria-label="番茄钟控制">
          <div class="round-label">
            {{ running ? `第 ${currentRound} / ${preferences.rounds} 轮` : '番茄专注' }}
          </div>
          <strong class="timer-value">{{ timerLabel }}</strong>
          <p>{{ phase === 'rest' ? '下一轮即将开始' : '专注眼前这一件事' }}</p>

          <div v-if="!running" class="timer-settings">
            <label>
              <span>专注</span>
              <input class="dbk-input" type="number" min="1" max="180" :value="preferences.focusMinutes" @change="updateTimerSetting('focusMinutes', Number(($event.target as HTMLInputElement).value))" />
              <small>分钟</small>
            </label>
            <label>
              <span>休息</span>
              <input class="dbk-input" type="number" min="1" max="60" :value="preferences.restMinutes" @change="updateTimerSetting('restMinutes', Number(($event.target as HTMLInputElement).value))" />
              <small>分钟</small>
            </label>
            <label>
              <span>轮数</span>
              <input class="dbk-input" type="number" min="1" max="20" :value="preferences.rounds" @change="updateTimerSetting('rounds', Number(($event.target as HTMLInputElement).value))" />
              <small>轮</small>
            </label>
          </div>

          <div class="timer-actions">
            <button v-if="!running" class="dbk-button timer-primary" type="button" :disabled="!backgroundReady || backgroundFailed" @click="begin">开始专注</button>
            <template v-else>
              <button class="dbk-button timer-primary" type="button" @click="togglePause">{{ paused ? '继续' : '暂停' }}</button>
              <button class="dbk-button room-secondary" type="button" @click="endEarly">结束</button>
            </template>
          </div>
        </aside>
      </div>

      <footer class="room-rail room-rail--bottom">
        <span>今日专注 <strong>{{ Math.floor(summary.todayFocusSeconds / 60) }}</strong> 分钟</span>
        <span>今日番茄 <strong>{{ summary.todayPomodoros }}</strong> 个</span>
        <span>累计完成 <strong>{{ summary.totalPomodoros }}</strong> 个番茄</span>
        <small>计时数据每 10 秒同步</small>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.lofi-page { height:100%; min-height:552px; color:#fff; background:#111722; }
.room-shell { display:grid; grid-template-rows:68px minmax(0,1fr) 48px; height:100%; min-height:552px; }
.room-rail { display:flex; align-items:center; padding:0 24px; background:#111722; }
.room-rail--top { justify-content:space-between; border-bottom:1px solid rgba(255,255,255,.1); }
.room-title p { margin:0 0 3px; color:rgba(255,255,255,.52); font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
.room-title h1 { margin:0; font-size:20px; font-weight:560; }
.online-state { display:flex; gap:8px; align-items:center; color:rgba(255,255,255,.72); font-size:12px; }
.online-state span { width:8px; height:8px; border-radius:50%; background:#6ee7b7; box-shadow:0 0 0 3px rgba(110,231,183,.12); }
.online-state span.offline { background:#f0b861; box-shadow:none; }
.room-body { display:grid; grid-template-columns:168px minmax(460px,1fr) 252px; min-height:0; padding:12px; gap:12px; }
.room-side { min-height:0; padding:18px 16px; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:#171f2c; }
.side-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; font-size:13px; font-weight:600; }
.side-heading small { color:#f0b861; font-size:10px; font-weight:400; }
.ambience-options { display:grid; gap:8px; }
.ambience-options button { min-height:40px; padding:0 10px; border:1px solid rgba(255,255,255,.12); border-radius:6px; color:rgba(255,255,255,.72); text-align:left; background:rgba(255,255,255,.035); }
.ambience-options button:hover, .ambience-options button.active { border-color:#6798f2; color:#fff; background:rgba(47,111,228,.28); }
.ambience-options button:disabled { color:rgba(255,255,255,.28); cursor:not-allowed; }
.volume-control { display:grid; gap:9px; margin-top:20px; color:rgba(255,255,255,.48); font-size:11px; }
.volume-control input { width:100%; accent-color:#78a5f6; }
.room-video-frame { position:relative; min-width:0; min-height:0; overflow:hidden; border:1px solid rgba(255,255,255,.1); border-radius:8px; background:#202a3a; }
.room-background { display:block; width:100%; height:100%; object-fit:cover; }
.room-blocker { position:absolute; inset:0; display:grid; place-items:center; padding:30px; color:#fff; text-align:center; background:#202b3e; }
.room-blocker h2 { margin:0 0 8px; font-size:20px; }
.room-blocker p { color:rgba(255,255,255,.62); }
.room-blocker .loading-line { margin:0 auto; background:rgba(255,255,255,.2); }
.room-side--timer { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
.round-label { color:rgba(255,255,255,.5); font-size:11px; letter-spacing:.08em; }
.timer-value { margin:11px 0 3px; font-size:52px; font-weight:500; line-height:1; letter-spacing:-.05em; font-variant-numeric:tabular-nums; }
.room-side--timer > p { margin:6px 0 0; color:rgba(255,255,255,.45); font-size:11px; }
.timer-settings { display:grid; gap:7px; width:100%; margin-top:18px; }
.timer-settings label { display:grid; grid-template-columns:42px 1fr 30px; gap:6px; align-items:center; color:rgba(255,255,255,.52); font-size:10px; text-align:left; }
.timer-settings .dbk-input { min-height:32px; padding:5px 8px; border-color:rgba(255,255,255,.14); color:#fff; text-align:center; background:rgba(255,255,255,.06); }
.timer-settings small { color:rgba(255,255,255,.38); }
.timer-actions { display:flex; gap:8px; width:100%; margin-top:18px; }
.timer-actions .dbk-button { flex:1; padding:0 12px; }
.room-secondary { border-color:rgba(255,255,255,.16); color:#fff; background:transparent; }
.room-secondary:hover { border-color:rgba(255,255,255,.28); background:rgba(255,255,255,.06); }
.room-rail--bottom { gap:18px; padding-right:32px; padding-left:32px; overflow:hidden; border-top:1px solid rgba(255,255,255,.1); color:rgba(255,255,255,.48); font-size:11px; }
.room-rail--bottom span { flex:none; white-space:nowrap; }
.room-rail--bottom strong { color:#fff; font-size:13px; font-weight:500; }
.room-rail--bottom small { margin-left:auto; color:rgba(255,255,255,.34); }
</style>
