# حل طباعة النصوص العربية على طابعات ESC/POS

## المشكلة التقنية

طابعات ESC/POS الحرارية (مثل XPrinter XP-80) لا تدعم:
- **UTF-8**: معظم الطابعات تستخدم ترميزات قديمة مثل CP1256 أو CP864
- **RTL (Right-to-Left)**: لا تدعم اتجاه النص العربي بشكل مباشر
- **Arabic Shaping**: الحروف العربية تحتاج إلى ربط (تشكيل) لتظهر بشكل صحيح

## الحل المطبق

### 1. Arabic Text Shaping
```javascript
const reshaped = arabicReshaper.reshape(text);
```
- ربط الحروف العربية (الحروف المتصلة)
- تحويل الأشكال الأساسية إلى الأشكال المناسبة (initial, medial, final)

### 2. RTL Layout Handling
```javascript
const rtlText = reshaped; // Removed reverse for native RTL support
```
- الطابعة تدعم RTL بشكل أصلي مع الأوامر المناسبة

### 3. Proper Encoding
```javascript
return iconv.encode(rtlText, 'iso-8859-6');
```
- استخدام ISO-8859-6 (أفضل دعم للعربية)
- ترميز شامل للحروف العربية

## ميزات النسخ الاحتياطي

### تصدير واسترجاع قاعدة البيانات الكاملة
- **backup-all**: تصدير نسخة كاملة من قاعدة البيانات (.db)
- **backup-restore**: استرجاع نسخة كاملة من قاعدة البيانات

### تصدير واسترجاع المنتجات
- **backup-products**: تصدير المنتجات إلى JSON
- **backup-restore**: استرجاع المنتجات من JSON

### تصدير واسترجاع الديون
- **backup-debts**: تصدير الديون والعملاء إلى JSON
- **restore-debts**: استرجاع الديون من JSON (جديد!)

## كيفية الاستخدام

### في Electron App

```javascript
const ArabicReceiptPrinter = require('./scripts/arabic-receipt-printer');

const printer = new ArabicReceiptPrinter();

const receiptData = {
  store: {
    name: 'متجر الإلكترونيات الحديثة',
    address: 'العراق - بغداد',
    phone: '07771234567'
  },
  invoice: {
    number: 'INV-001',
    date: '2025-12-23',
    time: '14:30',
    cashier: 'أحمد محمد',
    items: [
      { name: 'كيبورد', qty: 2, price: 25.000, total: 50.000 },
      { name: 'ماوس', qty: 1, price: 15.000, total: 15.000 }
    ],
    subtotal: 65.000,
    discount: 5.000,
    total: 60.000,
    paymentMethod: 'نقدي'
  },
  footer: 'شكراً لزيارتكم! 🌹',
  qr: 'https://www.facebook.com/profile.php?id=61586964411611&mibextid=ZbWKwL',
  qrImage: 'qr.png'
};

await printer.printReceipt(receiptData);
```

### في main.cjs (Electron)

```javascript
const ArabicReceiptPrinter = require('./scripts/arabic-receipt-printer');

ipcMain.handle("print-arabic-receipt", async (event, receiptData) => {
  const printer = new ArabicReceiptPrinter();
  return await printer.printReceipt(receiptData);
});
```

## الميزات

- ✅ **Arabic Shaping**: ربط الحروف العربية بشكل صحيح
- ✅ **RTL Support**: اتجاه النص من اليمين إلى اليسار
- ✅ **ESC/POS Compatible**: يعمل مع XPrinter XP-80 وأجهزة مشابهة
- ✅ **80mm Receipt**: محاذاة مناسبة لأوراق 80mm
- ✅ **Backup/Restore**: نسخ احتياطي كامل وجزئي
- ✅ **Error Handling**: معالجة أخطاء شاملة

## المتطلبات

```bash
npm install arabic-reshaper iconv-lite usb
```

## اختبار الحل

```bash
node scripts/arabic-receipt-printer.js
```

## ملاحظات مهمة

1. **الطابعة يجب أن تدعم العربية** في firmwareها
2. **ISO-8859-6 هو الأكثر توافقاً** مع الطابعات العربية الحرارية
3. **اختبر مع طابعات مختلفة** قد تحتاج ترميز مختلف
4. **USB Direct**: أسرع وأكثر موثوقية من spooler

## استكشاف الأخطاء

### إذا ظهرت الحروف مفصولة:
- تأكد من تثبيت `arabic-reshaper`
- جرب ترميز مختلف: `cp864` أو `cp1256`

### إذا كان الاتجاه خاطئ:
- تحقق من أوامر RTL في `generateReceipt`
- جرب إضافة `split('').reverse().join('')` إذا لزم الأمر

### إذا لم تعمل الطابعة:
- تأكد من USB ID الصحيح للطابعة
- جرب Windows spooler كـ fallback

### مشاكل النسخ الاحتياطي:
- **قاعدة بيانات تالفة**: استخدم `npx prisma migrate reset --force`
- **لا توجد بيانات**: تأكد من وجود بيانات قبل التصدير
- **أخطاء في الاسترجاع**: تحقق من console للأخطاء المفصلة

## الأداء

- **معالجة سريعة**: لا تؤثر على أداء التطبيق
- **ذاكرة منخفضة**: استخدام minimal للمكتبات
- **توافق عالي**: يعمل مع معظم طابعات ESC/POS العربية