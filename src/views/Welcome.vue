<template>
  <div id="dbloader-container">
    <db-uploader type="illustrated" />
    <div id="note">
      Sqliteviz is fully client-side. Your database never leaves your computer.
    </div>
    <button id="skip" class="secondary" @click="$router.push('/workspace')">
      Create empty database
    </button>
  </div>
</template>

<script>
import DbUploader from '@/components/DbUploader'

export default {
  name: 'Welcome',
  components: { DbUploader },
  created() {
    try {
      const hasImportedData = localStorage.getItem('hasImportedData') === '1'
      const inquiries = this.$store.state.inquiries || []
      if (hasImportedData && inquiries.length > 0) {
        this.$router.replace('/dashboard')
      }
    } catch (e) {
      // 如果本地存储不可用，忽略错误，继续正常流程
      console.error(e)
    }
  }
}
</script>

<style scoped>
#dbloader-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

#note {
  margin-top: 27px;
  font-size: 13px;
  color: var(--color-text-base);
}

#skip {
  margin-top: 42px;
}

:deep(.drop-area) {
  width: 706px;
  height: 482px;
  padding: 0 150px;
  position: relative;
}

:deep(.drop-area .text) {
  position: absolute;
  bottom: 42px;
  max-width: 300px;
}
</style>
