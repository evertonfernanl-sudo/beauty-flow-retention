import fs from 'fs';
import { extractText, getDocumentProxy } from 'unpdf';

async function run() {
  const filePath = 'C:/Users/Analista Agendamento/Downloads/document.pdf';
  if (!fs.existsSync(filePath)) {
    console.error("Test PDF file does not exist at:", filePath);
    process.exit(1);
  }

  console.log("Reading PDF file from:", filePath);
  
  const buf = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  
  console.log(`Number of pages: ${pdf.numPages}`);
  console.log(`Digital text extracted length: ${fullText.trim().length}`);
  if (fullText.trim().length > 0) {
    console.log("=== SAMPLE OF TEXT ===");
    console.log(fullText.substring(0, 300));
    console.log("======================");
  } else {
    console.log("This is a scanned PDF (no digital text layer).");
  }
}

run().catch(console.error);
