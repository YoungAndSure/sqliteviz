# sqliteviz 流水分析改造开发方案（design3）

本文基于 `doc/design2.md` 的产品设计，并结合当前 sqliteviz 源码结构，给出一份可执行的开发方案，重点说明：
- 需要新增/改造的功能与模块；
- 具体改动点（涉及的文件/目录）；
- 建议的实现步骤与迭代顺序。

## 0. 现有架构简要回顾

仅列与本次改造强相关的部分：

- 路由与整体框架：
  - `src/main.js`：创建 Vue 3 应用，挂载 `App.vue`，引入 `router`、`store`、样式和 `vue-final-modal`。
  - `src/router.js`：
    - `"/" -> Welcome`：初始欢迎页，包含 `DbUploader`，可上传数据库/CSV/JSON/Excel。
    - `"/" -> MainView`：主框架，子路由：
      - `"/workspace" -> Workspace`：当前 SQL 编辑 + 图表/透视表工作区。
      - `"/inquiries" -> Inquiries`：已保存查询列表页面。
    - `"/load" -> LoadView`：用于从 URL 加载共享数据/查询。
    - `beforeEach`：若 `store.state.db` 为空则通过 `database.getNewDatabase()` 创建空数据库并加载。

- 主页与导航：
  - `src/App.vue`：负责从 `storedInquiries` 将查询读入 Vuex，并在 `inquiries` 变化时持久化到 localStorage。
  - `src/views/MainView/index.vue`：主布局，包含 `MainMenu` 和子路由区域（keep-alive `Workspace` 和 `Inquiries`）。
  - `src/views/MainView/MainMenu.vue`：顶部导航，当前导航项：`Workspace` / `Inquiries` / Help；右侧按钮：`Save / Save as / Create` 对当前 SQL Tab 操作。

- 数据库与执行：
  - `src/lib/database/index.js`：
    - `getNewDatabase()`：创建基于 Web Worker 的 `Database` 实例。
    - `Database` 核心能力：
      - `loadDb(file?)`：打开 SQLite 文件或创建空库，并调用 `refreshSchema()`。
      - `addTableFromCsv(tabName, data, progressCounterId)`：将 CSV/JSON/Excel 解析结果写入 SQLite（使用 `_worker.js` + `_sql.js`）。
      - `execute(sql)`：通过 worker 执行 SQL，返回 `{ columns, values }` 结构。
      - `validateTableName()`、`sanitizeTableName()` 等校验工具。
  - `src/lib/database/_sql.js`：封装 sql.js，`exec(sql)` 返回 `[{ columns, values: { col -> [val...] } }, ...]`。

- 导入与文件解析：
  - `src/components/DbUploader.vue`：
    - Welcome 页中的导入组件，支持 `.db/.sqlite/.csv/.json/.ndjson/.xlsx/.xls`：
      - 数据库文件：直接 `loadDb(file)`。
      - CSV/JSON/Excel：弹出 `CsvJsonImport` 对话框，预览并导入为新表。
  - `src/components/CsvJsonImport/index.vue`：
    - 使用 `csv` / `excel` / JSON 解析文件，展示预览表格 `SqlTable`。
    - 调用 `db.addTableFromCsv(tableName, parsedData, progressCounterId)` 写入数据库。
    - 导入完成后自动创建新 Tab，将示例 SQL（`SELECT * FROM "导入表"`）填入。
  - `src/lib/utils/fileIo.js`：文件类型判断（`isJSON/isNDJSON/isExcel/isDatabase`）、读取、导出等。

- SQL 编辑与图表：
  - `src/views/MainView/Workspace/index.vue`：左侧 Schema 右侧 Tabs，首次进入空数据库时自动创建一条示例 SQL Tab。
  - `src/views/MainView/Workspace/Tabs/index.vue`：Tab 列表与关闭逻辑，依赖 Vuex `tabs/currentTabId`。
  - `src/views/MainView/Workspace/Tabs/Tab/SqlEditor/index.vue`：基于 CodeMirror 的 SQL 编辑器，`Run` 按钮触发当前 Tab 的查询执行。
  - `src/views/MainView/Workspace/Tabs/Tab/DataView/index.vue`：结果可视化区域，支持 `Chart`（Plotly）与 `Pivot` 两种模式。
  - `src/views/MainView/Workspace/Tabs/Tab/DataView/Chart/index.vue`：
    - `PlotlyEditor`（React + veaury）构建可交互图表，支持配置、导出 PNG/SVG/HTML、复制到剪贴板。
    - 使用 `chartHelper.getOptionsFromDataSources()` 等工具。

