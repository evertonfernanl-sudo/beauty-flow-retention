import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const OCR_PROMPT_VERSION = "v3_ocr_vision_v1";
export const EXTRACTOR_VERSION = "v3.0.0";
export const MODEL_VERSION = "google/gemini-2.5-flash";

/**
 * Normalizes RGBA/RGB image channels to a standard RGBA array.
 */
function convertToRGBA(image: any) {
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
}

/**
 * Resizes RGBA image data to a maximum dimension while maintaining aspect ratio.
 */
function resizeImageRGBA(rgbaData: Uint8ClampedArray, width: number, height: number, maxDim = 1500) {
  if (width <= maxDim && height <= maxDim) {
    return { data: rgbaData, width, height };
  }
  const scale = Math.min(maxDim / width, maxDim / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const newData = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; y++) {
    const srcY = Math.min(Math.floor(y / scale), height - 1);
    const srcRow = srcY * width;
    const dstRow = y * newWidth;
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.min(Math.floor(x / scale), width - 1);
      const dstIdx = (dstRow + x) * 4;
      const srcIdx = (srcRow + srcX) * 4;
      newData[dstIdx] = rgbaData[srcIdx];
      newData[dstIdx + 1] = rgbaData[srcIdx + 1];
      newData[dstIdx + 2] = rgbaData[srcIdx + 2];
      newData[dstIdx + 3] = rgbaData[srcIdx + 3];
    }
  }
  return { data: newData, width: newWidth, height: newHeight };
}

/**
 * Encodes RGBA raw data to a 32-bit BMP buffer.
 */
