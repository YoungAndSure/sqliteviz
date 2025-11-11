# Excel 文件支持功能说明

## 📋 功能概述

现在 sqliteviz 已经支持导入 Excel 文件（`.xlsx` 和 `.xls` 格式），与 CSV/JSON 文件一样，可以将 Excel 数据导入到 SQLite 数据库中进行可视化分析。

## 🎯 实现细节

### 新增/修改的文件

1. **新建文件：`src/lib/excel.js`**
   - Excel 文件解析模块
   - 使用 `xlsx` (SheetJS) 库
   - 提供 `parse()` 和 `serialize()` 方法

2. **修改文件：`src/lib/utils/fileIo.js`**
   - 新增 `isExcel()` 方法检测 Excel 文件类型

3. **修改文件：`src/components/DbUploader.vue`**
   - 支持拖拽/选择 Excel 文件
   - 更新文件类型过滤器

4. **修改文件：`src/views/MainView/Workspace/Schema/index.vue`**
   - Schema 页面支持添加 Excel 表

5. **修改文件：`src/components/CsvJsonImport/index.vue`**
   - 导入对话框支持 Excel 文件
   - 显示工作表信息
   - 隐藏 Excel 不需要的选项（分隔符等）

## 🔧 技术实现

### Excel 解析流程

```javascript
// 1. 使用 FileReader 读取文件
reader.readAsArrayBuffer(file)

// 2. 使用 xlsx 库解析
const workbook = XLSX.read(data, { type: 'array' })
const worksheet = workbook.Sheets[sheetName]
const jsonData = XLSX.utils.sheet_to_json(worksheet)

// 3. 转换为列式存储格式（与 CSV 一致）
{
  columns: ['name', 'age', 'city'],
  values: {
    name: ['Alice', 'Bob'],
    age: [25, 30],
    city: ['NYC', 'LA']
  }
}
```

### 数据类型处理

- **数字**: 自动识别并转换为 `REAL` 类型
- **文本**: 转换为 `TEXT` 类型
- **日期**: 转换为 ISO 格式字符串
- **布尔**: 转换为 `INTEGER` 类型

## 🚀 使用方式

### 方式一：首次加载

1. 打开应用后，直接拖拽 Excel 文件到上传区域
2. 或点击上传区域选择 Excel 文件（`.xlsx` 或 `.xls`）
3. 自动弹出导入对话框，显示预览数据
4. 设置表名后点击 "Import"

### 方式二：添加新表

1. 在 Workspace 的 Schema 面板中
2. 点击 "Add table" 图标（➕）
3. 选择 Excel 文件
4. 设置表名后导入

## 📊 支持的功能

✅ **已支持**:
- 解析 `.xlsx` 和 `.xls` 文件
- 自动检测数据类型
- 使用第一行作为列名
- 显示工作表信息
- 预览前 3 行数据
- 批量导入（1500 行/批次）
- 进度显示

⚠️ **当前限制**:
- 只读取第一个工作表（未来可扩展为选择工作表）
- 不支持公式计算（只读取值）
- 不保留格式和样式
- 合并单元格会被展开

## 🔮 未来扩展

### 可选功能（需要时实现）

1. **工作表选择器**
   - 在导入对话框添加下拉菜单
   - 允许用户选择要导入的工作表

2. **多工作表导入**
   - 一次性导入多个工作表为多个表

3. **导出为 Excel**
   - 在 RunResult 组件添加 "Export to Excel" 按钮
   - 使用 `excel.serialize()` 方法

## 🧪 测试建议

创建一个测试 Excel 文件（`test.xlsx`）包含：

```
| name    | age | city     | salary  |
|---------|-----|----------|---------|
| Alice   | 25  | New York | 75000.5 |
| Bob     | 30  | London   | 85000   |
| Charlie | 35  | Tokyo    | 95000.5 |
```

**测试步骤**:
1. 拖拽文件到应用
2. 检查预览是否正确显示 3 行数据
3. 导入到数据库
4. 运行 SQL 查询: `SELECT * FROM test`
5. 创建图表验证数据可视化

## 📦 依赖

```json
{
  "dependencies": {
    "xlsx": "^0.18.5"  // SheetJS 社区版
  }
}
```

## 💡 实现亮点

1. **最小化代码改动**: 复用了现有的 CSV/JSON 导入流程
2. **统一的数据格式**: 转换为与 CSV 相同的列式存储格式
3. **渐进式增强**: Excel 特有功能（如工作表信息）可选显示
4. **类型安全**: 自动检测并转换数据类型
5. **性能优化**: 使用 FileReader API 和分块导入

## 🐛 故障排查

### 常见问题

**Q: 导入后数字变成了文本？**
A: 检查 Excel 单元格格式，确保是数字格式而非文本格式。

**Q: 日期显示为序列号？**
A: Excel 日期会被转换为 ISO 格式字符串，如需原始格式可修改 `excel.js` 的日期处理逻辑。

**Q: 中文列名导入失败？**
A: 检查 Excel 文件编码，建议使用 UTF-8 编码保存。

**Q: 只显示第一个工作表？**
A: 当前版本只导入第一个工作表，如需选择请参考"未来扩展"章节实现工作表选择器。
