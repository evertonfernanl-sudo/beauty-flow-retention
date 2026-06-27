import fs from 'fs';
import { getDocumentProxy, extractText, extractImages } from 'unpdf';
import * as path from 'path';

const filePaths = [
  'C:/Users/Analista Agendamento/Downloads/comprovante2026-06-26_183302.pdf'
];

async function testFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log(`Testing file: ${filePath}`);
  
  try {
    const Tesseract = await import("tesseract.js");
    console.log("Tesseract keys:", Object.keys(Tesseract));
    if (Tesseract.default) {
      console.log("Tesseract.default keys:", Object.keys(Tesseract.default));
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testFile(filePaths[0]).catch(console.error);
