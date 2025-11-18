<template>
  <div ref="chartContainer" class="chart-container">
    <div v-show="!dataSources" class="warning chart-warning">
      There is no data to build a chart. Run your SQL query and make sure the
      result is not empty.
    </div>
    <div
      class="chart"
      :style="{ height: !dataSources ? 'calc(100% - 40px)' : '100%' }"
    >
      <PlotlyEditor
        ref="plotlyEditor"
        :data="state.data"
        :layout="state.layout"
        :frames="state.frames"
        :config="config"
        :dataSources="dataSources"
        :dataSourceOptions="dataSourceOptions"
        :plotly="plotly"
        :useResizeHandler="useResizeHandler"
        :debug="true"
        :advancedTraceTypeSelector="true"
        @update="update"
        @render="onRender"
      />
    </div>
  </div>
</template>

<script>
import { applyPureReactInVue } from 'veaury'
import plotly from 'plotly.js'
import 'react-chart-editor/lib/react-chart-editor.css'
import ReactPlotlyEditorWithPlotRef from '@/lib/ReactPlotlyEditorWithPlotRef.jsx'
import chartHelper from '@/lib/chartHelper'
import * as dereference from 'react-chart-editor/lib/lib/dereference'
import fIo from '@/lib/utils/fileIo'
import events from '@/lib/utils/events'