function convertToBMP32(rgbaData: Uint8ClampedArray, width: number, height: number): Buffer {
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const headerSize = fileHeaderSize + dibHeaderSize;
  const imageSize = width * height * 4;
  const fileSize = headerSize + imageSize;
  const buffer = Buffer.alloc(fileSize);
  
  buffer.write("BM", 0);
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

/**
 * Calculates a SHA-256 hash for the composite cache key.
 */
export function calculateOcrCacheHash(
  fileHash: string,
  pageIndex: number,
  promptVersion: string,
  extractorVersion: string,
  modelVersion: string
): string {
  const compositeString = `${fileHash}_${pageIndex}_${promptVersion}_${extractorVersion}_${modelVersion}`;
  return crypto.createHash("sha256").update(compositeString).digest("hex");
}

function escapeCsvCell(val: string): string {
  const s = String(val ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Extract physical table lines from an image page of a PDF via Gemini Vision OCR.
 */
export async function extractOcrPageToCsv(
  sb: SupabaseClient,
  args: {
    pdfProxy: any;
    pageIndex: number;
    fileHash: string;
    companyId: string;
    importId: string;
  }
): Promise<{ csvLines: string; cacheHit: boolean; ocrTimeMs: number }> {
  const pageIdx = args.pageIndex;
  
  // 1. Calculate composite cache key
  const compositeHash = calculateOcrCacheHash(
    args.fileHash,
    pageIdx,
    OCR_PROMPT_VERSION,
    EXTRACTOR_VERSION,
    MODEL_VERSION
  );

  const startTime = Date.now();

  // 2. Check Database Cache
  try {
    const { data: cached, error: cacheReadErr } = await sb
      .from("v3_ocr_cache")
      .select("ocr_text")
      .eq("file_hash", compositeHash)
      .maybeSingle();

    if (!cacheReadErr && cached?.ocr_text) {
      console.log(`[SIE V3] OCR Cache Hit para página ${pageIdx} (Hash Composto: ${compositeHash})`);
      return {
        csvLines: cached.ocr_text,
        cacheHit: true,
        ocrTimeMs: Date.now() - startTime
      };
    }
  } catch (cacheErr: any) {
    console.warn(`[SIE V3] Exceção ao ler cache para página ${pageIdx}:`, cacheErr.message || cacheErr);
  }

  // 3. Extract Images from Page using unpdf
  const { extractImages } = await import("unpdf");
  let pageImages: any[] = [];
  try {
    pageImages = await extractImages(args.pdfProxy, pageIdx);
  } catch (err: any) {
    console.warn(`[SIE V3] Erro ao extrair imagens da página ${pageIdx}:`, err.message || err);
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("IA indisponível for OCR: LOVABLE_API_KEY ausente.");
  }

  const isTextFallback = !pageImages || pageImages.length === 0;
  let pageText = "";
  let pageCsv = "";

  if (isTextFallback) {
    console.log(`[SIE V3] Nenhuma imagem encontrada. Iniciando extração de texto nativo para a página ${pageIdx}...`);
    try {
      const page = await args.pdfProxy.getPage(pageIdx);
      const content = await page.getTextContent();
      const items = (content.items ?? []).map((it: any) => ({
        str: String(it.str),
        x: Array.isArray(it.transform) ? Math.round(Number(it.transform[4])) : 0,
        y: Array.isArray(it.transform) ? Math.round(Number(it.transform[5])) : 0,
      }));
      // Ordenar de cima para baixo, esquerda para a direita
      items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);
      
      let lines: string[] = [];
      let currentY: number | null = null;
      let currentLine: string[] = [];
      
      for (const item of items) {
        if (currentY === null || Math.abs(currentY - item.y) <= 3.0) {
          currentLine.push(`${item.str} (x:${item.x})`);
          currentY = currentY === null ? item.y : (currentY + item.y) / 2;
        } else {
          lines.push(currentLine.join(" "));
          currentLine = [`${item.str} (x:${item.x})`];
          currentY = item.y;
        }
      }
      if (currentLine.length) lines.push(currentLine.join(" "));
      pageText = lines.join("\n");
    } catch (textErr: any) {
      throw new Error(`Falha ao obter texto da página ${pageIdx} para fallback de OCR: ${textErr.message}`);
    }
  }

  console.log(`[SIE V3] Iniciando processamento LLM (${isTextFallback ? "Texto" : "Imagem/Vision"}) para página ${pageIdx}...`);

  let dataUrl = "";
  if (!isTextFallback) {
    const img = pageImages[0];
    const rgbaImg = convertToRGBA(img);
    const resizedImg = resizeImageRGBA(rgbaImg.data, rgbaImg.width, rgbaImg.height, 1500);
    const bmpBuffer = convertToBMP32(resizedImg.data, resizedImg.width, resizedImg.height);
    const base64Bmp = bmpBuffer.toString("base64");
    dataUrl = `data:image/bmp;base64,${base64Bmp}`;
  }

  const promptText = `Você é um analisador de documentos especialista em reconstruir tabelas de extrato bancário. Sua tarefa é transcrever todo o conteúdo visível nesta ${isTextFallback ? "página de texto" : "imagem"} diretamente em formato JSON.

A resposta deve ser um objeto JSON válido contendo uma lista de transações na chave "transactions":
{
  "transactions": [
    {
      "date": "Data no formato AAAA-MM-DD (ex: se no extrato estiver '05/06/2026', transcreva como '2026-06-05'). Se for apenas o dia do lançamento (ex: '05'), deduza o ano e o mês se houver no cabeçalho ou deixe vazio se for ambíguo.",
      "description": "Descrição da transação (ex: 'Compra no cartão')",
      "amount": "Valor total (com sinal e centavos, mantendo a vírgula original, ex: '150,00', '-9,62', ou vazio)",
      "debit": "Valor do débito se aplicável (ex: '150,00', ou vazio)",
      "credit": "Valor do crédito se aplicável (ex: '150,00', ou vazio)",
      "balance": "Saldo final após a transação (ex: '1500,00', ou vazio)",
      "doc": "Número do documento/autenticação se houver, ou vazio",
      "client_name": "Nome do cliente/contraparte se houver na linha, ou vazio",
      "cpf_cnpj": "CPF/CNPJ se houver na linha, ou vazio",
      "phone": "Telefone se houver na linha, ou vazio",
      "movement_type": "Tipo de movimentação (C, D, PIX, TED etc.) se disponível",
      "origin_lines": ["${pageIdx}:<linha_fisica>"]
    }
  ]
}

ATENÇÃO REGRAS OBRIGATÓRIAS:
1. Mantenha fidelidade absoluta a TODOS os caracteres e dígitos dos valores financeiros. Mantenha os centavos e decimais originais intactos usando vírgula (,) exatamente como no texto original (NUNCA altere centavos).
2. O campo 'origin_lines' deve ser obrigatoriamente um array de string com o formato ["${pageIdx}:linha_fisica"] representando a linha que você identificou (ex: se for a primeira linha de transação vista, '["${pageIdx}:1"]').
3. Transcreva cada linha de transação individualmente. Não faça resumos nem consolidações.
4. Retorne APENAS o JSON válido.`;

  const messages = [
    {
      role: "user",
      content: isTextFallback
        ? [
            {
              type: "text",
              text: `${promptText}\n\nTexto extraído do documento (com coordenadas X de auxílio):\n${pageText}`
            }
          ]
        : [
            {
              type: "text",
              text: promptText
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl
              }
            }
          ]
    }
  ];

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_VERSION,
      temperature: 0.0,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`Erro no AI Gateway (${aiRes.status}): ${errText.slice(0, 200)}`);
  }

  const aiJson = (await aiRes.json()) as { choices?: { message?: { content?: string } }[] };
  let rawContent = aiJson.choices?.[0]?.message?.content ?? "";
  
  rawContent = rawContent.trim();
  if (rawContent.startsWith("```")) {
    rawContent = rawContent.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
  }

  try {
    const parsed = JSON.parse(rawContent);
    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    
    const csvRows: string[] = [];
    csvRows.push("date;description;amount;debit;credit;balance;doc;client_name;cpf_cnpj;phone;movement_type;page;origin_lines");

    for (const t of transactions) {
      const dateVal = String(t.date ?? "").trim();
      const descVal = String(t.description ?? "").trim();
      const amountVal = String(t.amount ?? "").trim();
      const debitVal = String(t.debit ?? "").trim();
      const creditVal = String(t.credit ?? "").trim();
      const balanceVal = String(t.balance ?? "").trim();
      const docVal = String(t.doc ?? "").trim();
      const clientNameVal = String(t.client_name ?? "").trim();
      const cpfCnpjVal = String(t.cpf_cnpj ?? "").trim();
      const phoneVal = String(t.phone ?? "").trim();
      const movementTypeVal = String(t.movement_type ?? "").trim();
      const pageVal = String(pageIdx);
      
      let originLinesVal = "";
      if (Array.isArray(t.origin_lines)) {
        originLinesVal = JSON.stringify(t.origin_lines);
      } else if (t.origin_lines) {
        originLinesVal = JSON.stringify([String(t.origin_lines)]);
      } else {
        originLinesVal = JSON.stringify([`${pageIdx}:1`]);
      }

      const csvLine = [
        escapeCsvCell(dateVal),
        escapeCsvCell(descVal),
        escapeCsvCell(amountVal),
        escapeCsvCell(debitVal),
        escapeCsvCell(creditVal),
        escapeCsvCell(balanceVal),
        escapeCsvCell(docVal),
        escapeCsvCell(clientNameVal),
        escapeCsvCell(cpfCnpjVal),
        escapeCsvCell(phoneVal),
        escapeCsvCell(movementTypeVal),
        pageVal,
        escapeCsvCell(originLinesVal)
      ].join(";");
      csvRows.push(csvLine);
    }
    
    pageCsv = csvRows.join("\n");
  } catch (err: any) {
    console.error(`[SIE V3] Erro ao parsear JSON de OCR para página ${pageIdx}:`, err.message, rawContent);
    throw new Error(`Falha técnica na conversão da página ${pageIdx} para JSON: ${err.message}`);
  }

  // 4. Save to Cache database using composite hash
  if (pageCsv) {
    try {
      const { error: cacheWriteErr } = await sb.from("v3_ocr_cache").insert({
        file_hash: compositeHash,
        ocr_text: pageCsv
      });
      if (cacheWriteErr) {
        console.warn(`[SIE V3] Erro ao gravar cache de OCR para página ${pageIdx}:`, cacheWriteErr.message);
      }
    } catch (cacheWriteErr: any) {
      console.warn(`[SIE V3] Exceção ao gravar cache de OCR para página ${pageIdx}:`, cacheWriteErr.message || cacheWriteErr);
    }
  }

  return {
    csvLines: pageCsv,
    cacheHit: false,
    ocrTimeMs: Date.now() - startTime
  };
}
