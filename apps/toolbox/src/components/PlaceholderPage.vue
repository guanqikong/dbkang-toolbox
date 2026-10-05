<script setup lang="ts">
/** 尚未开放的页卡占位，版式与其它页卡保持一致，避免顶栏出现空页。 */
defineProps<{ title: string }>()
</script>

<template>
  <section class="placeholder-page">
    <div class="dbk-panel dbk-empty">
      <strong>{{ title }}</strong>
      <p>敬请期待……</p>
    </div>
  </section>
</template>

<style scoped>
.placeholder-page {
  display: grid;
  place-items: center;
}

.dbk-empty {
  gap: 8px;
}

strong {
  font-size: 16px;
}

p {
  margin: 0;
  color: var(--dbk-text-muted);
  font-size: 13px;
}
</style>