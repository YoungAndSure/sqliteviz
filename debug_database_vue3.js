// Vue 3 应用诊断脚本
// 在浏览器控制台中运行此脚本来诊断数据库问题

async function diagnoseDatabase() {
  try {
    // 尝试获取 Vue 应用实例和数据库
    let db;
    
    // 方法1: 尝试通过全局变量获取
    if (window.Vue && window.Vue.config && window.Vue.config.globalProperties) {
      db = window.Vue.config.globalProperties.$store?.state?.db;
    }
    
    // 方法2: 尝试通过 document.querySelector 获取 Vue 实例
    if (!db) {
      const app = document.querySelector('#app').__vue_app__;
      db = app?.config?.globalProperties?.$store?.state?.db;
    }
    
    // 方法3: 尝试通过 __VUE__ 属性获取
    if (!db) {
      const vueApp = document.querySelector('#app').__vue_app__;
      if (vueApp && vueApp._instance && vueApp._instance.setupState) {
        db = vueApp._instance.setupState.$store?.state?.db;
      }
    }
    
    if (!db) {
      console.error('无法获取数据库实例。请尝试以下方法：');
      console.log('1. 在 Schema 面板中查看表名');
      console.log('2. 检查导入时的消息日志');
      console.log('3. 尝试重新导入文件');
      return;
    }
    
    console.log('=== 数据库诊断 ===');
    console.log('数据库名称:', db.dbName);
    
    // 检查 schema
    console.log('正在刷新 schema...');
    await db.refreshSchema();
    console.log('当前 schema:', db.schema);
    
    if (!db.schema || db.schema.length === 0) {
      console.warn('数据库中没有表');
      return;
    }
    
    // 列出所有表
    console.log('=== 数据库中的表 ===');
    db.schema.forEach((table, index) => {
      console.log(`${index + 1}. 表名: "${table.name}"`);
      console.log(`   列数: ${table.columns.length}`);
      console.log(`   列信息:`, table.columns);
    });
    
    // 检查特定表
    const tableName = 'wechat_20250701_20250930';
    const targetTable = db.schema.find(t => t.name === tableName);
    
    if (targetTable) {
      console.log(`=== 找到目标表: ${tableName} ===`);
      
      // 检查表中的数据
      try {
        const countResult = await db.execute(`SELECT COUNT(*) as count FROM "${tableName}"`);
        console.log('表中的行数:', countResult.values.count[0]);
        
        // 尝试查询前几行
        const sampleResult = await db.execute(`SELECT * FROM "${tableName}" LIMIT 5`);
        console.log('前5行数据:', sampleResult);
        
      } catch (error) {
        console.error('查询表数据时出错:', error);
      }
    } else {
      console.warn(`未找到目标表: ${tableName}`);
      
      // 查找相似的表名
      const similarTables = db.schema.filter(t => 
        t.name.toLowerCase().includes('wechat') || 
        t.name.toLowerCase().includes('2025')
      );
      
      if (similarTables.length > 0) {
        console.log('找到相似的表名:');
        similarTables.forEach(t => console.log(`  - "${t.name}"`));
      }
    }
    
  } catch (error) {
    console.error('诊断过程中出错:', error);
  }
}

// 简单版本的表名查询
function showAllTables() {
  // 尝试直接查询 sqlite_master 表
  console.log('尝试查询所有表...');
  
  // 创建一个简单的查询函数
  const queryTables = () => {
    // 这里我们需要访问数据库实例，但如果没有直接访问方式，
    // 我们只能建议用户通过 UI 查看
    console.log('请在左侧 Schema 面板中查看表名，或检查导入时的消息。');
  };
  
  queryTables();
}

// 运行诊断
console.log('开始数据库诊断...');
console.log('如果完整诊断失败，将尝试显示基本信息。');

diagnoseDatabase().catch(() => {
  console.log('完整诊断失败，显示基本信息...');
  showAllTables();
});