const fs = require('fs');
const path = require('path');
const sqlite = require('sqlite-electron');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const dataFile = 'C:\\Users\\KAZEM\\Desktop\\منتجات حي الامام.json';

async function importProducts() {
  try {
    console.log('🔧 Setting up database...');
    await sqlite.setdbPath(dbPath);

    // Read the JSON file
    console.log('📖 Reading products file...');
    const fileContent = fs.readFileSync(dataFile, 'utf8');
    const products = JSON.parse(fileContent);
    console.log(`✅ Found ${products.length} products to import\n`);

    // Get or create categories
    console.log('📂 Ensuring categories exist...');
    const uniqueCategories = [...new Set(products.map(p => p.categoryId))];
    
    for (const categoryId of uniqueCategories) {
      try {
        // Check if category exists
        const result = await sqlite.getRow(
          `SELECT id FROM "Category" WHERE id = ?`,
          [categoryId]
        );
        
        if (!result) {
          // Create category with default name
          const categoryName = getCategoryName(categoryId);
          await sqlite.run(
            `INSERT INTO "Category" (id, name, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [categoryId, categoryName]
          );
          console.log(`  ✓ Created category: ${categoryName} (ID: ${categoryId})`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Error with category ${categoryId}:`, err.message);
      }
    }

    // Import products in batches
    console.log(`\n🛒 Importing ${products.length} products...`);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Start transaction for batch insert
    await sqlite.run('BEGIN TRANSACTION');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      try {
        // Check if product already exists
        const existing = await sqlite.getRow(
          `SELECT id FROM "Product" WHERE id = ?`,
          [product.id]
        );

        if (existing) {
          skipped++;
        } else {
          // Insert product
          await sqlite.run(
            `INSERT INTO "Product" (
              id, name, price, stock, barcode, unitsPerBox, 
              boxPurchasePrice, boxSalePrice, categoryId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              product.id,
              product.name,
              product.price,
              product.stock,
              product.barcode || null,
              product.unitsPerBox,
              product.boxPurchasePrice,
              product.boxSalePrice,
              product.categoryId
            ]
          );
          
          imported++;
        }
        
        // Progress indicator
        if ((i + 1) % 50 === 0) {
          console.log(`  ⏳ Processed ${i + 1}/${products.length} products...`);
        }
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.warn(`  ⚠️  Error importing product ${product.id}:`, err.message);
        }
      }
    }

    // Commit transaction
    await sqlite.run('COMMIT');

    console.log('\n✅ Import completed!');
    console.log(`  📊 Summary:`);
    console.log(`     - Imported: ${imported} products`);
    console.log(`     - Skipped: ${skipped} products (already exist)`);
    console.log(`     - Errors: ${errors} products`);
    console.log(`     - Categories: ${uniqueCategories.length}`);
    
    return true;
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    await sqlite.run('ROLLBACK').catch(() => {});
    throw error;
  }
}

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

importProducts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
