<script setup lang="ts">
import type { BootstrapResponse, UserProfile } from '@dbkang/shared'
import { ref } from 'vue'
import { saveProfile } from '../api'
import { publicAsset } from '../assets'

/**
 * 「设置偏好」页卡：目前只提供两项偏好——头像与昵称。
 *
 * 两项各自独立保存：头像以 data URL 提交，服务端只在收到新图时替换，
 * 因此保存昵称时传 `null` 即可保留原头像，反之亦然。
 */
const props = defineProps<{ data: BootstrapResponse }>()
const emit = defineEmits<{ profile: [value: UserProfile] }>()

const defaultAvatarUrl = publicAsset('default-avatar.svg')

const nickname = ref(props.data.user.nickname)
const nicknameError = ref<string | null>(null)
const nicknameSaved = ref(false)
const savingNickname = ref(false)

const avatarPreview = ref(props.data.user.avatarUrl || defaultAvatarUrl)
const pendingAvatar = ref<string | null>(null)
const avatarError = ref<string | null>(null)
const avatarSaved = ref(false)
const savingAvatar = ref(false)

/** 提交昵称，不附带头像，保持原头像不变。 */
async function submitNickname(): Promise<void> {
  nicknameError.value = null
  nicknameSaved.value = false
  const value = nickname.value.trim()
  if (!value) {
    nicknameError.value = '昵称不能为空。'
    return
  }
  if (value.length > 20) {
    nicknameError.value = '昵称不能超过 20 个字符。'
    return
  }
  savingNickname.value = true
  try {
    const user = await saveProfile({ ...identity(), nickname: value, avatarDataUrl: null })
    nickname.value = user.nickname
    nicknameSaved.value = true
    emit('profile', user)
  } catch (reason) {
    nicknameError.value = reason instanceof Error ? reason.message : '保存失败，请稍后再试。'
  } finally {
    savingNickname.value = false
  }
}

/** 提交头像，沿用当前昵称，避免误改昵称。 */
async function submitAvatar(): Promise<void> {
  if (!pendingAvatar.value) return
  avatarError.value = null
  avatarSaved.value = false
  savingAvatar.value = true
  try {
    const user = await saveProfile({
      ...identity(),
      nickname: nickname.value.trim(),
      avatarDataUrl: pendingAvatar.value,
    })
    pendingAvatar.value = null
    avatarPreview.value = user.avatarUrl || defaultAvatarUrl
    avatarSaved.value = true
    emit('profile', user)
  } catch (reason) {
    avatarError.value = reason instanceof Error ? reason.message : '保存失败，请稍后再试。'
  } finally {
    savingAvatar.value = false
  }
}

function chooseAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return Promise.resolve()
  avatarError.value = null
  avatarSaved.value = false
  if (!file.type.startsWith('image/')) {
    avatarError.value = '请选择图片文件。'
    return Promise.resolve()
  }
  if (file.size > 10 * 1024 * 1024) {
    avatarError.value = '原始图片不能超过 10 MB。'
    return Promise.resolve()
  }
  return cropAvatar(file)
    .then((dataUrl) => {
      pendingAvatar.value = dataUrl
      avatarPreview.value = dataUrl
    })
    .catch(() => {
      avatarError.value = '无法读取这张图片，请换一张重试。'
    })
}

/** 居中裁切成正方形并转成 WebP，与服务端只接受 WebP 的约定一致。 */
async function cropAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Canvas unavailable')
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    512,
    512,
  )
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Encoding failed'))),
      'image/webp',
      0.84,
    )
  })
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function identity(): { role: BootstrapResponse['user']['role']; studentId: string } {
  return { role: props.data.user.role, studentId: props.data.user.studentId }
}
</script>

<template>
  <section class="settings-page">
    <form class="dbk-panel preference" @submit.prevent="submitAvatar">
      <h2>头像</h2>
      <p class="hint">上传图片后会居中裁剪为正方形，并覆盖为当前工具箱内显示的头像。</p>
      <div class="preference-body">
        <img :src="avatarPreview" alt="当前头像" />
        <div class="preference-actions">
          <label class="dbk-button dbk-button--secondary pick">
            选择图片
            <input type="file" accept="image/*" @change="chooseAvatar" />
          </label>
          <button
            class="dbk-button"
            type="submit"
            :disabled="savingAvatar || !pendingAvatar"
          >
            {{ savingAvatar ? '正在保存…' : '保存头像' }}
          </button>
          <p v-if="avatarError" class="form-message form-message--error">{{ avatarError }}</p>
          <p v-else-if="avatarSaved" class="form-message">头像已更新。</p>
          <p v-else-if="!pendingAvatar" class="form-message">尚未选择新图片。</p>
        </div>
      </div>
    </form>

    <form class="dbk-panel preference" @submit.prevent="submitNickname">
      <h2>昵称</h2>
      <p class="hint">昵称会显示在顶部右侧，并用于工具箱内的称呼。</p>
      <div class="preference-body">
        <div class="nickname-field">
          <input
            v-model="nickname"
            class="dbk-input"
            maxlength="20"
            placeholder="请输入昵称"
            aria-label="昵称"
          />
          <small>{{ nickname.length }} / 20</small>
        </div>
        <div class="preference-actions">
          <button class="dbk-button" type="submit" :disabled="savingNickname">
            {{ savingNickname ? '正在保存…' : '保存昵称' }}
          </button>
          <p v-if="nicknameError" class="form-message form-message--error">{{ nicknameError }}</p>
          <p v-else-if="nicknameSaved" class="form-message">昵称已更新。</p>
        </div>
      </div>
    </form>
  </section>
</template>

<style scoped>
.settings-page {
  display: grid;
  /* align-content:start 让两张卡贴顶排列，剩余高度留在下方，不被拉伸 */
  flex: 1 1 auto;
  align-content: start;
  gap: 18px;
  width: 100%;
  max-width: 640px;
  min-height: 0;
  margin-inline: auto;
  overflow-y: auto;
}

.preference {
  padding: 22px 24px;
}

h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.hint {
  margin: 0 0 18px;
  color: var(--dbk-text-muted);
  font-size: 13px;
}

.preference-body {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.preference-body img {
  width: 88px;
  height: 88px;
  flex: 0 0 auto;
  border: 1px solid var(--dbk-border);
  border-radius: 50%;
  object-fit: cover;
}

.preference-actions {
  display: grid;
  flex: 1 1 auto;
  gap: 10px;
  justify-items: start;
}

.preference-actions .dbk-button {
  min-width: 120px;
}

.pick {
  display: inline-flex;
  align-items: center;
  text-align: center;
  cursor: pointer;
}

.pick input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.nickname-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.nickname-field small {
  position: absolute;
  right: 11px;
  bottom: 11px;
  color: var(--dbk-text-muted);
  font-size: 12px;
}

.nickname-field .dbk-input {
  padding-right: 62px;
}

.form-message {
  margin: 0;
  color: var(--dbk-success);
  font-size: 12px;
}

.form-message--error {
  color: var(--dbk-danger);
}
</style>