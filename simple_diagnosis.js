// 简单诊断脚本 - 复制到浏览器控制台运行

// 方法1: 直接查看所有表名
console.log('=== 方法1: 查看所有表名 ===');
try {
  // 尝试访问 Vuex store
  if (window.__VUE__ && window.__VUE__.__v_app) {
    const app = window.__VUE__.__v_app;
    const store = app._instance?.setupContext?.store || app.config?.globalProperties?.$store;
    if (store && store.state && store.state.db) {
      const db = store.state.db;
      console.log('找到数据库实例');
      console.log('数据库名:', db.dbName);
      console.log('Schema:', db.schema);
      
      if (db.schema) {
        console.log('=== 所有表名 ===');
        db.schema.forEach((table, i) => {
          console.log(`${i+1}. "${table.name}" (${table.columns.length} 列)`);
        });
      }
    } else {
      console.log('未找到 store 或 db');
    }
  }
} catch (e) {
  console.log('方法1失败:', e.message);
}

// 方法2: 检查页面上的表名显示
console.log('\n=== 方法2: 检查页面显示 ===');
const schemaElements = document.querySelectorAll('#schema-container .table-name, [class*="table"], [class*="schema"]');
if (schemaElements.length > 0) {
  console.log('在页面上找到以下表相关元素:');
  schemaElements.forEach((el, i) => {
    console.log(`${i+1}. ${el.textContent.trim()}`);
  });
} else {
  console.log('页面上未找到表相关元素');
}

// 方法3: 建议的调试步骤
console.log('\n=== 建议的调试步骤 ===');
console.log('1. 检查左侧 Schema 面板是否有表显示');
console.log('2. 检查导入文件时的消息日志');
console.log('3. 尝试导入一个简单的 Excel 文件测试');
console.log('4. 确认文件名和生成的表名是否匹配');

// 方法4: 提供查询建议
console.log('\n=== 查询建议 ===');
console.log('尝试以下查询:');
console.log('SELECT name FROM sqlite_master WHERE type="table";');
console.log('然后使用实际显示的表名进行查询，例如:');
console.log('SELECT * FROM "实际表名" LIMIT 10;');