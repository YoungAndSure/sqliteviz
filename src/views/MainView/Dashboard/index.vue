<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <div>
        <h1 class="dashboard-title">Dashboard</h1>
        <p class="dashboard-tip">
          已保存的图表会以卡片形式展示在这里，你可以刷新数据或跳转到 Workspace 进行编辑。
        </p>
      </div>
      <div class="dashboard-filters">
        <label class="filter-label">时间范围：</label>
        <select v-model="rangePreset" @change="onPresetChange">
          <option value="last30">最近 30 天</option>
          <option value="thisMonth">本月</option>
          <option value="lastMonth">上月</option>
          <option value="all">全部</option>
          <option value="custom">自定义</option>
        </select>
        <input
          v-model="startDate"
          type="date"
          class="date-input"
          :disabled="rangePreset !== 'custom' && rangePreset !== 'all'"
        />
        <span class="filter-separator">-</span>
        <input
          v-model="endDate"
          type="date"
          class="date-input"
          :disabled="rangePreset !== 'custom' && rangePreset !== 'all'"
        />
      </div>
    </div>

    <div v-if="chartInquiries.length === 0" class="dashboard-empty">
      暂无已保存的图表。请先在 Workspace 中运行 SQL 并保存为 Inquiry。
    </div>

    <div v-else class="dashboard-grid">
      <div
        v-for="inquiry in chartInquiries"
        :key="inquiry.id"
        class="dashboard-card"
      >
        <div class="card-header">
          <div class="card-title">{{ inquiry.name || 'Untitled' }}</div>
          <div class="card-actions">
            <button
              class="secondary small"
              :disabled="loading[inquiry.id]"
              @click="refresh(inquiry)"
            >
              {{ loading[inquiry.id] ? '刷新中…' : '刷新' }}
            </button>
            <button class="secondary small" @click="openInquiry(inquiry)">
              编辑
            </button>
            <button class="secondary small danger" @click="removeInquiry(inquiry)">
              删除
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="errors[inquiry.id]" class="card-error">
            {{ errors[inquiry.id] }}
          </div>
          <div v-else-if="!dataSources[inquiry.id]" class="card-loading">
            正在加载数据…
          </div>
          <Chart
            v-else
            class="card-chart"
            :data-sources="dataSources[inquiry.id]"
            :init-options="inquiry.viewOptions"
            :import-to-png-enabled="false"
            :import-to-svg-enabled="false"
            :for-pivot="false"
            @update="onChartUpdated(inquiry)"
            @loadingImageCompleted="() => {}"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Chart from '@/views/MainView/Workspace/Tabs/Tab/DataView/Chart/index.vue'
import sqlTemplate from '@/lib/sqlTemplate'

export default {
  name: 'Dashboard',
  components: { Chart },
  data() {
    const today = new Date()
    const end = today.toISOString().slice(0, 10)
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 29)
    const start = startDate.toISOString().slice(0, 10)

    return {
      dataSources: {},
      loading: {},
      errors: {},
      rangePreset: 'last30',
      startDate: start,
      endDate: end
    }
  },
  computed: {
    inquiries() {
      return this.$store.state.inquiries || []
    },
    chartInquiries() {
      return this.inquiries.filter(inquiry => inquiry.viewType === 'chart')
    },
    sqlParams() {
      return {
        startDate: this.startDate,
        endDate: this.endDate
      }
    }
  },
  async mounted() {
    // 初次进入时，尝试为前几个卡片预加载数据
    const initial = this.chartInquiries.slice(0, 4)
    for (const inquiry of initial) {
      this.refresh(inquiry)
    }
  },
  methods: {
    onPresetChange() {
      const today = new Date()
      const end = today.toISOString().slice(0, 10)
      let start

      if (this.rangePreset === 'last30') {
        const d = new Date(today)
        d.setDate(d.getDate() - 29)
        start = d.toISOString().slice(0, 10)
      } else if (this.rangePreset === 'thisMonth') {
        const d = new Date(today.getFullYear(), today.getMonth(), 1)
        start = d.toISOString().slice(0, 10)
      } else if (this.rangePreset === 'lastMonth') {
        const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const endDate = new Date(today.getFullYear(), today.getMonth(), 0)
        start = d.toISOString().slice(0, 10)
        this.endDate = endDate.toISOString().slice(0, 10)
        this.startDate = start
        return
      } else if (this.rangePreset === 'all') {
        this.startDate = ''
        this.endDate = ''
        return
      } else if (this.rangePreset === 'custom') {
        return
      }

      this.startDate = start
      this.endDate = end
    },
    async refresh(inquiry) {
      if (!inquiry || !inquiry.query || !this.$store.state.db) {
        return
      }
      const id = inquiry.id
      this.$set ? this.$set(this.loading, id, true) : (this.loading[id] = true)
      this.$set ? this.$set(this.errors, id, null) : (this.errors[id] = null)
      try {
        const db = this.$store.state.db
        const finalSql = sqlTemplate.render(inquiry.query, this.sqlParams)
        const result = await db.execute(finalSql + ';')
        const dataSources = result && result.values ? result.values : null
        if (!dataSources || Object.keys(dataSources).length === 0) {
          const msg = '查询结果为空，无法绘制图表。'
          this.$set ? this.$set(this.errors, id, msg) : (this.errors[id] = msg)
        } else {
          this.$set
            ? this.$set(this.dataSources, id, dataSources)
            : (this.dataSources[id] = dataSources)
        }
      } catch (e) {
        const msg = e && e.message ? e.message : String(e)
        this.$set ? this.$set(this.errors, id, msg) : (this.errors[id] = msg)
      } finally {
        this.$set ? this.$set(this.loading, id, false) : (this.loading[id] = false)
      }
    },
    openInquiry(inquiry) {
      this.$store.dispatch('addTab', inquiry).then(id => {
        this.$store.commit('setCurrentTabId', id)
        if (this.$route.path !== '/workspace') {
          this.$router.push('/workspace')
        }
      })
    },
    removeInquiry(inquiry) {
      if (!window.confirm(`确认删除图表「${inquiry.name || 'Untitled'}」吗？`)) {
        return
      }
      const idSet = new Set([inquiry.id])
      this.$store.dispatch('deleteInquiries', idSet)
    },
    onChartUpdated() {
      // 预留：未来如需在 Dashboard 中保存图表配置变更，可在此处处理
    }
  }
}
</script>

<style scoped>
.dashboard {
  padding: 16px 24px;
}

.dashboard-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.dashboard-title {
  margin: 0 0 4px;
  font-size: 20px;
}

.dashboard-tip {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-base);
}

.dashboard-filters {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  color: var(--color-text-base);
}

.date-input {
  padding: 2px 6px;
  font-size: 12px;
}

.filter-separator {
  font-size: 12px;
}

.dashboard-empty {
  margin-top: 40px;
  font-size: 14px;
  color: var(--color-text-base);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  grid-gap: 16px;
}

.dashboard-card {
  background-color: var(--color-white);
  border-radius: 6px;
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-1);
  display: flex;
  flex-direction: column;
  min-height: 260px;
}

.card-header {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border-light);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  gap: 4px;
}

.card-body {
  padding: 8px 8px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-chart {
  flex: 1;
}

.card-error {
  padding: 8px;
  font-size: 12px;
  color: var(--color-error, #d9534f);
}

.card-loading {
  padding: 8px;
  font-size: 12px;
  color: var(--color-text-base);
}

button.small {
  padding: 2px 6px;
  font-size: 11px;
}

button.danger {
  color: #d9534f;
}
</style>