- 查询保存与持久化：
  - Vuex：
    - `src/store/state.js`：包含 `tabs/currentTab/currentTabId/inquiries/db/isWorkspaceVisible` 等。
    - `src/store/actions.js`：`addTab/saveInquiry` 等逻辑，使用 `Tab` 类与 `nanoid` 生成 id。
    - `src/store/mutations.js`：更新 Tab、切换当前 Tab、设置 `db` 等。
  - `src/lib/storedInquiries/index.js`：
    - 使用 localStorage 以 `myInquiries` key 保存查询列表（支持迁移、导入/导出）；
    - 每条 inquiry 已包含：`id/query/viewType/viewOptions/name/createdAt/updatedAt`；
    - 这与 design2 中的 `chart_configs` 模型高度重合，可直接作为图表配置存储复用。

## 1. 总体改造思路（对 design2 的落地调整）

在不推翻现有架构的前提下，实现 design2 的三大能力：
- 多格式流水导入（CSV/XLSX/PDF），并标准化为 `transactions`、`import_batches` 业务表；
- SQL + 可视化编辑（沿用当前 Workspace + Plotly）；
- Dashboard 卡片展示（基于已保存 inquiry）。

关键策略：
- 优先复用：
  - 导入流程：保持 `DbUploader + CsvJsonImport` 为通用导入入口，新增“流水模式”解析与表结构标准化；
  - 图表配置：沿用 `storedInquiries` 作为 `chart_configs`，避免重复造轮子；
  - SQL 编辑与图表：沿用现有 Workspace、Tab、DataView、Chart 实现。
- 渐进增强：
  - 第一阶段只支持 CSV/XLSX 的流水模板解析，PDF 后置；
  - 先实现 Dashboard 基于现有 inquiries 的卡片展示，再引入全局时间过滤和 SQL 参数化。

## 2. 路由与导航改造

### 2.1 新增 Dashboard 路由

目标：实现 design2 中的第三个页卡“Dashboard 展示页”，并在有数据/有图表时作为默认首页。

待完成功能：
- 新页面 `Dashboard`：网格显示已保存 inquiry 对应的图表卡片，可刷新/编辑/删除。
- 启动时根据“是否已导入数据 & 是否有图表”决定跳转到 `Welcome` 还是 `Dashboard`。

改动点：
- `src/router.js`
- `src/views/MainView/MainMenu.vue`
- 新增 `src/views/MainView/Dashboard/index.vue`

改动方案：
1. 在 `router.js` 中：
   - 在 `MainView` 的 `children` 中新增：
     - `path: '/dashboard', name: 'Dashboard', component: Dashboard`。
   - 引入新组件：`import Dashboard from '@/views/MainView/Dashboard'`。

2. 首页跳转策略：
   - 增加一个“启动路由守卫”或在 `App.vue`/`MainView` 的 `created` 中：
     - 通过本地存储判断：
       - 若存在“已导入数据库”的标记（见第 4 节）且 `storedInquiries.getStoredInquiries().length > 0`，则将访问根路径 `"/#/"` 时重定向至 `/dashboard`；
       - 否则保持现状：根路径进入 `Welcome`。
   - 方案示例：
     - 在 `router.js` 中为 `Welcome` 添加 `beforeEnter` 钩子，读取本地标记决定是否 `next('/dashboard')`。

3. 更新导航：
   - 在 `MainMenu.vue` 中：
     - 在 `Workspace` 与 `Inquiries` 之间插入 `Dashboard` 链接：`<router-link to="/dashboard">Dashboard</router-link>`；
     - 可选择将 `Create` 按钮在 `/dashboard` 下也可用（点击后跳转到 `/workspace` 并创建新 Tab）。

## 3. 导入页与导入流程改造

design2 的“导入页（Import）”与现有 `Welcome + DbUploader + CsvJsonImport` 功能高度重合，本节在此基础上增强以支持：
- 自动识别流水文件（微信/支付宝/银行）并映射到统一 `transactions` 表；
- 支持 PDF；
- 导入完成后自动生成默认图表并跳转到 SQL 编辑页或 Dashboard。

### 3.1 Welcome / DbUploader 行为调整

