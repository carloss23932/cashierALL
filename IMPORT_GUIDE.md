# استيراد المنتجات - Product Import Guide

## 📋 ملخص البيانات
- **عدد المنتجات:** 445 منتج
- **الملف الأصلي:** `C:\Users\KAZEM\Desktop\منتجات حي الامام.json`
- **ملف SQL:** `import-products.sql` (تم إنشاؤه تلقائياً)

## 🚀 طريقة الاستيراد

### الطريقة الأولى: استخدام Python (الموصى به)
```bash
cd "C:\Users\KAZEM\Desktop\POS S"
python import-products.py
```

### الطريقة الثانية: يدوياً من خلال التطبيق
1. شغّل التطبيق: `npm run dev:desktop`
2. افتح الـ DevTools (F12)
3. اذهب إلى Console
4. استيرد البيانات يدوياً

### الطريقة الثالثة: أمر مباشر في Terminal (إن أمكن)
```bash
sqlite3 prisma/dev.db ".read import-products.sql"
```

## 📊 محتوى الاستيراد
- **الفئات:** 5 فئات أساسية
  1. الدواجن والدجاج
  2. البيض
  3. منتجات ألبان
  4. لحوم
  5. أسماك

- **الحقول:** id, name, price, stock, barcode, unitsPerBox, boxPurchasePrice, boxSalePrice, categoryId

## ⚠️ ملاحظات مهمة
- جميع الأوامر تستخدم `INSERT OR IGNORE` لتجنب تكرار المنتجات
- إذا كان المنتج موجوداً بالفعل، سيتم تخطيه
- الملفات الناتجة آمنة وجاهزة للاستخدام

## 🔄 التحقق من الاستيراد
بعد الاستيراد، تحقق من عدد المنتجات:
```sql
SELECT COUNT(*) FROM "Product";
```

يجب أن يكون العدد 445 أو أقل (إذا كانت هناك منتجات موجودة بالفعل)
