# sqliteviz 流水分析改造详细设计方案（design2）

本文在 `doc/design.md` 的基础上，给出一份可落地实施的详细设计方案，指导前后迭代开发。

## 1. 产品目标与约束

- 目标：在浏览器端本地完成个人流水（微信 / 支付宝 / 银行）导入、解析入 SQLite 数据库，并通过 SQL + 图表方式做统计和可视化。
- 形态：单页 Web 应用，基于现有 `sqliteviz` 项目进行改造。
- 约束：
  - 所有数据和计算均在本地浏览器完成，无任何后端服务和网络上传。
  - 支持 PDF / XLSX / CSV 自动识别和导入，并能扩展更多格式。
  - 用户自定义 SQL，可实时预览数据和图表，并可保存为仪表盘卡片。

## 2. 主要页面与导航结构

应用整体采用 3 个主页卡（Tab），顶部或侧边导航切换：

1. 导入页（Import）
2. SQL 编辑页（Query & Chart）
3. Dashboard 展示页（Dashboard）

路由建议（基于已有 Vue Router 改造）：
- `/import`：导入页（首次访问或本地无数据时默认进入）
- `/query`：SQL 编辑页
- `/dashboard`：Dashboard 展示页（已有数据且已有图表时默认首页）

应用启动逻辑：
1. 打开网页 → 检查 IndexedDB / localStorage 中是否存在已导入数据库和已保存图表配置。
2. 若不存在 → 跳转 `/import`。
3. 若存在 → 直接进入 `/dashboard`。

## 3. 功能设计

### 3.1 导入页（Import）

入口功能：
- 文件选择按钮：支持多文件选择。
- 拖拽区域：支持将文件拖拽到页面完成导入。

支持的文件类型：
- PDF：微信、支付宝、部分银行对账单 PDF。
- XLSX / XLS：导出的 Excel 流水表格。
- CSV：通用流水明细。

交互流程：
1. 用户通过按钮或拖拽选择一个或多个文件。
2. 系统尝试自动识别文件类型与来源（微信 / 支付宝 / 银行），展示识别结果。
3. 对于无法自动识别的文件，提供手动选择来源和模板的下拉框（例如「微信 PDF」「通用 CSV」）。
4. 解析完成后，展示「解析预览对话框」：
   - 预览前 N 行流水记录。
   - 映射字段检查（日期、金额、收支方向、备注、对方账户等）。
5. 用户确认无误后，点击「写入数据库」按钮：
   - 数据统一转换为内部标准结构，写入浏览器内的 SQLite 数据库。
   - 为本次导入生成一条 `import_batch` 记录（方便过滤、分账户分析）。
6. 写入完成后：
   - 提示「导入成功，共 X 条记录」。
   - 自动跳转到 SQL 编辑页，加载默认 SQL 模板，并同时生成若干默认图表配置写入本地。

导入页其他功能：
- 导入历史列表：展示之前导入的批次（时间、来源、文件名、记录数）。
- 数据清空：提供「清空所有数据」按钮（需二次确认），删除本地数据库和配置。

### 3.2 SQL 编辑页（Query & Chart）

布局建议：
- 左侧：SQL 编辑器区域。
- 右上：查询结果数据表格。
- 右下：图表预览区域。

核心功能：
1. SQL 编辑：
   - 使用代码编辑器组件（沿用 sqliteviz 现有编辑器组件）。
   - 支持基本语法高亮、缩进。
   - 提供现成 SQL 模板列表（下拉区域或侧栏）。

2. 模板管理：
   - 模板类型：系统模板 + 用户自定义模板。
   - 系统模板示例：
     - 月度每日支出汇总（折线图）。
     - 月度每日收入汇总。
     - 分类支出占比（饼图）。
     - 某账户近三个月支出趋势。
   - 用户可以：
     - 从系统模板「应用到编辑器」。
     - 将当前 SQL「保存为我的模板」，命名和描述。

3. SQL 执行：
   - 「运行」按钮执行当前 SQL：
     - 调用本地 SQLite 引擎执行，返回数据结果集。
     - 若语法错误或执行时间过长，给出错误提示。
   - 限制：
     - 单次返回行数限制（如 2000 行）并支持分页加载，防止浏览器卡死。

4. 结果表格：
   - 对结果集进行表格展示，支持：
     - 基础排序。
     - 简单分页。
     - 导出为 CSV（可选）。

5. 图表配置与预览：
   - 默认规则：
     - 当结果集有 2 列且第一列为时间/分类、第二列为数值时，自动推断为折线图或柱状图。
   - 高级设置：
     - 图表类型选择：折线图、柱状图、饼图等。
     - X 轴字段、Y 轴字段的选择（从结果集列中选择）。
     - 分组字段、多序列配置（可后续迭代）。
   - 实时预览：
     - 每次 SQL 执行后，根据当前图表配置刷新右下图表。

