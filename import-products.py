#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sqlite3
import json
from pathlib import Path

def import_products():
    """استيراد المنتجات من ملف JSON إلى قاعدة البيانات SQLite"""
    
    # المسارات
    db_path = Path(__file__).parent / 'prisma' / 'dev.db'
    data_file = Path('C:/Users/KAZEM/Desktop/منتجات حي الامام.json')
    
    print(f'📖 قراءة ملف البيانات: {data_file}')
    
    # قراءة البيانات
    with open(data_file, 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    print(f'✅ وجدنا {len(products)} منتج للاستيراد\n')
    
    # الاتصال بقاعدة البيانات
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # الفئات
    category_names = {
        1: 'الدواجن والدجاج',
        2: 'البيض',
        3: 'منتجات ألبان',
        4: 'لحوم',
        5: 'أسماك',
    }
    
    # إنشاء الفئات
    print('📂 إنشاء الفئات...')
    unique_categories = set(p.get('categoryId') for p in products if p.get('categoryId'))
    
    for cat_id in unique_categories:
        cat_name = category_names.get(cat_id, f'فئة {cat_id}')
        try:
            cursor.execute(
                'INSERT OR IGNORE INTO "Category" (id, name) VALUES (?, ?)',
                (cat_id, cat_name)
            )
            print(f'  ✓ الفئة: {cat_name}')
        except Exception as e:
            print(f'  ⚠️  خطأ: {e}')
    
    # استيراد المنتجات
    print(f'\n🛒 استيراد {len(products)} منتج...')
    imported = 0
    skipped = 0
    errors = 0
    
    for i, product in enumerate(products, 1):
        try:
            cursor.execute(
                '''INSERT OR IGNORE INTO "Product" 
                   (id, name, price, stock, barcode, unitsPerBox, boxPurchasePrice, boxSalePrice, categoryId)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    product.get('id'),
                    product.get('name'),
                    product.get('price', 0),
                    product.get('stock', 0),
                    product.get('barcode'),
                    product.get('unitsPerBox', 1),
                    product.get('boxPurchasePrice', 0),
                    product.get('boxSalePrice', 0),
                    product.get('categoryId'),
                )
            )
            
            # التحقق من الإدراج
            if cursor.rowcount > 0:
                imported += 1
            else:
                skipped += 1
            
            # مؤشر التقدم
            if i % 50 == 0:
                print(f'  ⏳ معالجة {i}/{len(products)} منتج...')
                
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  ⚠️  خطأ في المنتج {product.get("id")}: {e}')
    
    # حفظ التغييرات
    conn.commit()
    
    # الإحصائيات
    count = cursor.execute('SELECT COUNT(*) FROM "Product"').fetchone()[0]
    
    print(f'\n✅ اكتمل الاستيراد!')
    print(f'  📊 الملخص:')
    print(f'     - تم إضافة: {imported} منتج')
    print(f'     - تم تخطي: {skipped} منتج (موجود بالفعل)')
    print(f'     - أخطاء: {errors}')
    print(f'     - إجمالي المنتجات في قاعدة البيانات: {count}')
    print(f'     - الفئات: {len(unique_categories)}')
    
    conn.close()

if __name__ == '__main__':
    try:
        import_products()
        print('\n🎉 النجاح!')
    except FileNotFoundError as e:
        print(f'❌ الملف غير موجود: {e}')
    except Exception as e:
        print(f'❌ خطأ: {e}')
