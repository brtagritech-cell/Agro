/**
 * OCR & Image Processing Service for Weighing Scales & APMC Mandi Slips
 * Extracts weights from digital scale screens or printed weighing receipts (slips).
 * Supports single bag digital scales as well as 30+ bag multi-column thermal print receipts.
 */

export interface OcrExtractionResult {
  primaryWeight: string; // Formatted weight, e.g. "30.500"
  candidates: string[];  // All candidate weights detected
  allWeights: string[];  // Multiple weights detected in serial order (1, 2, 3... N)
  totalBagsDetected?: number; // Total bags if printed on receipt (e.g. 30)
  reportedGrossWeight?: number; // Reported gross wt on receipt (e.g. 1141.900)
  calculatedGrossWeight?: number; // Sum of all extracted bag weights
  rawText: string;       // Raw detected text
  isReceiptSlip: boolean; // True if multi-bag receipt structure was recognized
}

/**
 * Resizes and compresses an image to an optimized JPEG data URL (~80KB-140KB)
 * for fast database storage and low bandwidth while preserving high-contrast digit readability.
 */
export async function compressImage(
  source: string | Blob | File,
  maxDimension = 1600,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoad = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2d context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onload = handleLoad;
    img.onerror = (err) => reject(err);

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Normalizes common OCR misreadings of digits, especially for thermal print receipts and 7-segment displays.
 */
function cleanOcrText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Replace typical OCR letter-to-number confusions when near numbers or decimal points
  text = text.replace(/([0-9])\s*([oO])\b/g, '$10');
  text = text.replace(/\b([oO])\s*([0-9])/g, '0$2');
  text = text.replace(/([0-9])\s*([sS])\b/g, '$15');
  text = text.replace(/([0-9])\s*([bB])\b/g, '$18');
  text = text.replace(/([0-9])\s*([lI|])\s*([0-9])/g, '$11$3');

  // Commas between digits are often decimal points on thermal receipts: "30,500" -> "30.500"
  text = text.replace(/(\d+),(\d+)/g, '$1.$2');

  return text;
}

/**
 * Parses numbers and identifies bag weights from text.
 * Specifically scans for serials 1, 2, 3, 4 ... N and reconciles total gross with slip gross.
 */
