const fs = require('fs');
const path = require('path');

async function importProductsFromSQL() {
  try {
    const sqlFile = path.join(__dirname, 'import-products.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    const statements = sqlContent.split(';\n').filter(s => s.trim() && !s.trim().startsWith('--'));
    
    console.log(`🔄 Importing ${statements.length} SQL statements...`);
    
    // Import from the getPrisma function (from main.cjs)
    // This will be called after the database connection is established
    
    return {
      statements,
      count: statements.length,
      ready: true
    };
  } catch (error) {
    console.error('Error reading SQL:', error.message);
    return null;
  }
}

// Export for use in main.cjs
module.exports = { importProductsFromSQL };
