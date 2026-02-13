const usb = require('usb');
const iconv = require('iconv-lite');
const arabicReshaper = require('arabic-reshaper');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Candidate vendor/product IDs (includes IDs observed on this machine)
const candidates = [
  [0x0483, 0x5740],
  [0x04b8, 0x0202],
  [0x258a, 0x1007],
  [0x258a, 0x002a],
  [0x214b, 0x7250],
  [0x1022, 0x15e0],
  [0x1022, 0x15e1],
  [0x1022, 0x43bb]
];

function listDevices() {
  return usb.getDeviceList().map(d => {
    const desc = d.deviceDescriptor || {};
    return {
      vendorId: desc.idVendor ? `0x${desc.idVendor.toString(16)}` : null,
      productId: desc.idProduct ? `0x${desc.idProduct.toString(16)}` : null,
      busNumber: d.busNumber,
      deviceAddress: d.deviceAddress
    };
  });
}

async function tryPrint() {
  console.log('Listing USB devices...');
  console.log(listDevices());

  let device = null;
  for (const [vid, pid] of candidates) {
    try {
      const d = usb.findByIds(vid, pid);
      if (d) {
        device = d;
        console.log(`Found device by VID/PID: 0x${vid.toString(16)}/0x${pid.toString(16)}`);
        break;
      }
    } catch (e) {
      // continue
    }
  }

  if (!device) {
    // fallback: try to find any device with out endpoint
    const list = usb.getDeviceList();
    device = list.find(d => {
      try {
        const ifaces = d.interfaces || [];
        for (const iface of ifaces) {
          const desc = iface.descriptor || {};
          if (desc.bInterfaceClass === 7) return true;
          const endpoints = iface.endpoints || [];
          if (endpoints.find(ep => ep.direction === 'out')) return true;
        }
      } catch (e) {
        // ignore
      }
      return false;
    });
  }

  if (!device) {
    console.warn('No suitable USB printer device found. Writing mock file to desktop.');
    const mockPath = path.join(os.homedir(), 'Desktop', 'send-raw-print-mock.txt');
    fs.writeFileSync(mockPath, 'TEST PRINT\n');
    console.log('Mock file written:', mockPath);
    return;
  }

  try {
    device.open();
    const iface = device.interfaces[0];
    if (!iface) throw new Error('No interface on device');
    try {
      if (typeof iface.isKernelDriverActive === 'function' && iface.isKernelDriverActive()) {
        try { iface.detachKernelDriver(); } catch (e) { console.warn('detachKernelDriver failed:', e.message); }
      }
    } catch (e) {
      // ignore
    }
    iface.claim();

    const endpoint = iface.endpoints.find(e => e.direction === 'out');
    if (!endpoint) throw new Error('Could not find OUT endpoint on device');

    // Build ESC/POS test buffer: init + Arabic text encoded UTF-8 + feed + cut
    const ESC = '\x1B';
    const GS = '\x1D';
    const INIT = ESC + '@';
    const CUT = GS + 'V' + '\x00';
    const SET_RTL = ESC + 'U' + '\x01'; // RTL mode
    const SET_ARABIC = ESC + 't' + '\x16'; // CP1256 Arabic

    const text = 'اختبار الطباعة - Hello\n\n';
    const encodedText = iconv.encode(text, 'cp1256');

    const parts = [Buffer.from(INIT, 'ascii'), Buffer.from(SET_ARABIC, 'ascii'), encodedText, Buffer.from('\n\n\n', 'ascii'), Buffer.from(CUT, 'ascii')];
    const buffer = Buffer.concat(parts);

    console.log('Transferring buffer to printer (length:', buffer.length, ')...');
    await new Promise((resolve, reject) => {
      endpoint.transfer(buffer, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('Transfer complete.');

    // cleanup
    try { iface.release(true, (err) => { if (err) console.warn('release error', err); }); } catch (e) {}
    try { device.close(); } catch (e) {}

  } catch (err) {
    console.error('Print attempt failed:', err && err.message ? err.message : err);
    console.warn('Falling back to mock file on Desktop.');
    const mockPath = path.join(os.homedir(), 'Desktop', 'send-raw-print-failed.txt');
    fs.writeFileSync(mockPath, `FAILED: ${err && err.message ? err.message : String(err)}`);
    console.log('Mock failure file written:', mockPath);
  }
}

tryPrint();