待完成功能：
- 更突出“导入流水文件”的入口文案；
- 接受 PDF 文件；
- 导入成功后记录“已导入数据”的持久化标记（供启动逻辑使用）。

改动点：
- `src/views/Welcome.vue`
- `src/components/DbUploader.vue`
- `src/lib/utils/fileIo.js`

改动方案：
1. `Welcome.vue`：
   - 保持现有布局（`DbUploader type="illustrated"`）。
   - 调整说明文案：强调支持微信/支付宝/银行流水 PDF/XLSX/CSV，且数据仅存本地。

2. `DbUploader.vue`：
   - `browse()` 时的 `accept` 类型增加 PDF：
     - 从 `'.db,.sqlite,.sqlite3,.csv,.json,.ndjson,.xlsx,.xls'`
     - 扩展为 `'.db,.sqlite,.sqlite3,.csv,.json,.ndjson,.xlsx,.xls,.pdf'`。
   - 在 `checkFile(file)` 中：
     - 新增 `const isPdf = fIo.isPDF(file)`（需在 `fileIo` 中实现）；
     - 若 `isPdf` 或“可判定为流水文件格式”（见 3.2）：调用新的“流水导入流程”（见 3.3），而非通用 `CsvJsonImport`；
     - 导入成功后：
       - 通过新工具函数写入本地 `hasImportedData = true`；
       - 仍然 `setDb(newDb)` 并跳转到 `/workspace` 或 `/dashboard`（可通过参数控制：首次导入后跳转 `/query` / `/workspace`，后续导入可仅刷新 Dashboard）。

3. `fileIo.js`：
   - 新增 `isPDF(file)` 方法：
     - 通过 `file.type === 'application/pdf'` 或 `.pdf` 扩展名判断。

### 3.2 流水文件识别方案

待完成功能：
- 根据文件名/内容大致判断来源（微信、支付宝、银行类型、通用 CSV 等）。

改动点：
- 新增 `src/lib/parsers/detector.js`（或类似命名）。

改动方案：
- 实现统一的检测工具 `detectStatementType(file)`：
  - 输入：`File` 对象（或已读取的文本）。
  - 输出：`{ sourceType, format }`，例如：
    - `sourceType: 'wechat_pdf' | 'alipay_csv' | 'bank_ccb_pdf' | 'generic_csv'`；
    - `format: 'pdf' | 'csv' | 'xlsx'`。
- 检测策略：
  - PDF：
    - 使用 pdf.js 解析前若干页的文本；
    - 匹配典型关键字：
      - 微信：`微信支付账单`、`微信支付` 等；
      - 支付宝：`支付宝交易记录` 等；
      - 银行：`对账单`、`交易明细` + 银行名称。
  - CSV/XLSX：
    - 解析前几行，通过表头关键字（日期/交易时间/金额/收入/支出/对方账户/摘要）识别来源；
    - 不识别时默认为 `generic_csv/xlsx`。

### 3.3 流水文件解析与标准化

待完成功能：
- 对识别出的流水文件解析成统一中间结构 `ParsedTransaction[]` 并写入 `transactions/import_batches` 表。

改动点：
- 新增解析模块目录，例如：`src/lib/parsers/statements/`：
  - `wechatPdfParser.js`
  - `alipayCsvParser.js`
  - `bankXXXParser.js`（按需扩展）
  - `genericCsvStatementParser.js`
- 新增统一调度服务：`src/lib/parserService.js`。

改动方案：
1. 定义统一中间结构：
   - 在 `parserService.js` 中定义：
     - `ParsedTransaction = { tradeTime, amount, direction, currency, merchant, remark, accountType, batchId }`。

2. 各解析器职责：
   - 输入：`File` 或已解析的文本/表格数据；
   - 输出：`{ transactions: ParsedTransaction[], meta: { sourceType, recordCount } }`。
   - 示例：
     - `wechatPdfParser.parse(file)`：
       - 使用 pdf.js 提取文本 -> 按行正则匹配“时间 / 交易类型 / 金额 / 对方账户 / 备注”等；
       - 组装 `ParsedTransaction[]`，`accountType = 'wechat'`。
     - `alipayCsvParser.parse(file)`：
       - 可先复用 `csv.parse` 或 `excel.parse` 得到通用 `{ columns, values }`，再按列名映射到标准字段。

