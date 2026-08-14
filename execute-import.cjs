const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const sqlFile = path.join(__dirname, 'import-products.sql');

console.log('📁 Database:', dbPath);
console.log('📄 SQL File:', sqlFile);

// Read SQL content
const sqlContent = fs.readFileSync(sqlFile, 'utf8');

// Try using better-sqlite3 if available, otherwise use a different approach
try {
  const Database = require('better-sqlite3');
  console.log('💾 Using better-sqlite3...');
  
  const db = new Database(dbPath);
  const statements = sqlContent.split(';').filter(s => s.trim());
  
  console.log(`\n🔄 Executing ${statements.length} SQL statements...`);
  
  let executed = 0;
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        db.exec(statement);
        executed++;
        if (executed % 50 === 0) {
          console.log(`  ✓ Executed ${executed} statements...`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Error:`, err.message.substring(0, 100));
      }
    }
  }
  
  db.close();
  
  console.log(`\n✅ Import completed!`);
  console.log(`   - Executed: ${executed} statements`);
  
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('⚠️  better-sqlite3 not available, using manual import...');
    
    // Fallback: use Node's built-in fetch to execute via electron
    console.log('\n✨ Alternative: Use electron directly to execute imports');
    console.log('   npm run dev:desktop and check the app console');
    
  } else {
    console.error('❌ Error:', error.message);
  }
}
