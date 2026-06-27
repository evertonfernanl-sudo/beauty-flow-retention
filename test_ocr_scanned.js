import fs from 'fs';
import { getDocumentProxy, extractText, extractImages } from 'unpdf';
import { createWorker } from 'tesseract.js';
import * as path from 'path';

const filePath = 'C:/Users/Analista Agendamento/Downloads/WhatsApp Scan 2026-06-19 at 10.42.11.pdf';

function resizeImageRGBA(rgbaData, width, height, maxDim = 1500) {
  if (width <= maxDim && height <= maxDim) {
    return { data: rgbaData, width, height };
  }
  const scale = Math.min(maxDim / width, maxDim / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; y++) {
    const srcY = Math.min(Math.floor(y / scale), height - 1);
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.min(Math.floor(x / scale), width - 1);
      const dstIdx = (y * newWidth + x) * 4;
      const srcIdx = (srcY * width + srcX) * 4;
      newData[dstIdx] = rgbaData[srcIdx];
      newData[dstIdx + 1] = rgbaData[srcIdx + 1];
      newData[dstIdx + 2] = rgbaData[srcIdx + 2];
      newData[dstIdx + 3] = rgbaData[srcIdx + 3];
    }
  }
  return { data: newData, width: newWidth, height: newHeight };
}

function convertToBMP32(rgbaData, width, height) {
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const headerSize = fileHeaderSize + dibHeaderSize;
  const imageSize = width * height * 4;
  const fileSize = headerSize + imageSize;
  const buffer = Buffer.alloc(fileSize);
  
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(headerSize, 10);
  
  buffer.writeUInt32LE(dibHeaderSize, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(-height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(32, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(imageSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);
  
  let dstIdx = headerSize;
  for (let srcIdx = 0; srcIdx < rgbaData.length; srcIdx += 4) {
    buffer[dstIdx] = rgbaData[srcIdx + 2];
    buffer[dstIdx + 1] = rgbaData[srcIdx + 1];
    buffer[dstIdx + 2] = rgbaData[srcIdx];
    buffer[dstIdx + 3] = rgbaData[srcIdx + 3];
    dstIdx += 4;
  }
  return buffer;
}

const convertToRGBA = (image) => {
  const { data: imgData, width: w, height: h, channels: ch } = image;
  if (ch === 4) {
    return { data: new Uint8ClampedArray(imgData), width: w, height: h };
  }
  const rgbaData = new Uint8ClampedArray(w * h * 4);
  let srcIdx = 0;
  let dstIdx = 0;
  for (let p = 0; p < w * h; p++) {
    if (ch === 3) {
      rgbaData[dstIdx] = imgData[srcIdx];
      rgbaData[dstIdx + 1] = imgData[srcIdx + 1];
      rgbaData[dstIdx + 2] = imgData[srcIdx + 2];
      rgbaData[dstIdx + 3] = 255;
      srcIdx += 3;
    } else if (ch === 1) {
      const val = imgData[srcIdx];
      rgbaData[dstIdx] = val;
      rgbaData[dstIdx + 1] = val;
      rgbaData[dstIdx + 2] = val;
      rgbaData[dstIdx + 3] = 255;
      srcIdx += 1;
    }
    dstIdx += 4;
  }
  return { data: rgbaData, width: w, height: h };
};

async function testFile() {
  if (!fs.existsSync(filePath)) return;
  console.log(`Testing file: ${filePath}`);
  const buf = new Uint8Array(fs.readFileSync(filePath));
  
  try {
    const pdf = await getDocumentProxy(buf);
    console.log(`Number of pages: ${pdf.numPages}`);
    
    let worker = await createWorker("por");
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const pageImages = await extractImages(pdf, i);
      if (pageImages && pageImages.length > 0) {
        for (let idx = 0; idx < pageImages.length; idx++) {
          const img = pageImages[idx];
          const rgbaImg = convertToRGBA(img);
          const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 1500);
          const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
          
          const tempFilename = `temp_ocr_scan_p${i}_img${idx}.bmp`;
          const tempPath = path.join(process.cwd(), tempFilename);
          fs.writeFileSync(tempPath, bmpBuffer);
          
          try {
            const { data: { text: pageText } } = await worker.recognize(tempPath);
            console.log("=== OCR RESULT ===");
            console.log(pageText);
            console.log("==================");
          } finally {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        }
      }
    }
    await worker.terminate();
  } catch (err) {
    console.error("OCR failed:", err);
  }
}

testFile().catch(console.error);