export default {
  name: 'Chart',
  components: {
    PlotlyEditor: applyPureReactInVue(ReactPlotlyEditorWithPlotRef)
  },
  props: {
    dataSources: Object,
    initOptions: Object,
    importToPngEnabled: Boolean,
    importToSvgEnabled: Boolean,
    forPivot: Boolean
  },
  emits: ['update:importToSvgEnabled', 'update', 'loadingImageCompleted'],
  data() {
    return {
      plotly,
      state: this.initOptions || {
        data: [],
        layout: { autosize: true },
        frames: []
      },
      config: {
        editable: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['toImage']
      },
      resizeObserver: null,
      useResizeHandler: this.$store.state.isWorkspaceVisible
    }
  },
  computed: {
    dataSourceOptions() {
      return chartHelper.getOptionsFromDataSources(this.dataSources)
    }
  },
  watch: {
    dataSources() {
      // we need to update state.data in order to update the graph
      // https://github.com/plotly/react-chart-editor/issues/948
      if (this.dataSources) {
        dereference.default(this.state.data, this.dataSources)
        this.updatePlotly()
      }
    }
  },
  created() {
    // https://github.com/plotly/plotly.js/issues/4555
    plotly.setPlotConfig({
      notifyOnLogging: 1
    })
    this.$watch(
      () =>
        this.state &&
        this.state.data &&
        this.state.data
          .map(trace => `${trace.type}${trace.mode ? '-' + trace.mode : ''}`)
          .join(','),
      value => {
        events.send('viz_plotly.render', null, {
          type: value,
          pivot: !!this.forPivot
        })
      },
      { deep: true }
    )
    this.$emit('update:importToSvgEnabled', true)
  },
  mounted() {
    this.resizeObserver = new ResizeObserver(this.handleResize)
    this.resizeObserver.observe(this.$refs.chartContainer)
    if (this.dataSources) {
      dereference.default(this.state.data, this.dataSources)
      this.updatePlotly()
    }
  },
  activated() {
    this.useResizeHandler = true
  },
  deactivated() {
    this.useResizeHandler = false
  },
  beforeUnmount() {
    this.resizeObserver.unobserve(this.$refs.chartContainer)
  },
  methods: {
    async handleResize() {
      this.updatePlotly()
    },
    onRender() {
      // TODO: check changes and enable Save button if needed
    },
    update(data, layout, frames) {
      this.state = { data, layout, frames }
      this.$emit('update')
    },
    updatePlotly() {
      const plotComponent = this.$refs.plotlyEditor.plotComponentRef.current
      plotComponent.updatePlotly(
        true, // shouldInvokeResizeHandler
        plotComponent.props.onUpdate, // figureCallbackFunction
        false // shouldAttachUpdateEvents
      )
    },
    getOptionsForSave() {
      return chartHelper.getOptionsForSave(this.state, this.dataSources)
    },
    async saveAsPng() {
      const url = await this.prepareCopy()
      this.$emit('loadingImageCompleted')
      fIo.downloadFromUrl(url, 'chart')
    },

    async saveAsSvg() {
      const url = await this.prepareCopy('svg')
      fIo.downloadFromUrl(url, 'chart')
    },

    async saveAsHtml() {
      try {
        // 生成基于查询语句的文件名
        const queryFileName = this.generateFileNameFromQuery();
        
        // 使用临时存储保存文件
        const result = await fIo.saveToTempStorage(
          chartHelper.getHtml(this.state),
          queryFileName,
          'text/html'
        )
        
        // 显示保存成功信息
        if (result.success) {
          console.log(`HTML Saved to temp storage: ${result.fileName} (ID: ${result.id})`)
          alert(`HTML已保存到浏览器临时存储中！\n文件名: ${result.fileName}\n文件ID: ${result.id}\n大小: ${result.size} bytes\n时间: ${new Date(result.timestamp).toLocaleString()}`)
        } else {
          // 如果临时存储失败，显示错误信息并提示用户使用文件夹保存
          if (result.error === 'storage_error') {
            console.warn('Browser temp storage failed, falling back to folder save')
            alert('浏览器临时存储不可用，将尝试使用文件夹保存')
            
            // 回退到文件夹保存方式
            const folderResult = await fIo.saveToFolder(
              chartHelper.getHtml(this.state),
              queryFileName,
              'text/html'
            )
            
            if (folderResult.success) {
              console.log(`HTML Saved to folder: ${folderResult.fileName} in folder ${folderResult.folderName}`)
              alert(`HTML保存成功！\n文件: ${folderResult.fileName}\n文件夹: ${folderResult.folderName}`)
            } else {
              // 文件夹保存也失败，使用下载方式
              console.warn('Folder save failed, falling back to download')
              alert('文件夹保存失败，将使用下载方式保存文件')
              await fIo.exportToFile(
                chartHelper.getHtml(this.state),
                `${queryFileName}.html`,
                'text/html'
              )
            }
          } else {
            // 其他错误
            console.error('Save failed:', result.message)
            alert(`保存失败: ${result.message}`)
          }
        }
      } catch (error) {
        console.error('Save as HTML failed:', error)
        // 如果发生意外错误，使用下载方式作为最后的保障
        alert('保存过程中发生错误，将使用下载方式保存文件')
        await fIo.exportToFile(
          chartHelper.getHtml(this.state),
          'chart.html',
          'text/html'
        )
      }
    },
    
    generateFileNameFromQuery() {
      // 优先使用当前tab对应的inquiry的name字段
      let queryName = 'chart';
      
      // 方法1: 通过store获取当前tab的inquiry名称
      if (this.$store && this.$store.state && this.$store.state.currentTabId) {
        const currentTabId = this.$store.state.currentTabId;
        const currentTab = this.$store.state.tabs.find(tab => tab.id === currentTabId);
        
        if (currentTab) {
          // 如果tab有name字段，直接使用
          if (currentTab.name && currentTab.name.trim() !== '') {
            queryName = currentTab.name;
          }
          // 如果tab没有name但有isSaved=true，尝试从inquiries中查找对应的name
          else if (currentTab.isSaved) {
            // 查找与当前tab相关的inquiry
            const relatedInquiry = this.$store.state.inquiries.find(inquiry => 
              inquiry.id === currentTab.id || inquiry.query === currentTab.query
            );
            
            if (relatedInquiry && relatedInquiry.name && relatedInquiry.name.trim() !== '') {
              queryName = relatedInquiry.name;
            }
          }
        }
      }
      
      // 方法2: 通过父组件获取tab的name
      if ((!queryName || queryName === 'chart') && this.$parent && this.$parent.tab) {
        if (this.$parent.tab.name && this.$parent.tab.name.trim() !== '') {
          queryName = this.$parent.tab.name;
        }
      }
      
      // 清理名称并生成文件名
      const cleanName = queryName.trim()
        .replace(/[^a-zA-Z0-9\s.-]/g, ' ')  // 保留字母、数字、空格、点和横线
        .replace(/\s+/g, '_')               // 将空格替换为下划线
        .toLowerCase()                       // 转换为小写
        .substring(0, 30);                  // 限制长度
      
      // 如果清理后的名称为空，使用默认名称
      if (cleanName === '') {
        return 'chart';
      }
      
      // 生成最终文件名："查询名称_时间戳"
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      return `${cleanName}_${timestamp}`;
    },
    prepareCopy(type = 'png') {
      return chartHelper.getImageDataUrl(this.$refs.plotlyEditor.$el, type)
    }
  }
}
</script>

<style scoped>
.chart-container {
  height: 100%;
}

.chart-warning {
  height: 40px;
  line-height: 40px;
  border-bottom: 1px solid var(--color-border);
  box-sizing: border-box;
}

.chart {
  min-height: 242px;
}

:deep(.editor_controls .sidebar__item:before) {
  width: 0;
}
</style>
