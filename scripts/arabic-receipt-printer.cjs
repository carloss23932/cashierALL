const usb = require('usb');
const iconv = require('iconv-lite');
const arabicReshaper = require('arabic-reshaper');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ESC/POS Commands for XPrinter XP-80
const ESC = '\x1B';
const GS = '\x1D';
const NUL = '\x00';

const INIT_PRINTER = ESC + '@';
const CUT_PAPER = GS + 'V' + '\x00';
const ALIGN_LEFT = ESC + 'a' + '\x00';
const ALIGN_CENTER = ESC + 'a' + '\x01';
const ALIGN_RIGHT = ESC + 'a' + '\x02';
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';

// Arabic charset for XPrinter (try ISO-8859-6 for better Arabic support)
const SET_ARABIC_CHARSET = ESC + 't' + '\x28'; // ISO-8859-6 (ISO Arabic)
const ENABLE_ARABIC_PRINTING = ESC + 'p' + '\x01'; // Enable Arabic printing mode (if supported)
const SET_RTL_MODE = ESC + 'U' + '\x01'; // Set RTL printing mode (if supported)
const DISABLE_CHINESE = '\x1C\x2E';

/**
 * Arabic Text Processor for ESC/POS Thermal Printers
 * Handles Arabic shaping, RTL layout, and proper encoding
 */
class ArabicReceiptPrinter {
  constructor() {
    this.paperWidth = 48; // Characters for 80mm paper
    this.separator = '-'.repeat(this.paperWidth);
  }

  /**
   * Process Arabic text for thermal printing
   * @param {string} text - Arabic text to process
   * @returns {Buffer} - Encoded buffer ready for printer
   */
  processArabicText(text) {
    try {
      // Step 1: Reshape Arabic text (connect letters properly)
      const reshaped = arabicReshaper.reshape(text);

      // Step 2: For RTL printers, we may not need to reverse if printer handles RTL natively
      // Try without reversing first
      const rtlText = reshaped; // Remove reverse to test native RTL support

      // Step 3: Encode using ISO-8859-6 (ISO Arabic - comprehensive Arabic support)
      return iconv.encode(rtlText, 'iso-8859-6');
    } catch (error) {
      console.warn('Arabic processing failed, using fallback:', error.message);
      // Fallback: simple text without reshaping
      return iconv.encode(text, 'iso-8859-6');
    }
  }

  /**
   * Create formatted table row for Arabic text
   * @param {string} name - Product name (Arabic)
   * @param {number} qty - Quantity
   * @param {number} price - Unit price
   * @param {number} total - Total price
   * @returns {Buffer} - Formatted row buffer
   */
  createTableRow(name, qty, price, total) {
    const nameLen = 23;
    const qtyLen = 5;
    const priceLen = 8;
    const totalLen = 10;

    // Process Arabic product name
    const processedName = this.processArabicText(name.toString());
    const nameStr = processedName.toString('iso-8859-6').padEnd(nameLen);

    // Format numbers (LTR)
    const qtyStr = qty.toString().padStart(qtyLen);
    const priceStr = price.toString().padStart(priceLen);
    const totalStr = total.toString().padStart(totalLen);

    // For RTL layout: name first, then numbers
    const line = `${nameStr}${qtyStr}${priceStr}${totalStr}\n`;

    return Buffer.from(line, 'iso-8859-6');
  }

  /**
   * Create formatted total line for Arabic text
   * @param {string} label - Label in Arabic
   * @param {number} value - Numeric value
   * @returns {Buffer} - Formatted line buffer
   */
  createTotalLine(label, value) {
    const labelStr = `${label}:`;
    const valueStr = value.toString();
    const padding = this.paperWidth - labelStr.length - valueStr.length;

    // RTL layout: value first, then label
    const line = valueStr + ' '.repeat(Math.max(0, padding)) + labelStr + '\n';

    // Process Arabic parts
    const processedLabel = this.processArabicText(labelStr);
    const labelPart = processedLabel.toString('iso-8859-6');

    return Buffer.from(valueStr + ' '.repeat(Math.max(0, padding)) + labelPart + '\n', 'iso-8859-6');
  }