3. 写入 SQLite：
   - 在 `parserService.js` 中实现：`async importTransactions(db, parsedResult)`：
     - 若首次导入：
       - 执行一次 `CREATE TABLE IF NOT EXISTS transactions (...)` 与 `import_batches (...)`（见第 4 节具体结构）；
     - 插入 `import_batches`：生成 `batch_id`（如 `nanoid()`），写入来源、文件名、时间、条数；
     - 按批次插入 `transactions`：
       - 可复用 `Database.execute('BEGIN; INSERT ...; COMMIT;')`，或仿照 `_statements.js` 中 `generateChunks` 思路分批插入。

4. 与 DbUploader 集成：
   - 在 `DbUploader.checkFile(file)` 中：
     - 调用 `detectStatementType(file)`；
     - 若识别为流水文件：
       - 使用 `parserService.parseAndImport(db, file)` 完成解析与入库；
       - 导入成功后：
         - 记录导入批次信息到本地（可选，用于导入历史 UI）；
         - 自动生成一组默认 inquiries（见第 5 节）；
         - 跳转至 `/workspace` 或 `/dashboard`。
     - 若未识别为流水文件：继续使用现有 CSV/JSON/Excel 通用导入流程（`CsvJsonImport`）。

## 4. 业务表与数据库持久化

### 4.1 `transactions` / `import_batches` 表结构落地

待完成功能：
- 在 SQLite 数据库中建立标准业务表，以便 SQL 分析。

改动点：
- 不需修改 `Database` 类接口，只需通过 `Database.execute()` 执行建表语句。
- 在 `parserService.importTransactions` 或单独的 `schemaService` 模块中集中管理。

建议结构（与 design2 对齐，可根据实际字段适度微调）：
- `transactions`：
  - `id INTEGER PRIMARY KEY`（自增）
  - `batch_id TEXT`
  - `account_type TEXT`（微信/支付宝/银行名）
  - `trade_time TEXT`（ISO 字符串）
  - `amount REAL`（收入正、支出负）
  - `currency TEXT`
  - `direction TEXT`（income/expense）
  - `merchant TEXT`
  - `category TEXT`
  - `remark TEXT`
- `import_batches`：
  - `batch_id TEXT PRIMARY KEY`
  - `source_type TEXT`（wechat/alipay/bank_xxx/custom_csv）
  - `file_name TEXT`
  - `import_time TEXT`
  - `record_count INTEGER`

实现方案：
- 新增 `schemaService.js`：
  - `ensureTransactionsSchema(db)`：
    - 通过 `Database.execute('CREATE TABLE IF NOT EXISTS ...')` 创建上述两表；
    - 可先查询 `sqlite_master` 判断是否已存在。
- 在每次流水导入前调用一次 `ensureTransactionsSchema(db)`。

### 4.2 SQLite 持久化到 IndexedDB（可选增强）

design2 希望“导入的文件、解析出的数据、数据库文件、编写的 SQL 都保存在浏览器本地，下次打开直达 Dashboard”。

目前现状：
- SQLite 数据库仅存在于内存（Web Worker 中），不会自动持久化；
- 用户查询（inquiries）已通过 localStorage 持久化，但数据库内容需要用户手动导出/导入。

待完成功能：
- 支持将当前 SQLite 数据库自动持久化到 IndexedDB；
- 页面加载时，如果有最近一次数据库快照，则自动加载。

改动点（建议新模块，避免影响主逻辑）：
- 新增 `src/lib/dbPersistence/index.js`：
  - `saveDb(db)`：调用 `Database.pw.postMessage({ action: 'export' })` 获取二进制，再写入 IndexedDB；
  - `loadLastDb()`：从 IndexedDB 读取最近一次快照，返回 ArrayBuffer 供 `Database.loadDb` 使用；
  - 内部维护简单的版本信息与时间戳。
- 在 `App.vue` 或 `router.beforeEach` 中接入：
  - 若 `hasImportedData` 标记存在，则尝试通过 `dbPersistence.loadLastDb()` 恢复数据库，而不是创建全新空库。
- 在导入成功、手动导入数据库、手动导出前后：
  - 调用 `dbPersistence.saveDb()` 以异步保存快照。

该部分工作量较大，可放在第二阶段迭代实施。

## 5. SQL 模板与图表配置（复用 inquiries）

design2 期望：
- 系统内置 SQL 模板；
- 用户可保存自己的 SQL 模板与图表配置；
- Dashboard 基于这些配置展示卡片。