6. 保存为 Dashboard 卡片：
   - 用户在编辑页调整好 SQL 和图表配置后，点击「保存为图表」：
     - 弹出配置框：
       - 图表名称。
       - 所属分组（如「日常开销」「收入分析」）。
       - 默认时间范围（如最近 30 天）。
     - 保存后，这条配置写入本地配置表，在 Dashboard 中以卡片形式展示。

### 3.3 Dashboard 展示页

展示用户已保存的所有图表：
- 以网格布局展示卡片，每个卡片对应一条 SQL + 图表配置。
- 卡片内容：
  - 标题、描述。
  - 图表本身。
  - 「刷新」按钮重新执行 SQL。

功能点：
1. 全局筛选：
   - 顶部提供「时间范围」筛选器（例如：本月、上月、最近 90 天、自定义）。
   - 可以作为 SQL 变量注入（参见技术设计）。

2. 卡片操作：
   - 编辑：跳转到 SQL 编辑页，并自动载入该卡片的 SQL 和图表配置。
   - 删除：从本地配置中移除。
   - 排序 / 布局：支持拖拽调整卡片顺序（后续迭代）。

3. 首次加载行为：
   - 若本地存在默认模板图表（首次导入生成），则直接展示这些卡片。

## 4. 数据与存储设计

### 4.1 存储选型

- SQLite 执行引擎：沿用 sqliteviz 现有方案（例如使用 sql.js 在浏览器内运行 SQLite）。
- 持久化：
  - SQLite 数据库文件保存在 IndexedDB 中（以二进制 Blob 或 ArrayBuffer 形式）。
  - 用户配置（模板、图表配置、全局设置）保存在 IndexedDB 或 localStorage 中（建议 IndexedDB）。

### 4.2 数据库逻辑模型（业务表）

在 SQLite 内建议建立以下标准业务表（表名可根据现有代码适当调整）：

1. `transactions`（流水明细）
   - `id` INTEGER PRIMARY KEY
   - `batch_id` TEXT         // 导入批次 ID
   - `account_type` TEXT     // 微信 / 支付宝 / 银行名
   - `trade_time` TEXT       // 交易时间（ISO 字符串）
   - `amount` REAL           // 金额，收入为正，支出为负
   - `currency` TEXT         // 货币种类
   - `direction` TEXT        // income / expense
   - `merchant` TEXT         // 商户 / 对方账户
   - `category` TEXT         // 分类（可后续手动标注）
   - `remark` TEXT           // 备注

2. `import_batches`
   - `batch_id` TEXT PRIMARY KEY
   - `source_type` TEXT     // wechat / alipay / bank_xxx / custom_csv
   - `file_name` TEXT
   - `import_time` TEXT
   - `record_count` INTEGER

> 说明：用户可基于这些表任意编写 SQL，不再额外为配置建表（配置放在 IndexedDB 的另一逻辑库中）。

### 4.3 配置存储模型（IndexedDB）

建议在 IndexedDB 中单独建一个数据库（例如 `sqliteviz_config`），主要对象：

1. `chart_configs`（图表卡片配置）
   - `id`：字符串 UUID
   - `name`：图表名称
   - `group`：分组名称
   - `sql`：执行的 SQL 文本
   - `chart_type`：line / bar / pie
   - `x_field`：用作 X 轴的字段名
   - `y_field`：用作 Y 轴的字段名或列表
   - `created_at` / `updated_at`

2. `sql_templates`（SQL 模板）
   - `id`
   - `name`
   - `description`
   - `sql`
   - `is_builtin`：是否为系统内置模板

3. `app_settings`（应用设置）
   - `id`：固定 "default"
   - `last_opened_tab`
   - `has_imported_data`：是否已有数据
   - `default_date_range`：默认时间范围配置

## 5. 文件解析与标准化设计

### 5.1 总体流程

1. 根据文件扩展名和内容特征判断源类型：
   - `.csv` → CSV 解析。
   - `.xlsx` / `.xls` → Excel 解析。
   - `.pdf` → PDF 解析（根据关键字匹配微信 / 支付宝 / 银行模板）。

2. 按源类型选择解析模块：
   - `WeChatPdfParser`
   - `AlipayPdfParser`
   - `BankCsvParser`
   - `GenericCsvParser`
   - `ExcelParser`

3. 各解析模块输出统一的中间结构：
   ```
   type ParsedTransaction = {
     tradeTime: string
     amount: number
     direction: 'income' | 'expense'
     currency?: string
     merchant?: string
     remark?: string
   }
   ```