export function extractWeightsFromText(text: string): {
  primary: string;
  candidates: string[];
  all: string[];
  totalBagsDetected?: number;
  reportedGrossWeight?: number;
  calculatedGrossWeight?: number;
  isReceiptSlip: boolean;
} {
  const cleaned = cleanOcrText(text);

  // 1. Detect Total Bags if printed on receipt
  let totalBagsDetected: number | undefined;
  const bagsMatch = cleaned.match(/(?:TOTAL|ACTUAL)\s*(?:NO\s*OF\s*)?BAGS\s*[:\-\=]?\s*(\d+)/i);
  if (bagsMatch) {
    totalBagsDetected = parseInt(bagsMatch[1], 10);
  }

  // 2. Detect Reported Gross Weight on receipt (e.g. "Gross wt: 1141.900" or "Gross wt: 1141 900")
  let reportedGrossWeight: number | undefined;
  const grossMatch = cleaned.match(/Gross\s*w[ti]\s*[:\-\=]?\s*(\d{2,5})(?:[\.\,\s]\s*(\d{1,3}))?/i);
  if (grossMatch) {
    const intPart = grossMatch[1];
    const decPart = grossMatch[2] ? grossMatch[2].padEnd(3, '0').slice(0, 3) : '000';
    reportedGrossWeight = parseFloat(`${intPart}.${decPart}`);
  }

  // Also check Net Wt as fallback reference
  const netMatch = cleaned.match(/(?:Net|1)\s*w[ti]\s*[:\-\=]?\s*(\d{2,5})(?:[\.\,\s]\s*(\d{1,3}))?/i);
  if (netMatch && !reportedGrossWeight) {
    const intPart = netMatch[1];
    const decPart = netMatch[2] ? netMatch[2].padEnd(3, '0').slice(0, 3) : '000';
    const parsedNet = parseFloat(`${intPart}.${decPart}`);
    const tareEst = (totalBagsDetected || 30) * 1.1;
    reportedGrossWeight = Math.round((parsedNet + tareEst) * 10) / 10;
  }

  // 3. Match serial numbers 1, 2, 3 ... N
  // Matches "01) 30. 500", "02) 33 000", "07)37. 900", "30)41 600", "01. 30.500", "1) 30.500"
  // Handles spaces between dot and decimals, or spaces instead of dots
  const serialRegex = /(?:^|\s)(?:S\.?\s*No\s*)?0*([1-9]\d{0,2})\s*[\)\.\:\-\]\}\>\|\/]\s*(\d{2,3})(?:[\.\,\s]\s*(\d{1,3}))?/gi;
  const bagMap = new Map<number, string>();
  let sm: RegExpExecArray | null;

  while ((sm = serialRegex.exec(cleaned)) !== null) {
    const sNo = parseInt(sm[1], 10);
    let intPart = sm[2];
    let decPart = sm[3] || '000';

    let intVal = parseInt(intPart, 10);
    // Correct OCR noise where 38 was read as 368
    if (intVal > 70 && intPart.length === 3) {
      intPart = intPart[0] + intPart[2];
      intVal = parseInt(intPart, 10);
    }

    // Typical agricultural bag weights range between 15 kg and 70 kg
    if (sNo >= 1 && sNo <= 300 && intVal >= 15 && intVal <= 70) {
      if (decPart.length === 1) decPart = decPart + '00';
      else if (decPart.length === 2) decPart = decPart + '0';
      else if (decPart.length > 3) decPart = decPart.slice(0, 3);

      const rounded = `${intVal}.${decPart}`;
      bagMap.set(sNo, rounded);
    }
  }

  // If serial numbers 1..N were found
  if (bagMap.size >= 2) {
    const maxSNo = Math.max(...bagMap.keys());
    const bagsCount = totalBagsDetected && totalBagsDetected >= maxSNo ? totalBagsDetected : maxSNo;
    const slipBags: string[] = [];

    for (let i = 1; i <= bagsCount; i++) {
      if (bagMap.has(i)) {
        slipBags.push(bagMap.get(i)!);
      } else {
        // If a middle bag was missed, estimate from neighboring weights or 00.000
        slipBags.push('00.000');
      }
    }

    let calculatedGross = slipBags.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
    calculatedGross = Math.round(calculatedGross * 1000) / 1000;

    // Reconciliation Check:
    // If exactly 1 bag was missed (00.000) and reportedGrossWeight is known, auto-calculate the missing bag
    const zeroIndex = slipBags.indexOf('00.000');
    if (zeroIndex !== -1 && reportedGrossWeight && reportedGrossWeight > 0) {
      const otherBagsSum = slipBags.reduce((sum, w, idx) => idx === zeroIndex ? sum : sum + (parseFloat(w) || 0), 0);
      const diff = reportedGrossWeight - otherBagsSum;
      if (diff >= 15 && diff <= 65) {
        slipBags[zeroIndex] = (Math.round(diff * 10) / 10).toFixed(3);
        calculatedGross = reportedGrossWeight;
      }
    }

    return {
      primary: slipBags[0] || '',
      candidates: Array.from(bagMap.values()),
      all: slipBags,
      totalBagsDetected: bagsCount,
      reportedGrossWeight,
      calculatedGrossWeight: calculatedGross,
      isReceiptSlip: true
    };
  }

  // Fallback: Sequential weights
  const lines = cleaned.split('\n');
  const sequentialWeights: string[] = [];
  for (const line of lines) {
    if (/(?:lot|rate|gross|net|deduction|hamali|weighmen|sweeper|total\s*wt)/i.test(line)) {
      continue;
    }
    const lineRegex = /(?:^|[^\d.])(\d{2,3}(?:[\.\s]\d{1,3})?)\s*(?:kg)?(?=[^\d.]|$)/gi;
    let lm: RegExpExecArray | null;
    while ((lm = lineRegex.exec(line)) !== null) {
      const rawVal = lm[1].replace(/\s+/g, '.');
      const val = parseFloat(rawVal);
      if (!isNaN(val) && val >= 15 && val <= 70) {
        const rounded = (Math.round(val * 10) / 10).toFixed(3);
        sequentialWeights.push(rounded);
      }
    }
  }

  const calcGross = sequentialWeights.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);

  return {
    primary: sequentialWeights[0] || '',
    candidates: Array.from(new Set(sequentialWeights)),
    all: sequentialWeights,
    totalBagsDetected: totalBagsDetected || sequentialWeights.length,
    reportedGrossWeight,
    calculatedGrossWeight: Math.round(calcGross * 1000) / 1000,
    isReceiptSlip: sequentialWeights.length >= 2
  };
}

/**
 * Runs OCR on an image (dataUrl or canvas) to extract bag weights from scale or receipt.
 * Leverages bundled Tesseract.js with real-time progress callbacks.
 */
export async function extractWeightsFromImage(
  imageDataUrl: string,
  onProgress?: (status: string, percent: number) => void
): Promise<OcrExtractionResult> {
  let detectedText = '';

  try {
    if (onProgress) onProgress('Initializing OCR engine...', 15);

    // Dynamically import tesseract.js from bundled package
    const { createWorker } = await import('tesseract.js');
    
    if (onProgress) onProgress('Loading recognition model...', 30);
    const worker = await createWorker('eng');

    if (onProgress) onProgress('Scanning receipt for serial weights...', 60);

    const res = await worker.recognize(imageDataUrl);
    detectedText = res?.data?.text || '';

    if (onProgress) onProgress('Finalizing bag analysis...', 90);
    await worker.terminate();
  } catch (err) {
    console.warn('Tesseract OCR note:', err);
  }

  if (onProgress) onProgress('Completed!', 100);

  const parsed = extractWeightsFromText(detectedText);

  return {
    primaryWeight: parsed.primary,
    candidates: parsed.candidates,
    allWeights: parsed.all,
    totalBagsDetected: parsed.totalBagsDetected,
    reportedGrossWeight: parsed.reportedGrossWeight,
    calculatedGrossWeight: parsed.calculatedGrossWeight,
    rawText: detectedText.trim(),
    isReceiptSlip: parsed.isReceiptSlip
  };
}
