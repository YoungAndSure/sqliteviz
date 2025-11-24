import { nanoid } from 'nanoid'

async function ensureTransactionsSchema(db) {
  const createTransactionsSql = `
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      batch_id TEXT,
      account_type TEXT,
      trade_time TEXT,
      amount REAL,
      currency TEXT,
      direction TEXT,
      merchant TEXT,
      category TEXT,
      remark TEXT
    );
  `

  const createBatchesSql = `
    CREATE TABLE IF NOT EXISTS import_batches (
      batch_id TEXT PRIMARY KEY,
      source_type TEXT,
      file_name TEXT,
      import_time TEXT,
      record_count INTEGER
    );
  `

  await db.execute(createTransactionsSql)
  await db.execute(createBatchesSql)
}

function detectColumns(columns) {
  const lower = columns.map(c => (c || '').toString().toLowerCase())

  const findCol = keys => {
    return (
      columns[
        lower.findIndex(name =>
          keys.some(key => name.includes(key.toLowerCase()))
        )
      ] || null
    )
  }

  const timeCol = findCol(['交易时间', '时间', '日期', 'date', 'time'])
  const amountCol = findCol(['金额(元)', '金额', 'money', '金额（元）'])
  const directionCol = findCol(['收/支', '收支', '收支类型', '收付标志', 'direction'])
  const merchantCol = findCol(['交易对方', '对方', '商户', '商户名称', '对方账户'])
  const remarkCol = findCol(['商品', '商品名称', '备注', '摘要', '说明'])

  return {
    timeCol,
    amountCol,
    directionCol,
    merchantCol,
    remarkCol
  }
}

function buildTransactions(parsedData, fileName) {
  const { columns, values } = parsedData || {}
  if (!columns || columns.length === 0) return []

  const { timeCol, amountCol, directionCol, merchantCol, remarkCol } =
    detectColumns(columns)

  if (!timeCol || !amountCol) {
    return []
  }

  const rowCount = values[columns[0]].length
  const txns = []
  const lowerFileName = (fileName || '').toLowerCase()
  let accountType = 'unknown'
  if (lowerFileName.includes('wechat') || lowerFileName.includes('微信')) {
    accountType = 'wechat'
  } else if (
    lowerFileName.includes('alipay') ||
    lowerFileName.includes('支付宝')
  ) {
    accountType = 'alipay'
  } else if (
    lowerFileName.includes('bank') || lowerFileName.includes('银行')
  ) {
    accountType = 'bank'
  }

  for (let i = 0; i < rowCount; i++) {
    const rawAmount = values[amountCol][i]
    if (rawAmount == null || rawAmount === '') continue
    const amountNum = Number(rawAmount)
    if (Number.isNaN(amountNum) || amountNum === 0) continue

    const rawTime = timeCol ? values[timeCol][i] : null
    let tradeTime = rawTime
    try {
      if (rawTime) {
        const d = new Date(rawTime)
        if (!Number.isNaN(d.getTime())) {
          tradeTime = d.toISOString()
        }
      }
    } catch (_e) {}

    let direction = null
    if (directionCol) {
      const rawDir = (values[directionCol][i] || '').toString()
      if (/收入|收/i.test(rawDir)) direction = 'income'
      else if (/支出|付|扣/i.test(rawDir)) direction = 'expense'
    }
    if (!direction) {
      direction = amountNum >= 0 ? 'income' : 'expense'
    }

    const merchant = merchantCol ? values[merchantCol][i] : null
    const remark = remarkCol ? values[remarkCol][i] : null

    txns.push({
      accountType,
      tradeTime: tradeTime || null,
      amount: amountNum,
      currency: 'CNY',
      direction,
      merchant: merchant == null ? null : merchant,
      category: null,
      remark: remark == null ? null : remark
    })
  }

  return txns
}

function escapeString(value) {
  if (value == null) return 'NULL'
  const str = String(value).replace(/'/g, "''")
  return `'${str}'`
}

async function importTransactions(db, parsedData, fileName, sourceType) {
  const txns = buildTransactions(parsedData, fileName)
  if (!txns.length) return { imported: false, rowCount: 0 }

  await ensureTransactionsSchema(db)

  const batchId = nanoid()
  const importTime = new Date().toISOString()

  const batchSql = `INSERT INTO import_batches (batch_id, source_type, file_name, import_time, record_count)
    VALUES (${escapeString(batchId)}, ${escapeString(
    sourceType || 'statement'
  )}, ${escapeString(fileName || '')}, ${escapeString(
    importTime
  )}, ${txns.length});`
  await db.execute(batchSql)

  const chunkSize = 500
  for (let i = 0; i < txns.length; i += chunkSize) {
    const chunk = txns.slice(i, i + chunkSize)
    const valuesSql = chunk
      .map(t => {
        return `(${[
          escapeString(batchId),
          escapeString(t.accountType),
          escapeString(t.tradeTime),
          t.amount,
          escapeString(t.currency),
          escapeString(t.direction),
          escapeString(t.merchant),
          escapeString(t.category),
          escapeString(t.remark)
        ].join(', ')})`
      })
      .join(',')

    const insertSql = `INSERT INTO transactions (
      batch_id,
      account_type,
      trade_time,
      amount,
      currency,
      direction,
      merchant,
      category,
      remark
    ) VALUES ${valuesSql};`

    await db.execute(insertSql)
  }

  return { imported: true, rowCount: txns.length }
}

export default {
  ensureTransactionsSchema,
  importTransactions
}
