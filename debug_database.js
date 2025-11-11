// 诊断脚本 - 检查数据库状态
// 在浏览器控制台中运行此脚本来诊断问题

async function diagnoseDatabase() {
  try {
    // 获取数据库实例
    const db = window.$nuxt.$store.state.db;
    
    if (!db) {
      console.error('数据库实例未找到');
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

// 运行诊断
console.log('开始数据库诊断...');
diagnoseDatabase();