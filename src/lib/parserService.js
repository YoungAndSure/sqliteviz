import csvModule from '@/lib/csv'
import fIo from '@/lib/utils/fileIo'
import transactionsSchema from '@/lib/transactionsSchema'

function detectStatementFromColumns(columns) {
  const lower = columns.map(c => (c || '').toString().toLowerCase())

  const hasKeyword = (keys) =>
    lower.some(name => keys.some(key => name.includes(key.toLowerCase())))

  const hasTime = hasKeyword(['交易时间', '时间', '日期', 'date', 'time'])
  const hasAmount = hasKeyword(['金额(元)', '金额', 'money', '金额（元）'])

  if (hasTime && hasAmount) {
    return { isStatement: true, sourceType: 'statement' }
  }

  return { isStatement: false, sourceType: 'generic' }
}

async function parseFilePreview(file) {
  const config = {
    preview: 0,
    header: 1
  }

  if (fIo.isExcel(file)) {
    const excelModule = await import('@/lib/excel')
    return excelModule.default.parse(file, config)
  }

  return csvModule.parse(file, config)
}

/**
 * 尝试将文件识别为流水文件并导入到标准 transactions/import_batches 表。
 * 仅在识别成功且导入完成时返回 true，否则返回 false 以回退到通用导入流程。
 */
async function tryImportAsTransactions(db, file) {
  if (!file) return false
  if (fIo.isJSON(file) || fIo.isNDJSON(file)) return false
  if (fIo.isPDF(file)) return false

  let parseResult
  try {
    parseResult = await parseFilePreview(file)
  } catch (e) {
    console.error('parseFilePreview error', e)
    return false
  }

  const parsedData = parseResult && parseResult.data
  if (!parsedData || !parsedData.columns || parsedData.columns.length === 0) {
    return false
  }

  const detection = detectStatementFromColumns(parsedData.columns)
  if (!detection.isStatement) {
    return false
  }

  try {
    const res = await transactionsSchema.importTransactions(
      db,
      parsedData,
      file.name,
      detection.sourceType
    )
    return res.imported && res.rowCount > 0
  } catch (e) {
    console.error('importTransactions error', e)
    return false
  }
}

export default {
  tryImportAsTransactions
}
