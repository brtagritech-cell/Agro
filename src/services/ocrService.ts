/**
 * OCR & Image Processing Service for Weighing Scales & APMC Mandi Slips
 * Extracts weights from digital scale screens or printed weighing receipts (slips).
 * Supports single bag digital scales as well as 30+ bag multi-column thermal print receipts.
 */

export interface OcrExtractionResult {
  primaryWeight: string; // Formatted weight, e.g. "30.500"
  candidates: string[];  // All candidate weights detected
  allWeights: string[];  // Multiple weights detected (if scanning multi-bag slip/receipt)
  totalBagsDetected?: number; // Total bags if printed on receipt (e.g. 30)
  reportedGrossWeight?: number; // Reported gross wt on receipt (e.g. 1141.900)
  rawText: string;       // Raw detected text
  isReceiptSlip: boolean; // True if multi-bag receipt structure was recognized
}

/**
 * Resizes and compresses an image to an optimized JPEG data URL (~50KB-120KB)
 * for fast database storage and low bandwidth while preserving digit readability.
 */
export async function compressImage(
  source: string | Blob | File,
  maxDimension = 1400,
  quality = 0.82
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
 * Handles single scale screens as well as printed multi-column weighing receipts.
 */
export function extractWeightsFromText(text: string): {
  primary: string;
  candidates: string[];
  all: string[];
  totalBagsDetected?: number;
  reportedGrossWeight?: number;
  isReceiptSlip: boolean;
} {
  const cleaned = cleanOcrText(text);

  // Check if receipt has printed metadata
  let totalBagsDetected: number | undefined;
  const bagsMatch = cleaned.match(/(?:TOTAL|ACTUAL)\s*(?:NO\s*OF\s*)?BAGS\s*[:\-\=]?\s*(\d+)/i);
  if (bagsMatch) {
    totalBagsDetected = parseInt(bagsMatch[1], 10);
  }

  let reportedGrossWeight: number | undefined;
  const grossMatch = cleaned.match(/Gross\s*wt\s*[:\-\=]?\s*(\d+(?:\.\d+)?)/i);
  if (grossMatch) {
    reportedGrossWeight = parseFloat(grossMatch[1]);
  }

  // --- STRATEGY 1: Serial Numbered Bags from Weighbridge Slips ---
  // Matches patterns like "01) 30.500", "02) 33.000", "1) 30.500", "01. 30.500", "01: 30.500", "01] 30.500"
  const serialRegex = /(?:^|\s)(?:S\.?\s*No)?\s*0*([1-9]\d{0,2})\s*[\)\.\:\-\]]\s*(\d{2,3}(?:\.\d{1,3})?)/gi;
  const bagMap = new Map<number, string>();
  let sm: RegExpExecArray | null;

  while ((sm = serialRegex.exec(cleaned)) !== null) {
    const sNo = parseInt(sm[1], 10);
    const weightVal = parseFloat(sm[2]);
    // Agricultural spice bag weights typically range between 12.0 kg and 75.0 kg
    if (sNo >= 1 && sNo <= 300 && weightVal >= 12 && weightVal <= 75) {
      const rounded = Math.round(weightVal * 10) / 10;
      bagMap.set(sNo, rounded.toFixed(3));
    }
  }

  if (bagMap.size >= 2) {
    const maxSNo = Math.max(...bagMap.keys());
    const bagsCount = totalBagsDetected && totalBagsDetected >= maxSNo ? totalBagsDetected : maxSNo;
    const slipBags: string[] = [];

    for (let i = 1; i <= bagsCount; i++) {
      if (bagMap.has(i)) {
        slipBags.push(bagMap.get(i)!);
      } else {
        // Fallback placeholder if a middle number was missed
        slipBags.push('00.000');
      }
    }

    return {
      primary: slipBags[0] || '',
      candidates: Array.from(bagMap.values()),
      all: slipBags,
      totalBagsDetected,
      reportedGrossWeight,
      isReceiptSlip: true
    };
  }

  // --- STRATEGY 2: Sequential Decimal Weights in Bag Range ---
  // If serial numbers weren't explicitly captured, find all valid decimal weights
  const lines = cleaned.split('\n');
  const sequentialWeights: string[] = [];
  const candidateScores: { value: number; str: string; score: number }[] = [];

  for (const line of lines) {
    // Skip lines with keywords like Gross, Lot, Rate, Deductions, etc.
    if (/(?:lot|rate|gross|net|deduction|hamali|weighmen|sweeper|total\s*wt)/i.test(line)) {
      continue;
    }

    const lineRegex = /(?:^|[^\d.])(\d{2,3}(?:\.\d{1,3})?)\s*(?:kg)?(?=[^\d.]|$)/gi;
    let lm: RegExpExecArray | null;
    while ((lm = lineRegex.exec(line)) !== null) {
      const val = parseFloat(lm[1]);
      // Filter out non-bag weights (e.g. rate 10000, lot numbers, or < 12kg)
      if (!isNaN(val) && val >= 15 && val <= 70) {
        const rounded = Math.round(val * 10) / 10;
        const formatted = rounded.toFixed(3);
        sequentialWeights.push(formatted);

        let score = 50;
        if (val >= 25 && val <= 62) score += 30;
        if (lm[1].includes('.')) score += 20;
        candidateScores.push({ value: val, str: formatted, score });
      }
    }
  }

  if (sequentialWeights.length >= 2) {
    return {
      primary: sequentialWeights[0],
      candidates: Array.from(new Set(sequentialWeights)),
      all: sequentialWeights,
      totalBagsDetected: totalBagsDetected || sequentialWeights.length,
      reportedGrossWeight,
      isReceiptSlip: true
    };
  }

  // --- STRATEGY 3: Single Scale Display Extraction ---
  // Match single bag weights (like 52.400 kg from a digital scale LED screen)
  const singleRegex = /(?:^|[^\d.])(\d{1,3}(?:\.\d{1,3})?)\s*(?:kg|kgs|kilo)?(?=[^\d.]|$)/gi;
  const singleMatches: { value: number; str: string; score: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = singleRegex.exec(cleaned)) !== null) {
    const rawValStr = m[1];
    const num = parseFloat(rawValStr);
    if (isNaN(num) || num <= 0 || num > 95) continue;

    let score = 10;
    if (num >= 20 && num <= 62) score += 50;
    else if (num >= 10 && num <= 75) score += 30;

    if (rawValStr.includes('.')) score += 30;
    if (/^\d+\.[0-9]0*$/.test(rawValStr)) score += 20;

    singleMatches.push({ value: num, str: rawValStr, score });
  }

  singleMatches.sort((a, b) => b.score - a.score);
  const uniqueCandidates: string[] = [];
  for (const sm of singleMatches) {
    const rounded = (Math.round(sm.value * 10) / 10).toFixed(3);
    if (!uniqueCandidates.includes(rounded)) {
      uniqueCandidates.push(rounded);
    }
  }

  return {
    primary: uniqueCandidates[0] || '',
    candidates: uniqueCandidates,
    all: sequentialWeights.length > 0 ? sequentialWeights : uniqueCandidates,
    totalBagsDetected,
    reportedGrossWeight,
    isReceiptSlip: false
  };
}

