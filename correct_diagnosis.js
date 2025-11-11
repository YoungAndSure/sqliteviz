// 正确的诊断脚本 - 适用于 sqliteviz Vue 3 应用
// 复制到浏览器控制台运行

async function diagnoseSqliteViz() {
  try {
    console.log('=== sqliteviz 数据库诊断 ===');
    
    // 获取 Vue 应用实例
    const app = document.querySelector('#app').__vue_app__;
    if (!app) {
      console.error('无法获取 Vue 应用实例');
      return;
    }
    
    // 获取 store
    const store = app.config.globalProperties.$store;
    if (!store) {
      console.error('无法获取 Vuex store');
      return;
    }
    
    // 获取数据库
    const db = store.state.db;
    if (!db) {
      console.error('无法获取数据库实例');
      return;
    }
    
    console.log('✓ 成功获取数据库实例');
    console.log('数据库名称:', db.dbName);
    
    // 刷新 schema
    console.log('正在刷新 schema...');
    await db.refreshSchema();
    
    if (!db.schema || db.schema.length === 0) {
      console.warn('❌ 数据库中没有表');
      console.log('可能的原因:');
      console.log('1. 文件导入失败');
      console.log('2. 导入过程中出现错误');
      console.log('3. 数据库未正确保存');
      return;
    }
    
    console.log('✓ 找到', db.schema.length, '个表');
    
    // 列出所有表
    console.log('\n=== 数据库中的所有表 ===');
    db.schema.forEach((table, index) => {
      console.log(`${index + 1}. 表名: "${table.name}"`);
      console.log(`   列数: ${table.columns.length}`);
      table.columns.forEach(col => {
        console.log(`     - ${col.name} (${col.type})`);
      });
      console.log('');
    });
    
    // 检查目标表
    const targetName = 'wechat_20250701_20250930';
    const targetTable = db.schema.find(t => t.name === targetName);
    
    if (targetTable) {
      console.log(`✓ 找到目标表: ${targetName}`);
      
      try {
        // 检查行数
        const countResult = await db.execute(`SELECT COUNT(*) as count FROM "${targetName}"`);
        const rowCount = countResult.values.count[0];
        console.log(`表中有 ${rowCount} 行数据`);
        
        if (rowCount > 0) {
          // 显示前几行
          const sampleResult = await db.execute(`SELECT * FROM "${targetName}" LIMIT 3`);
          console.log('前3行数据:', sampleResult.values);
        }
        
      } catch (error) {
        console.error('❌ 查询表数据时出错:', error.message);
      }
    } else {
      console.log(`❌ 未找到目标表: ${targetName}`);
      
      // 查找相似的表
      const similarTables = db.schema.filter(t => 
        t.name.toLowerCase().includes('wechat') || 
        t.name.toLowerCase().includes('2025')
      );
      
      if (similarTables.length > 0) {
        console.log('找到相似的表:');
        similarTables.forEach(t => console.log(`  - "${t.name}"`));
      }
    }
    
    // 提供查询建议
    console.log('\n=== 查询建议 ===');
    const firstTable = db.schema[0];
    if (firstTable) {
      console.log(`尝试查询第一个表:`);
      console.log(`SELECT * FROM "${firstTable.name}" LIMIT 10;`);
    }
    
  } catch (error) {
    console.error('诊断过程中出错:', error);
  }
}

// 运行诊断
console.log('开始诊断 sqliteviz 数据库...');
diagnoseSqliteViz();