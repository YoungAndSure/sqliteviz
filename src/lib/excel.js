import XLSX from 'xlsx'

export default {
  /**
   * 解析 Excel 文件
   * @param {File} file - Excel 文件对象
   * @param {Object} config - 配置选项
   * @param {string} config.sheetName - 要读取的工作表名称（可选，默认第一个）
   * @param {boolean} config.header - 是否使用第一行作为列名（默认 true）
   * @param {number} config.preview - 预览行数（0 表示全部）
   * @returns {Promise} 解析结果
   */
  parse(file, config = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })

          // 获取要读取的工作表
          const sheetName = config.sheetName || workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]

          if (!worksheet) {
            reject(new Error(`Sheet "${sheetName}" not found`))
            return
          }

          // 转换为 JSON 格式
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: config.header !== false ? 1 : undefined,
            defval: null, // 空单元格默认值
            raw: false, // 不使用原始值，转换为字符串
          })

          // 如果数据为空
          if (jsonData.length === 0) {
            resolve({
              data: { columns: [], values: {} },
              hasErrors: false,
              messages: [],
              rowCount: 0,
              sheetNames: workbook.SheetNames,
              currentSheet: sheetName
            })
            return
          }

          // 提取列名
          let columns
          let rows
          
          if (config.header !== false) {
            // 使用第一行作为列名
            columns = Object.keys(jsonData[0])
            rows = jsonData
          } else {
            // 不使用表头，自动生成列名 col1, col2...
            const firstRow = jsonData[0]
            columns = Object.keys(firstRow).map((_, i) => `col${i + 1}`)
            rows = jsonData
          }

          // 转换为列式存储格式（与 CSV 解析器一致）
          const values = {}
          columns.forEach(col => {
            values[col] = rows.map(row => {
              const value = row[col]
              // 处理日期类型
              if (value instanceof Date) {
                return value.toISOString()
              }
              // 处理数字类型
              if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
                return parseFloat(value)
              }
              return value
            })
          })

          // 如果是预览模式，只返回指定行数
          let previewData = { columns, values }
          const totalRows = rows.length
          
          if (config.preview && config.preview > 0) {
            const previewValues = {}
            columns.forEach(col => {
              previewValues[col] = values[col].slice(0, config.preview)
            })
            previewData = { columns, values: previewValues }
          }

          resolve({
            data: previewData,
            hasErrors: false,
            messages: [],
            rowCount: totalRows,
            sheetNames: workbook.SheetNames,
            currentSheet: sheetName
          })
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => {
        reader.abort()
        reject(new Error('Error reading Excel file'))
      }

      reader.readAsArrayBuffer(file)
    })
  },

  /**
   * 将结果集导出为 Excel 文件
   * @param {Object} resultSet - 查询结果集
   * @returns {ArrayBuffer} Excel 文件数据
   */
  serialize(resultSet) {
    const columns = resultSet.columns
    const rowCount = resultSet.values[columns[0]].length

    // 转换为行式数据
    const rows = []
    for (let i = 0; i < rowCount; i++) {
      const row = {}
      columns.forEach(col => {
        row[col] = resultSet.values[col][i]
      })
      rows.push(row)
    }

    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(rows)
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Result')

    // 生成 Excel 文件
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  }
}