4. 写入前统一转换为 `transactions` 表结构，并分配 `batch_id`。

### 5.2 解析库选型建议

- CSV：使用现有依赖或引入轻量库（如 PapaParse），按需加载。
- Excel：使用 SheetJS（xlsx）浏览器版，仅在需要解析 Excel 时动态加载。
- PDF：
  - 优先利用 pdf.js 解析文本，结合自定义规则抽取字段。
  - 首期可限制支持少量明确模板（如微信、支付宝），逐步扩展。

## 6. 技术架构与模块划分

在现有 `src` 目录结构基础上，增加或调整以下模块（命名仅示例，实际需对齐现有项目风格）：

1. `src/modules/import`：导入相关
   - `ImportPage.vue`：导入页 UI。
   - `FileDropZone.vue`：拖拽上传组件。
   - `ParsePreviewDialog.vue`：解析预览和字段映射确认对话框。
   - `parsers/`：不同平台解析器模块。

2. `src/modules/query`：SQL 编辑与预览
   - `QueryPage.vue`：SQL 编辑页整体布局。
   - `SqlEditor.vue`：代码编辑器封装。
   - `ResultTable.vue`：结果表格。
   - `ChartPreview.vue`：图表预览组件。
   - `TemplateList.vue`：SQL 模板列表。

3. `src/modules/dashboard`：Dashboard 展示
   - `DashboardPage.vue`：Dashboard 主页面。
   - `ChartCard.vue`：单个图表卡片组件。

4. `src/services`：服务层
   - `db/sqliteService.ts`：封装 sql.js 与 SQLite 操作（执行查询、写入、备份 / 恢复）。
   - `db/configStore.ts`：封装 IndexedDB 配置读写（chart_configs、sql_templates 等）。
   - `parserService.ts`：统一调度不同文件解析器，输出标准结构。

5. 图表库集成
   - 若现有 sqliteviz 已采用某图表库（如 Chart.js / ECharts），在 `ChartPreview.vue` 和 `ChartCard.vue` 中统一封装图表渲染逻辑，避免在各处重复使用底层图表 API。

## 7. SQL 参数化与全局过滤

为支持 Dashboard 顶部时间范围等全局过滤，需要一种参数注入机制：

- 在 SQL 中允许使用占位符（例如 `{{startDate}}` / `{{endDate}}`）。
- 在执行前，由前端根据当前全局筛选状态把占位符替换为具体值，并保证：
  - 使用带引号的安全字符串或参数绑定接口（若 sql.js 支持）。
  - 避免出现语法错误和注入风险（虽然在本地，但需要保证稳定性）。

示例：
```sql
SELECT date(trade_time) AS day, SUM(amount) AS total_expense
FROM transactions
WHERE direction = 'expense'
  AND trade_time BETWEEN {{startDate}} AND {{endDate}}
GROUP BY day
ORDER BY day;
```

执行时替换为：
```sql
... BETWEEN '2025-01-01' AND '2025-01-31'
```

## 8. 隐私与安全设计

- 不发起任何带用户数据的网络请求：
  - 所有解析和计算在浏览器内完成。
  - 禁用自动错误上报中包含敏感数据的功能（如有）。
- 提示用户：
  - 在导入页和设置页以简短文字说明「所有数据只存储在本地浏览器，不会上传到服务器」。
- 数据清除：
  - 提供一键清除本地数据和配置的功能。

## 9. 性能与限制

- 文件大小控制：
  - 单个文件建议限制为例如 20–50MB，超过时给用户友好提示。
- 分批写入：
  - 对大文件分批解析并写入 SQLite，避免一次性加载造成卡顿。
- 查询限制：
  - 单次查询返回行数限制；对复杂 SQL 可提示用户优化。
- 图表点数限制：
  - 对折线图等限制点数（如最多 2000 点），超出时采样或给提示。

## 10. 迭代计划（建议）

可以按阶段实施，避免一次性开发过大：

- 第一期（MVP）：
  - 支持 CSV 导入，统一写入 `transactions` 表。
  - SQL 编辑器 + 结果表格 + 折线图 / 柱状图预览。
  - 图表保存为 Dashboard 卡片，并持久化到本地。

- 第二期：
  - 支持 Excel（XLSX）导入。
  - 初步支持微信 / 支付宝 PDF 解析（约定具体模板）。
  - 完善全局时间筛选与 SQL 参数化。

- 第三期及以后：
  - 支持更多银行 PDF / CSV 模板。
  - 图表交互增强（联动、多维度筛选）。
  - 导入向导与分类自动标注（基于规则）。

---

以上方案覆盖了页面交互、数据模型、解析流程、持久化与隐私要求，可直接作为后续开发拆分任务和实现的依据。