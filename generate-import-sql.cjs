const fs = require('fs');
const path = require('path');

// Read the JSON file
const dataFile = 'C:\\Users\\KAZEM\\Desktop\\منتجات حي الامام.json';

console.log('📖 Reading products file...');
const fileContent = fs.readFileSync(dataFile, 'utf8');
const products = JSON.parse(fileContent);
console.log(`✅ Found ${products.length} products\n`);

// Generate SQL INSERT statements
console.log('🛠️ Generating SQL statements...');

let sqlOutput = '-- Import products from منتجات حي الامام.json\n';
sqlOutput += '-- Generated SQL INSERT statements\n\n';

// Get unique categories
const uniqueCategories = [...new Set(products.map(p => p.categoryId))];

// Insert categories
sqlOutput += '-- Categories\n';
for (const categoryId of uniqueCategories) {
  const categoryName = getCategoryName(categoryId);
  sqlOutput += `INSERT OR IGNORE INTO "Category" (id, name, createdAt) VALUES (${categoryId}, '${escapeSql(categoryName)}', CURRENT_TIMESTAMP);\n`;
}

sqlOutput += '\n-- Products\n';

// Insert products
for (let i = 0; i < products.length; i++) {
  const product = products[i];
  const barcode = product.barcode ? `'${escapeSql(product.barcode)}'` : 'NULL';
  
  sqlOutput += `INSERT OR IGNORE INTO "Product" (id, name, price, stock, barcode, unitsPerBox, boxPurchasePrice, boxSalePrice, categoryId, createdAt) VALUES (${product.id}, '${escapeSql(product.name)}', ${product.price}, ${product.stock}, ${barcode}, ${product.unitsPerBox}, ${product.boxPurchasePrice}, ${product.boxSalePrice}, ${product.categoryId}, CURRENT_TIMESTAMP);\n`;
  
  if ((i + 1) % 50 === 0) {
    console.log(`  Generated ${i + 1}/${products.length} SQL statements...`);
  }
}

// Save SQL to file
const sqlFile = path.join(__dirname, 'import-products.sql');
fs.writeFileSync(sqlFile, sqlOutput, 'utf8');

console.log(`\n✅ Generated ${sqlOutput.split('\n').length} lines of SQL`);
console.log(`📁 Saved to: ${sqlFile}`);
console.log(`\n✨ To import these products, run:`);
console.log(`   sqlite3 prisma/dev.db < import-products.sql`);

function getCategoryName(categoryId) {
  const categoryNames = {
    1: 'الدواجن والدجاج',
    2: 'البيض',
    3: 'منتجات ألبان',
    4: 'لحوم',
    5: 'أسماك',
  };
  return categoryNames[categoryId] || `فئة ${categoryId}`;
}

function escapeSql(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "''");
}
