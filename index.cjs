// الملف معطل حالياً لأن التطبيق يعتمد على Electron IPC للاتصال بقاعدة البيانات مباشرة
// بدلاً من استخدام خادم Express منفصل.
// تم الاحتفاظ بالملف كمرجع فقط.

// const express = require('express');
// const cors = require('cors');

// const app = express();
// const PORT = 3001;

// // Middlewares
// app.use(cors()); // للسماح بالطلبات من الواجهة الأمامية
// app.use(express.json()); // لتحليل الطلبات بصيغة JSON

// /**
//  * نقطة نهاية وهمية لتسجيل الدخول
//  * في التطبيق الحقيقي، ستقوم بالتحقق من اسم المستخدم وكلمة المرور مقابل قاعدة البيانات
//  */
// app.post('/api/auth/login', (req, res) => {
//   const { username, password } = req.body;

//   console.log(`Login attempt with username: ${username}`);

//   // منطق تحقق وهمي (Fake logic)
//   if (username === 'admin' && password === '123456') {
//     // في التطبيق الحقيقي، سترسل JWT Token هنا
//     res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: { name: 'Admin User' } });
//   } else {
//     res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`[server] Express server is running at http://localhost:${PORT}`);
// });