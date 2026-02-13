const fs = require('fs');
const iconv = require('iconv-lite');

const file = process.argv[2] || 'test-receipt.txt';
if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(2);
}
const buf = fs.readFileSync(file);
const encodings = ['windows-1256','cp720','cp864','utf8'];
for (const enc of encodings) {
  console.log('\n---', enc, '---');
  try {
    const decoded = iconv.decode(buf, enc);
    // remove control characters except common whitespace and Arabic-specific marks
    const plain = decoded.replace(/[\x00-\x1F\x7F]/g, '');
    console.log(plain.slice(0, 3000));
  } catch (e) {
    console.error('error for', enc, e.message);
  }
}
