/**
 * OCR & Image Processing Service for Weighing Scales
 * Extracts weights from digital scale screens, slips, or meters.
 * Works offline with built-in canvas analysis & 7-segment recognition,
 * and leverages native TextDetector or dynamic Tesseract when available.
 */

export interface OcrExtractionResult {
  primaryWeight: string; // Formatted weight, e.g. "48.200"
  candidates: string[];  // All candidate weights detected
  allWeights: string[];  // Multiple weights detected (if scanning multi-bag slip/sheet)
  rawText: string;       // Raw detected text
}

/**
 * Resizes and compresses an image to an optimized JPEG data URL (~50KB-100KB)
 * for fast database storage and low bandwidth.
 */
export async function compressImage(
  source: string | Blob | File,
  maxDimension = 1024,
  quality = 0.75
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
 * Normalizes common OCR misreadings of digits, especially for 7-segment or LED displays.
 */
function cleanOcrText(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Replace typical OCR letter-to-number confusions when near numbers or decimal points
  text = text.replace(/([0-9])\s*([oO])\b/g, '$10');
  text = text.replace(/\b([oO])\s*([0-9])/g, '0$2');
  text = text.replace(/([0-9])\s*([sS])\b/g, '$15');
  text = text.replace(/([0-9])\s*([bB])\b/g, '$18');
  text = text.replace(/([0-9])\s*([lI|])\s*([0-9])/g, '$11$3');

  // Commas between digits are often decimal points on scales: "48,20" -> "48.20"
  text = text.replace(/(\d+),(\d+)/g, '$1.$2');

  return text;
}

/**
 * Parses numbers from text and identifies probable bag weights.
 * Agricultural spice bag weights typically range between 5.0 kg and 70.0 kg.
 */
export function extractWeightsFromText(text: string): { primary: string; candidates: string[]; all: string[] } {
  const cleaned = cleanOcrText(text);

  // Match decimal patterns like 50.200, 48.2, 52.00, or integers like 48, 52
  // Also matches trailing kg / KG
  const regex = /(?:^|[^\d.])(\d{1,3}(?:\.\d{1,3})?)\s*(?:kg|kgs|kilo|kilograms)?(?=[^\d.]|$)/gi;
  const matches: { value: number; str: string; hasDecimal: boolean; score: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    const rawValStr = match[1];
    const num = parseFloat(rawValStr);
    
    // Ignore invalid, zero, or typical non-weight numbers (like lot numbers >= 100 or dates)
    if (isNaN(num) || num <= 0 || num > 95) continue;
    
    // Skip if looks like a year, lot ID, or rate (e.g. > 100)
    const hasDecimal = rawValStr.includes('.');
    
    // Score based on likelihood of being a bag weight:
    // Typical spice bag weight is between 25 kg and 62 kg
    let score = 0;
    if (num >= 20 && num <= 62) score += 50;
    else if (num >= 10 && num <= 75) score += 30;
    else score += 10;

    if (hasDecimal) score += 30;
    
    // Reward weights ending in .0, .1, .2 ... .9 (standard weighing scale graduations)
    if (hasDecimal && /^\d+\.[0-9]0*$/.test(rawValStr)) {
      score += 20;
    }

    matches.push({ value: num, str: rawValStr, hasDecimal, score });
  }

  // Also check line-by-line if there are numbers written in rows
  const lines = cleaned.split('\n');
  const lineWeights: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const lineMatch = trimmed.match(/(\d{1,3}(?:\.\d{1,3})?)/);
    if (lineMatch) {
      const val = parseFloat(lineMatch[1]);
      if (!isNaN(val) && val >= 5 && val <= 75) {
        const rounded = Math.round(val * 10) / 10;
        lineWeights.push(rounded.toFixed(3));
      }
    }
  }

  // Sort matches by score descending
  matches.sort((a, b) => b.score - a.score);

  const uniqueCandidates: string[] = [];
  for (const m of matches) {
    const val = m.value;
    const rounded = Math.round(val * 10) / 10;
    const formatted = rounded.toFixed(3);
    if (!uniqueCandidates.includes(formatted)) {
      uniqueCandidates.push(formatted);
    }
  }

  const primary = uniqueCandidates.length > 0 ? uniqueCandidates[0] : '';
  const all = lineWeights.length > 1 ? lineWeights : uniqueCandidates;

  return {
    primary,
    candidates: uniqueCandidates,
    all
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

    // Timeout after 6 seconds so we never block the UI
    setTimeout(() => {
      if (!(window as any).Tesseract) {
        reject(new Error('Tesseract CDN load timeout'));
      }
    }, 6000);
  });

  return tesseractPromise;
}

/**
 * Runs OCR on an image (dataUrl or canvas) to extract bag weights.
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

        // 2. Try online Tesseract.js if available
        if (!detectedText.trim()) {
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
        rawText: detectedText.trim()
      });
    } catch (err) {
      console.warn('Error during weight extraction from image:', err);
      // Fallback with empty result rather than throwing
      resolve({
        primaryWeight: '',
        candidates: [],
        allWeights: [],
        rawText: ''
      });
    }
  });
}
