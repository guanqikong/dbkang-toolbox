<script setup lang="ts">
import type { BootstrapResponse, UserProfile } from '@dbkang/shared'
import { formatDuration } from '@dbkang/shared'
import { ref } from 'vue'
import { saveProfile } from '../api'
import { publicAsset } from '../assets'

const props = defineProps<{ data: BootstrapResponse }>()
const emit = defineEmits<{ profile: [value: UserProfile] }>()
const defaultAvatarUrl = publicAsset('default-avatar.svg')
const nickname = ref(props.data.user.nickname)
const avatarDataUrl = ref<string | null>(null)
const previewUrl = ref(props.data.user.avatarUrl || defaultAvatarUrl)
const saving = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

async function chooseAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = null
  message.value = null
  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件。'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    error.value = '原始图片不能超过 10 MB。'
    return
  }
  try {
    avatarDataUrl.value = await cropAvatar(file)
    previewUrl.value = avatarDataUrl.value
  } catch {
    error.value = '无法读取这张图片，请换一张重试。'
  } finally {
    input.value = ''
  }
}

async function cropAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sourceX = (bitmap.width - side) / 2
  const sourceY = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, 512, 512)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Encoding failed')), 'image/webp', 0.84)
  })
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function submit(): Promise<void> {
  error.value = null
  message.value = null
  const value = nickname.value.trim()
  if (!value || value.length > 20) {
    error.value = '昵称需要填写 1～20 个字符。'
    return
  }
  saving.value = true
  try {
    const user = await saveProfile({
      role: props.data.user.role,
      studentId: props.data.user.studentId,
      nickname: value,
      avatarDataUrl: avatarDataUrl.value,
    })
    nickname.value = user.nickname
    avatarDataUrl.value = null
    previewUrl.value = user.avatarUrl || defaultAvatarUrl
    emit('profile', user)
    message.value = '个人资料已保存。'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请稍后再试。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="profile-page">
    <header><p>个人资料</p><h1>{{ data.user.nickname }}</h1></header>
    <div class="profile-layout">
      <form class="identity dbk-panel" @submit.prevent="submit">
        <img :src="previewUrl" alt="当前头像" />
        <label class="avatar-action">上传头像
          <input type="file" accept="image/*" @change="chooseAvatar" />
        </label>
        <label class="nickname-field">昵称
          <input v-model="nickname" class="dbk-input" maxlength="20" required />
          <small>{{ nickname.length }} / 20</small>
        </label>
        <p>{{ data.user.realName }} · {{ data.user.role === 'teacher' ? '工号' : '学号' }} {{ data.user.studentId }}</p>
        <p>学习通教学班 ID：{{ data.course.classId }}</p>
        <p v-if="error" class="form-message form-message--error">{{ error }}</p>
        <p v-else-if="message" class="form-message">{{ message }}</p>
        <button class="dbk-button" type="submit" :disabled="saving">{{ saving ? '正在保存…' : '保存资料' }}</button>
      </form>
      <div class="profile-details">
        <div class="dbk-panel stats">
          <div><span>累计专注</span><strong>{{ formatDuration(data.summary.totalFocusSeconds) }}</strong></div>
          <div><span>今日专注</span><strong>{{ formatDuration(data.summary.todayFocusSeconds) }}</strong></div>
          <div><span>累计番茄</span><strong>{{ data.summary.totalPomodoros }}</strong></div>
          <div><span>{{ data.user.role === 'teacher' ? '课程成就' : '已解锁成就' }}</span><strong>{{ data.user.role === 'teacher' ? data.achievements.length : data.achievements.filter(item => item.unlocked).length }}</strong></div>
        </div>
        <div class="dbk-panel course-info"><h2>当前课程</h2><p>{{ data.course.courseName }}</p><small>成就、公告和作业成绩按课程隔离；专注与番茄统计全局共用。</small></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
header p { margin:0 0 5px; color:var(--dbk-text-muted); font-size:13px; }
header h1 { margin:0 0 22px; font-size:28px; }
.profile-layout { display:grid; grid-template-columns:310px 1fr; gap:18px; }
.identity { padding:28px; text-align:center; }
.identity img { width:112px; height:112px; border-radius:50%; object-fit:cover; }
.identity p { margin:4px 0; color:var(--dbk-text-muted); }
.identity button { width:100%; margin-top:18px; }
.avatar-action { display:inline-block; margin:12px 0 18px; color:var(--dbk-primary); font-size:13px; cursor:pointer; }
.avatar-action input { position:absolute; width:1px; height:1px; overflow:hidden; opacity:0; }
.nickname-field { position:relative; display:grid; gap:7px; margin-bottom:16px; color:var(--dbk-text-muted); font-size:12px; text-align:left; }
.nickname-field small { position:absolute; right:10px; bottom:10px; color:#9aa5b5; }
.nickname-field .dbk-input { padding-right:58px; }
.identity .form-message { margin-top:12px; color:#18794e; font-size:12px; }
.identity .form-message--error { color:#b42318; }
.profile-details { display:grid; gap:18px; align-content:start; }
.stats { display:grid; grid-template-columns:repeat(2,1fr); }
.stats div { display:grid; gap:8px; padding:24px; border-right:1px solid var(--dbk-border); border-bottom:1px solid var(--dbk-border); }
.stats div:nth-child(2n) { border-right:0; }
.stats div:nth-last-child(-n+2) { border-bottom:0; }
.stats span, .course-info small { color:var(--dbk-text-muted); }
.stats strong { font-size:24px; }
.course-info { padding:24px; }
.course-info h2 { margin:0 0 10px; font-size:16px; }
.course-info p { margin:0 0 8px; }
</style>