目前现状：
- `storedInquiries` 已支持：
  - 预设查询 `inquiries.json`（通过 `readPredefinedInquiries()` 读取）；
  - 用户自定义查询，字段包含 `query/viewType/viewOptions/name` 等。
- Workspace 中每个 Tab 都可以保存为 inquiry，已包含图表配置（`viewOptions` 来自 `DataView.getOptionsForSave()`）。

改造方案：
1. 将 design2 的 `chart_configs` 映射为现有 `inquiries`：
   - 不新增单独的 IndexedDB 配置库，直接使用 localStorage 的 `myInquiries`。
   - 一条 inquiry 即一个“图表卡片配置”。

2. 新增/调整预设模板：
   - 编辑 `inquiries.json`（或相关迁移脚本）：
     - 增加针对 `transactions` 表的 SQL 模板，例如：
       - 月度每日支出趋势：按天聚合 `direction='expense'`。
       - 月度每日收入趋势。
       - 分类支出占比：对 `category` 分组。
     - 为每条模板配置合理的 `viewType='chart'` 与 `viewOptions`（可先在 UI 内手动调试好再导出 JSON）。

3. 导入完成后的默认行为：
   - 在流水导入成功后（parserService 中）：
     - 自动打开至少一个预设模板（如“最近 30 天支出趋势”）对应的 Tab，或者
     - 自动在 Dashboard 中新增若干卡片（其实 inquiries 已存在，只需刷新 Dashboard）。

4. 区分“模板列表”和“Dashboard 卡片”：
   - 在 SQL 编辑页（Workspace）中：
     - 继续通过 `Inquiries` 页面浏览/选取模板，或在 Workspace 中提供模板选择下拉（可选增强）。
   - 在 Dashboard 中：
     - 简单展示所有 `viewType === 'chart'` 且关联 `transactions` 表的 inquiries。
     - 后续可增加分组字段（在 inquiry 对象中扩展 `group` 字段），但首期可仅支持按名称排序。

## 6. Dashboard 页面实现

待完成功能：
- 网格形式展示每个 inquiry 对应的图表卡片；
- 支持：
  - 刷新单个卡片（重新执行 SQL）；
  - 编辑卡片（跳转到 Workspace 并打开对应 Tab）；
  - 删除卡片（删除 inquiry 并更新本地存储）。

改动点：
- 新增 `src/views/MainView/Dashboard/index.vue`；
- 复用：
  - 当前的 SQL 执行逻辑（`Database.execute`）；
  - 当前的图表组件（可直接复用 `DataView/Chart` 逻辑的子集）。

实现方案：
1. 数据源：
   - 在 Dashboard 组件的 `computed` 中：
     - 从 `this.$store.state.inquiries` 读取所有用户/内置查询；
     - 过滤出 `viewType === 'chart'` 的项；
     - 可进一步过滤仅包含 `FROM transactions` 的查询作为“流水 Dashboard”。

2. 卡片结构：
   - 布局：简易响应式网格（CSS Grid/Flex）；
   - 每个卡片包含：
     - 标题（inquiry.name）；
     - 最新执行时间（可在本组件中缓存）；
     - 一个只读图表视图：
       - 读取 inquiry.viewOptions 作为 Plotly 状态；
       - 使用 `chartHelper.getOptionsFromDataSources` / `Chart` 组件渲染；
       - 为性能考虑，可以自定义精简版图表组件，仅渲染 Plotly，不展示复杂 PlotlyEditor UI。
     - 操作按钮：
       - `刷新`：重新执行 `inquiry.query`，更新数据源；
       - `编辑`：调用 `store.dispatch('addTab', inquiry)` 然后 `setCurrentTabId` 并跳转 `/workspace`；
       - `删除`：调用 `store.dispatch('deleteInquiries', new Set([inquiry.id]))` 并同步本地存储（App.vue 已通过 watch 实现）。

3. SQL 执行：
   - 在 Dashboard 组件中，提供方法 `async runInquiry(inquiry)`：
     - 使用 `this.$store.state.db.execute(inquiry.query)` 获取最新结果；
     - 将 `{ columns, values }` 转换为 `dataSources` 结构，传给子图表组件；
     - 处理错误提示（卡片内展示错误信息）。

4. 性能与懒加载：
   - 避免一次性执行所有 inquiry 的 SQL：
     - 初次只执行首屏可见卡片（可用 `IntersectionObserver` 或简单限制前 N 个）；
     - 滚动到卡片时再执行其 SQL。