  /**
   * Generate complete receipt buffer
   * @param {Object} receiptData - Receipt data structure
   * @returns {Buffer} - Complete ESC/POS command buffer
   */
  generateReceipt(receiptData) {
    const commands = [];

    // Initialize printer
    commands.push(Buffer.from(INIT_PRINTER, 'ascii'));
    commands.push(Buffer.from(DISABLE_CHINESE, 'ascii'));
    commands.push(Buffer.from(SET_ARABIC_CHARSET, 'ascii'));
    commands.push(Buffer.from(ENABLE_ARABIC_PRINTING, 'ascii'));
    commands.push(Buffer.from(SET_RTL_MODE, 'ascii'));

    // Store header (centered)
    commands.push(Buffer.from(ALIGN_CENTER, 'ascii'));
    commands.push(Buffer.from(BOLD_ON, 'ascii'));
    commands.push(this.processArabicText(receiptData.store.name));
    commands.push(Buffer.from(BOLD_OFF + '\n', 'ascii'));

    if (receiptData.store.address) {
      commands.push(this.processArabicText(receiptData.store.address));
      commands.push(Buffer.from('\n', 'ascii'));
    }

    if (receiptData.store.phone) {
      commands.push(this.processArabicText(`هاتف: ${receiptData.store.phone}`));
      commands.push(Buffer.from('\n', 'ascii'));
    }

    commands.push(Buffer.from('\n', 'ascii'));

    // Invoice header
    commands.push(Buffer.from(ALIGN_LEFT, 'ascii'));
    commands.push(this.processArabicText(`رقم الفاتورة: ${receiptData.invoice.number}`));
    commands.push(Buffer.from('\n', 'ascii'));

    commands.push(this.processArabicText(`التاريخ: ${receiptData.invoice.date} ${receiptData.invoice.time || ''}`));
    commands.push(Buffer.from('\n', 'ascii'));

    commands.push(this.processArabicText(`الكاشير: ${receiptData.invoice.cashier || 'غير محدد'}`));
    commands.push(Buffer.from('\n', 'ascii'));

    commands.push(Buffer.from(this.separator + '\n', 'ascii'));

    // Table header
    commands.push(this.createTableRow('الصنف', 'الكمية', 'السعر', 'الإجمالي'));
    commands.push(Buffer.from(this.separator + '\n', 'ascii'));

    // Items
    if (receiptData.invoice.items && receiptData.invoice.items.length > 0) {
      for (const item of receiptData.invoice.items) {
        commands.push(this.createTableRow(
          item.name || 'منتج غير محدد',
          item.qty || 0,
          item.price || 0,
          item.total || 0
        ));
      }
    } else {
      commands.push(this.processArabicText('لا توجد منتجات'));
      commands.push(Buffer.from('\n', 'ascii'));
    }

    commands.push(Buffer.from(this.separator + '\n', 'ascii'));

    // Totals
    commands.push(this.createTotalLine('المجموع الفرعي', receiptData.invoice.subtotal || 0));

    if (receiptData.invoice.discount) {
      commands.push(this.createTotalLine('الخصم', receiptData.invoice.discount));
    }

    commands.push(Buffer.from(BOLD_ON, 'ascii'));
    commands.push(this.createTotalLine('الإجمالي', receiptData.invoice.total || 0));
    commands.push(Buffer.from(BOLD_OFF, 'ascii'));

    if (receiptData.invoice.paymentMethod) {
      commands.push(Buffer.from('\n', 'ascii'));
      commands.push(this.createTotalLine('طريقة الدفع', receiptData.invoice.paymentMethod));
    }

    // Footer
    commands.push(Buffer.from('\n' + ALIGN_CENTER, 'ascii'));
    commands.push(this.processArabicText(receiptData.footer || 'شكراً لزيارتكم! 🌹'));
    commands.push(Buffer.from('\n\n\n\n', 'ascii'));

    // Cut paper
    commands.push(Buffer.from(CUT_PAPER, 'ascii'));

    return Buffer.concat(commands);
  }

  /**
   * Print receipt to USB thermal printer
   * @param {Object} receiptData - Receipt data
   * @returns {Promise<boolean>} - Success status
   */
  async printReceipt(receiptData) {
    const buffer = this.generateReceipt(receiptData);

    console.log('Starting print process...');

    try {
      // Find USB printer (XPrinter XP-80)
      const device = usb.findByIds(0x0483, 0x5740) || // Common XPrinter IDs
                    usb.findByIds(0x04b8, 0x0202) || // Epson
                    usb.findByIds(0x258a, 0x1007);   // Other thermal printers

      if (!device) {
        console.error('Printer not found - falling back to file');
        throw new Error('Printer not found');
      }

      console.log('Printer found, opening device...');
      device.open();
      const iface = device.interfaces[0];

      console.log('Claiming interface...');
      iface.claim();

      const endpoint = iface.endpoints.find(e => e.direction === 'out');
      if (!endpoint) {
        console.error('No OUT endpoint found');
        throw new Error('No OUT endpoint found');
      }

      console.log('Sending data to printer...');
      // Send main receipt buffer directly
      await new Promise((resolve, reject) => {
        endpoint.transfer(buffer, (err) => {
          if (err) {
            console.error('Transfer error:', err.message);
            reject(err);
          } else {
            console.log('Data sent successfully');
            resolve();
          }
        });
      });

      // Short delay to ensure printing completes
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('Cleaning up...');
      // Cleanup
      iface.release(true);
      device.close();

      console.log('Print completed successfully');
      return true;
    } catch (error) {
      console.error('Print failed:', error.message);

      // Fallback: save to file for Windows spooler
      const tempPath = path.join(os.tmpdir(), `receipt_${Date.now()}.bin`);
      fs.writeFileSync(tempPath, buffer);

      console.log('Fallback: saved receipt to', tempPath);
      return false;
    }
  }
}

// Example usage
async function testArabicPrinting() {
  const printer = new ArabicReceiptPrinter();

  const sampleReceipt = {
    store: {
      name: 'متجر الإلكترونيات الحديثة',
      address: 'العراق - بغداد - شارع الكرادة',
      phone: '07771234567'
    },
    invoice: {
      number: 'INV-2025-001',
      date: '2025-12-23',
      time: '14:30',
      cashier: 'أحمد محمد',
      items: [
        { name: 'كيبورد لابتوب', qty: 2, price: 25.000, total: 50.000 },
        { name: 'ماوس لاسلكي', qty: 1, price: 15.000, total: 15.000 },
        { name: 'سماعات بلوتوث', qty: 3, price: 30.000, total: 90.000 }
      ],
      subtotal: 155.000,
      discount: 10.000,
      total: 145.000,
      paymentMethod: 'نقدي'
    },
    footer: 'شكراً لتسوقكم معنا! 🌹'
  };

  const success = await printer.printReceipt(sampleReceipt);
  console.log('Print result:', success ? 'Success' : 'Failed (fallback used)');
}

// Export for use in Electron
module.exports = ArabicReceiptPrinter;

// Run test if called directly
if (require.main === module) {
  testArabicPrinting();
}