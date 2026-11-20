import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  X, 
  RotateCcw, 
  Check, 
  Loader2, 
  Zap, 
  ZapOff, 
  SwitchCamera, 
  Image as ImageIcon,
  AlertCircle,
  Sparkles,
  Layers
} from 'lucide-react';
import { compressImage, extractWeightsFromImage, type OcrExtractionResult } from '../services/ocrService';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (data: {
    weight: string;
    image: string;
    allWeights?: string[];
  }) => void;
  targetBagIndex?: number;
  lotNumber?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  targetBagIndex,
  lotNumber
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrExtractionResult | null>(null);
  const [selectedWeight, setSelectedWeight] = useState<string>('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop camera tracks cleanly
  const stopTracks = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      setStream(null);
    }
  };

  // Start camera stream
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopTracks();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access not supported by this browser. Use photo upload below.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(e => console.warn('Video play note:', e));
      }

      // Check torch capability
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack.getCapabilities?.() || {}) as any;
        if (capabilities.torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }
      }
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      setCameraError('Unable to access device camera. Please check permissions or use device camera via upload.');
    }
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera(cameraFacing);
    } else {
      stopTracks();
    }

    return () => {
      stopTracks();
    };
  }, [isOpen, cameraFacing, capturedImage]);

  // Handle Torch Toggle
  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && (track.getCapabilities?.() as any)?.torch) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Failed to toggle torch:', e);
      }
    }
  };

  // Switch between front & rear camera
  const flipCamera = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    setTorchOn(false);
  };

  // Snap photo from video stream
  const takeSnapshot = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // Stop live stream to freeze
    stopTracks();

    await processCapturedImage(rawDataUrl);
  };

  // Handle file input selection (works on any mobile browser as native camera trigger)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopTracks();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        await processCapturedImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input
    e.target.value = '';
  };

  // Process captured image: compress + run OCR
  const processCapturedImage = async (dataUrl: string) => {
    setIsProcessing(true);
    setCapturedImage(dataUrl);
    setOcrResult(null);
    setSelectedWeight('');

    try {
      // 1. Compress image for compact storage (~50KB-100KB)
      const compressed = await compressImage(dataUrl, 1024, 0.75);
      setCapturedImage(compressed);

      // 2. Extract weights using OCR & Canvas analysis
      const result = await extractWeightsFromImage(compressed);
      setOcrResult(result);
      if (result.primaryWeight) {
        setSelectedWeight(result.primaryWeight);
      } else if (result.candidates.length > 0) {
        setSelectedWeight(result.candidates[0]);
      }
    } catch (err) {
      console.warn('Processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Discard and retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    setOcrResult(null);
    setSelectedWeight('');
    setIsProcessing(false);
    startCamera(cameraFacing);
  };

  // Confirm and apply weight
  const handleConfirm = () => {
    if (!capturedImage) return;

    // Format selected weight to 3 decimal places
    let finalWeight = selectedWeight.trim();
    const num = parseFloat(finalWeight);
    if (!isNaN(num) && num > 0) {
      finalWeight = (Math.round(num * 10) / 10).toFixed(3);
    }

    onCapture({
      weight: finalWeight,
      image: capturedImage,
      allWeights: ocrResult?.allWeights && ocrResult.allWeights.length > 1 ? ocrResult.allWeights : undefined
    });

    handleClose();
  };

  const handleClose = () => {
    stopTracks();
    setCapturedImage(null);
    setOcrResult(null);
    setSelectedWeight('');
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full h-full sm:h-auto sm:max-w-lg bg-slate-900 text-white sm:rounded-3xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh] overflow-hidden relative">
        
        {/* Hidden fallback file input with capture="environment" for native camera */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Top Header Bar */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>Scale Camera Scanner</span>
                {targetBagIndex !== undefined && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                    Bag #{targetBagIndex + 1}
                  </span>
                )}
              </h4>
              <p className="text-[10px] text-slate-400">
                {lotNumber ? `Lot ${lotNumber} • ` : ''}Snap weighing scale display to extract weight
              </p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 hover:bg-slate-700 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Camera Viewport / Photo Preview */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
          {!capturedImage ? (
            <>
              {/* Live Video Element */}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Target Guidelines */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="w-[85%] max-w-[340px] aspect-[4/3] border-2 border-dashed border-emerald-400/80 rounded-2xl relative shadow-lg bg-emerald-500/5 backdrop-blur-[0.5px]">
                  {/* Four Corner Accents */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                  
                  {/* Center Helper Text */}
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                    <span className="text-[11px] font-semibold text-emerald-200/90 bg-black/60 px-3 py-1 rounded-full border border-emerald-500/30 backdrop-blur-xs">
                      Align scale weight display inside frame
                    </span>
                  </div>
                </div>
              </div>

              {/* Camera Overlaid Quick Actions (Torch, Flip) */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2.5 rounded-full shadow-lg transition-all ${
                      torchOn ? 'bg-amber-400 text-slate-900' : 'bg-black/60 text-white hover:bg-black/80'
                    }`}
                    title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={flipCamera}
                  className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 shadow-lg transition-all cursor-pointer"
                  title="Flip Camera"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              </div>

              {/* Error fallback message if camera access blocked */}
              {cameraError && (
                <div className="absolute inset-x-4 top-4 p-3 bg-rose-950/90 border border-rose-700 text-rose-200 text-xs rounded-xl flex items-start gap-2 shadow-xl z-20">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Camera Notice</p>
                    <p className="text-[11px] text-rose-300 mt-0.5">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Use Native Mobile Camera
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Captured Photo Preview */}
              <img 
                src={capturedImage} 
                alt="Captured Scale" 
                className="w-full h-full object-contain max-h-[380px]" 
              />

              {/* OCR Processing overlay */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-20 animate-fade-in">
                  <Loader2 className="h-9 w-9 text-emerald-400 animate-spin mb-3" />
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
                    Analyzing Scale Image...
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Reading digits and detecting weight values
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Section: Controls & Extracted Weight Review */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0 space-y-3">
          {!capturedImage ? (
            /* Live Camera Controls */
            <div className="flex items-center justify-around py-1">
              {/* Secondary Upload / Gallery Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-all cursor-pointer"
                title="Choose photo from device or open camera app"
              >
                <div className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold">Gallery/App</span>
              </button>

              {/* Main Shutter Capture Button */}
              <button
                type="button"
                onClick={takeSnapshot}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer bg-white/20 active:bg-emerald-500"
                title="Take Picture"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white active:bg-emerald-400 transition-all flex items-center justify-center">
                  <Camera className="h-6 w-6 text-slate-900" />
                </div>
              </button>

              {/* Retake / Cancel Button */}
              <button
                type="button"
                onClick={handleClose}
                className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <div className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700">
                  <X className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold">Cancel</span>
              </button>
            </div>
          ) : (
            /* Photo Review & Weight Confirmation View */
            <div className="space-y-3 animate-fade-in">
              {/* Extracted Weight Metric Display */}
              <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Extracted Scale Weight</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Image Stored in DB
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      inputMode="decimal"
                      value={selectedWeight}
                      onChange={(e) => setSelectedWeight(e.target.value)}
                      placeholder="e.g. 48.200"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/60 rounded-xl text-lg sm:text-xl font-black font-mono text-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 text-center"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                      kg
                    </span>
                  </div>
                </div>

                {/* Detected Candidates Chips */}
                {ocrResult && ocrResult.candidates.length > 0 && (
                  <div className="pt-1 border-t border-slate-700/60 space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold block">
                      Detected number candidates (tap to select):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ocrResult.candidates.map((cand, idx) => (
                        <button
                          key={`cand-${idx}`}
                          type="button"
                          onClick={() => setSelectedWeight(cand)}
                          className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                            selectedWeight === cand
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {cand} kg
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multi-bag Detection Notification if applicable */}
                {ocrResult && ocrResult.allWeights && ocrResult.allWeights.length > 1 && (
                  <div className="p-2 bg-indigo-950/50 border border-indigo-800/60 rounded-xl flex items-center justify-between text-xs text-indigo-300">
                    <span className="flex items-center gap-1.5 font-medium text-[11px]">
                      <Layers className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span>Detected {ocrResult.allWeights.length} bag weights in sheet!</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-indigo-200 bg-indigo-900/60 px-2 py-0.5 rounded">
                      {ocrResult.allWeights.length} bags
                    </span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retake Photo</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedWeight || parseFloat(selectedWeight) <= 0}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Use This Weight</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
