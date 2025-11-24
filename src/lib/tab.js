import { nanoid } from 'nanoid'
import time from '@/lib/utils/time'
import events from '@/lib/utils/events'
import pythonSqlRunner from '@/lib/pythonSqlRunner'

export default class Tab {
  constructor(state, inquiry = {}) {
    this.id = inquiry.id || nanoid()
    this.name = inquiry.id ? inquiry.name : null
    this.tempName =
      inquiry.name ||
      (state.untitledLastIndex
        ? `Untitled ${state.untitledLastIndex}`
        : 'Untitled')
    this.query = inquiry.query
    this.viewOptions = inquiry.viewOptions || undefined
    this.isPredefined = inquiry.isPredefined
    this.viewType = inquiry.viewType || 'chart'
    this.result = null
    this.isGettingResults = false
    this.error = null
    this.time = 0
    this.layout = inquiry.layout || {
      sqlEditor: 'bottom',
      table: 'hidden',
      dataView: 'above'
    }
    this.maximize = inquiry.maximize

    this.isSaved = !!inquiry.id
    this.state = state
    this.updatedAt = inquiry.updatedAt
  }

  async execute() {
    this.isGettingResults = true
    this.result = null
    this.error = null
    const db = this.state.db
    const sql = (this.query || '').trim()

    if (!sql) {
      this.isGettingResults = false
      return
    }

    try {
      const start = new Date()
      let result

      if (sql.toLowerCase().startsWith('select')) {
        const buffer = await db.exportRaw()
        result = await pythonSqlRunner.runSql(sql, buffer)
      } else {
        result = await db.execute(sql + ';')
        await db.refreshSchema()
      }

      this.result = result
      this.time = time.getPeriod(start, new Date())

      if (this.result && this.result.values && this.result.columns) {
        const firstCol = this.result.columns[0]
        const values = this.result.values[firstCol] || []
        events.send('resultset.create', values.length)
      }

      events.send('query.run', parseFloat(this.time), { status: 'success' })
    } catch (err) {
      this.error = {
        type: 'error',
        message: err
      }

      events.send('query.run', 0, { status: 'error' })
    }

    this.isGettingResults = false
  }
}