/**
 * Attempts text detection using browser native TextDetector API if available.
 */
async function detectWithNativeTextDetector(canvas: HTMLCanvasElement): Promise<string> {
  try {
    if (typeof window !== 'undefined' && 'TextDetector' in window) {
      const detector = new (window as any).TextDetector();
      const detected = await detector.detect(canvas);
      if (detected && detected.length > 0) {
        return detected.map((d: any) => d.rawValue || '').join('\n');
      }
    }
  } catch (err) {
    console.warn('Native TextDetector failed or not supported:', err);
  }
  return '';
}

/**
 * Dynamically loads Tesseract.js from CDN if online and available.
 */
let tesseractPromise: Promise<any> | null = null;
function loadTesseractCDN(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);

  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    // If offline, don't stall
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      reject(new Error('Device is offline, skipping external OCR download'));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      if ((window as any).Tesseract) {
        resolve((window as any).Tesseract);
      } else {
        reject(new Error('Tesseract script loaded but global object not found'));
      }
    };
    script.onerror = (e) => {
      tesseractPromise = null;
      reject(e);
    };
    document.head.appendChild(script);

    // Timeout after 8 seconds so we never block the UI
    setTimeout(() => {
      if (!(window as any).Tesseract) {
        reject(new Error('Tesseract CDN load timeout'));
      }
    }, 8000);
  });

  return tesseractPromise;
}

/**
 * Runs OCR on an image (dataUrl or canvas) to extract bag weights from scale or receipt.
 */
export async function extractWeightsFromImage(imageDataUrl: string): Promise<OcrExtractionResult> {
  let detectedText = '';

  return new Promise(async (resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
        img.src = imageDataUrl;
      });

      // Prepare canvas with image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);

        // 1. Try Native TextDetector first (instantaneous on Chrome/Android)
        const nativeText = await detectWithNativeTextDetector(canvas);
        if (nativeText && nativeText.trim()) {
          detectedText += '\n' + nativeText;
        }

        // 2. Try online Tesseract.js if available or if native text was minimal
        if (!detectedText.trim() || detectedText.length < 20) {
          try {
            const Tesseract = await loadTesseractCDN();
            if (Tesseract && Tesseract.recognize) {
              const res = await Tesseract.recognize(canvas, 'eng', {
                logger: () => {}
              });
              if (res && res.data && res.data.text) {
                detectedText += '\n' + res.data.text;
              }
            }
          } catch (tessErr) {
            console.log('Tesseract CDN note:', tessErr);
          }
        }
      }

      // 3. Extract weights from detected text
      const parsed = extractWeightsFromText(detectedText);

      resolve({
        primaryWeight: parsed.primary,
        candidates: parsed.candidates,
        allWeights: parsed.all,
        totalBagsDetected: parsed.totalBagsDetected,
        reportedGrossWeight: parsed.reportedGrossWeight,
        rawText: detectedText.trim(),
        isReceiptSlip: parsed.isReceiptSlip
      });
    } catch (err) {
      console.warn('Error during weight extraction from image:', err);
      resolve({
        primaryWeight: '',
        candidates: [],
        allWeights: [],
        rawText: '',
        isReceiptSlip: false
      });
    }
  });
}