## 7. SQL 参数化与全局时间过滤

待完成功能：
- Dashboard 顶部提供“时间范围”全局筛选；
- 用户在 SQL 中可书写 `{{startDate}} / {{endDate}}` 等占位符。

改动点：
- 新增 SQL 参数替换工具：`src/lib/sqlTemplate.js`；
- Dashboard 组件 & Workspace 中执行 SQL 的位置。

实现方案：
1. SQL 模板替换工具：
   - `render(template, params)`：将形如 `{{param}}` 的占位符替换为带引号的 safe 值：
     - 例如 `{{startDate}}` -> `'2025-01-01'`；
     - 仅在值通过简单正则校验后替换，防止语法错误。

2. Dashboard：
   - 在顶部提供时间范围选择组件（可先使用简单的 `<select>` + 两个 `<input type="date">`）。
   - 在执行 inquiry.query 前：
     - 调用 `sqlTemplate.render(inquiry.query, { startDate, endDate })` 得到最终 SQL 再执行。

3. Workspace：
   - 首期可不在 Workspace 中自动注入参数，由用户直接写死时间范围；
   - 后续可在 Workspace 页中提供类似控制器，将变量也注入到当前 Tab 的执行中（高级特性）。

## 8. 隐私与数据清除

待完成功能：
- 明确告知“数据仅存本地”；
- 提供一键清除本地数据（SQLite + inquiries + 临时文件）。

改动点：
- `Welcome.vue` 文案；
- 新增“清除数据”入口（可放在 MainMenu 中或 Dashboard 中）；
- `dbPersistence`、`storedInquiries` 和临时文件 IndexedDB 清理逻辑。

实现方案：
1. 文案：
   - 在 `Welcome.vue`、Dashboard 顶部增加简短说明：“所有数据仅保存在本地浏览器中，不会上传到任何服务器。”

2. 清除数据按钮：
   - 新增例如 `Clear Data` 菜单项：
     - 清空：
       - `storedInquiries.updateStorage([])`；
       - 若实现了 DB IndexedDB 持久化，则删除对应数据库；
       - 若需要，也可清理 `sqliteviz_temp_files` 数据库中临时 HTML 文件；
       - 重置 `hasImportedData` 标记；
     - 刷新应用或重定向到 `Welcome`。

## 9. 性能与限制策略

按照 design2 建议，结合现有实现注意：
- 文件大小限制：
  - 在 `DbUploader.checkFile` 中根据 `file.size` 判断，超过阈值（如 20–50MB）时先弹出提示再继续；
- 分批写入：
  - 复用 `_statements.generateChunks` 与 `Database.import` 的思路，将流水入库改为分批事务提交；
- 查询结果限制：
  - 目前 Tab 的执行逻辑中已有分页/限制机制（需在 `Tab` 类中确认并沿用）；
  - Dashboard 执行查询时也应限制返回行数，例如建议模板中默认 `LIMIT 2000`。

## 10. 迭代拆分建议

建议按以下阶段实施，降低一次性改动风险：

- 第一阶段（MVP）：
  - 路由与导航：新增 `/dashboard` 及 Dashboard 页面（基于现有 inquiries，先不做时间过滤）。
  - 导入增强：
    - `DbUploader` 支持 PDF 文件（先仅识别，不一定马上实现解析）；
    - 基于 CSV/XLSX 的流水解析（`transactions/import_batches`，仅支持少量模板，如微信/支付宝 CSV 导出）。
  - SQL 模板：
    - 为 `transactions` 增加数条预设 inquiry。

- 第二阶段：
  - 实现 PDF 解析（微信/支付宝/一两家主流银行），并接入流水标准化；
  - Dashboard 增加全局时间筛选与 SQL 参数化；
  - 数据库自动持久化到 IndexedDB，实现“下次打开直接进入 Dashboard”。

- 第三阶段及以后：
  - 扩展更多银行模板；
  - Dashboard 卡片的布局拖拽、分组等；
  - 更丰富的分类与规则（自动根据商户/备注打标签），在 `transactions.category` 中填充。

---

本方案在 design2 的产品思路上，尽量与现有 sqliteviz 架构贴合，优先复用 DbUploader/CsvJsonImport/Workspace/Chart/storedInquiries 等成熟模块，同时给出了具体文件级改动点和迭代顺序，可直接用于拆分开发任务与评估工作量。