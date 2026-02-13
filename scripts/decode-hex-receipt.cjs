const iconv = require('iconv-lite');

const hex = `1b 40 1b 74 1c 1b 61 01 1b 45 01 3f 3f 3f 3f 20 3f 3f 3f 3f 3f 3f 3f 20 3f 3f 3f 3f 3f 3f 3f 3f 1b 45 00 0a 3f 3f 3f 3f 3f 3f 20 2d 20 3f 3f 3f 3f 0a 30 37 37 36 36 37 35 37 32 33 35 0a 0a 1b 61 00 3f 3f 3f 20 3f 3f 3f 3f 3f 3f 3f 3f 3a 20 36 34 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 3f 3f 3f 3f 3f 3f 3f 3a 20 32 31 3f 2f 31 32 3f 2f 32 30 32 35 20 31 31 3a 33 32 20 3f 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 3f 3f 3f 3f 3f 3f 3f 3a 20 3f 3f 3f 3f 3f 3f 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 0a 20 20 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 20 20 20 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 3f 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 0a 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 0a 31 2e 32 35 30 39 31 31 36 31 37 37 39 34 37 37 39 37 30 2e 32 35 30 31 38 32 33 32 33 35 35 38 39 35 35 39 35 20 20 20 20 33 34 33 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 0a 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 2d 0a 3f 3f 3f 3f 3f 3f 3f 20 3f 3f 3f 3f 3f 3f 3a 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 31 2e 32 35 30 39 31 31 36 31 37 37`;

function hexToBuffer(h) {
  const parts = h.trim().split(/\s+/);
  const arr = parts.map(p => parseInt(p, 16));
  return Buffer.from(arr);
}

const buf = hexToBuffer(hex);
const encodings = ['windows-1256','cp720','cp864','utf8'];
for (const enc of encodings) {
  console.log('\n---', enc, '---');
  try {
    const decoded = iconv.decode(buf, enc);
    const plain = decoded.replace(/[\x00-\x1F\x7F]/g, '');
    console.log(plain);
  } catch (e) {
    console.error('error for', enc, e.message);
  }
}

// Also print counts of 0x3f
const count3f = buf.reduce((c,b)=>c+(b===0x3f),0);
console.log('\n0x3F count:', count3f, 'of', buf.length);
