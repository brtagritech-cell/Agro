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
  FileText,
  Plus,
  Trash2,
  ArrowRight
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
  initialMode?: 'camera' | 'gallery';
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  targetBagIndex,
  lotNumber,
  initialMode = 'camera'
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrExtractionResult | null>(null);
  const [selectedWeight, setSelectedWeight] = useState<string>('');
  const [multiBags, setMultiBags] = useState<string[]>([]);
  const [ocrStatus, setOcrStatus] = useState<string>('Analyzing image...');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
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
      setCameraError('Camera access not supported by this browser. Use gallery/photo upload below.');
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
        setHasTorch(Boolean(capabilities.torch));
      }
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      setCameraError('Unable to access device camera. Please check permissions or use device camera via Gallery/Upload.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialMode === 'gallery') {
        stopTracks();
        setTimeout(() => {
          fileInputRef.current?.click();
        }, 150);
      } else if (!capturedImage) {
        startCamera(cameraFacing);
      }
    } else {
      stopTracks();
    }

    return () => {
      stopTracks();
    };
  }, [isOpen, cameraFacing, capturedImage, initialMode]);

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
    
    stopTracks();
    await processCapturedImage(rawDataUrl);
  };

  // Handle file input selection (works on any mobile browser as gallery or camera trigger)
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
    e.target.value = '';
  };

  // Process captured/selected image: compress + run OCR
  const processCapturedImage = async (dataUrl: string) => {
    setIsProcessing(true);
    setCapturedImage(dataUrl);
    setOcrResult(null);
    setSelectedWeight('');
    setMultiBags([]);
    setOcrStatus('Preparing high-resolution image...');
    setOcrProgress(10);

    try {
      // 1. Compress image to clean JPEG (~90KB-140KB) preserving high-resolution print clarity
      const compressed = await compressImage(dataUrl, 1600, 0.85);
      setCapturedImage(compressed);

      // 2. Extract weights using OCR (handles both thermal slip receipts and digital scale screens)
      const result = await extractWeightsFromImage(compressed, (status, percent) => {
        setOcrStatus(status);
        setOcrProgress(percent);
      });
      setOcrResult(result);

      if (result.allWeights && result.allWeights.length > 1) {
        setMultiBags(result.allWeights);
      } else if (result.primaryWeight) {
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
    setMultiBags([]);
    setIsProcessing(false);
    startCamera(cameraFacing);
  };

  // Handle individual multi-bag weight edit in review table
  const handleMultiBagChange = (idx: number, val: string) => {
    setMultiBags(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const handleAddMultiBag = () => {
    setMultiBags(prev => [...prev, '00.000']);
  };

  const handleRemoveMultiBag = (idxToRemove: number) => {
    setMultiBags(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  // Confirm and apply weights
  const handleConfirm = () => {
    if (!capturedImage) return;

    // Check if multi-bag receipt
    if (multiBags.length > 1) {
      const formattedAll = multiBags.map(w => {
        const num = parseFloat(w);
        return isNaN(num) || num <= 0 ? '00.000' : (Math.round(num * 10) / 10).toFixed(3);
      });

      onCapture({
        weight: formattedAll[0] || '00.000',
        image: capturedImage,
        allWeights: formattedAll
      });
      handleClose();
      return;
    }

    // Single weight application
    let finalWeight = selectedWeight.trim();
    const num = parseFloat(finalWeight);
    if (!isNaN(num) && num > 0) {
      finalWeight = (Math.round(num * 10) / 10).toFixed(3);
    }

    onCapture({
      weight: finalWeight,
      image: capturedImage
    });

    handleClose();
  };

  const handleClose = () => {
    stopTracks();
    setCapturedImage(null);
    setOcrResult(null);
    setSelectedWeight('');
    setMultiBags([]);
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  // Calculate gross of multi-bags
  const multiGross = multiBags.reduce((sum, w) => sum + (parseFloat(w) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="w-full h-full sm:h-auto sm:max-w-xl bg-slate-900 text-white sm:rounded-3xl shadow-2xl flex flex-col max-h-[100dvh] sm:max-h-[92vh] overflow-hidden relative">
        
        {/* Hidden file input for Photo Gallery upload */}
        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*"
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
                <span>Weighing Slip & Scale Scanner</span>
                {targetBagIndex !== undefined && multiBags.length <= 1 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                    Bag #{targetBagIndex + 1}
                  </span>
                )}
              </h4>
              <p className="text-[10px] text-slate-400">
                {lotNumber ? `Lot ${lotNumber} • ` : ''}Take picture or select slip photo from Gallery
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

        {/* Mode Switcher Tabs (when not reviewing captured image) */}
        {!capturedImage && (
          <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700/60 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!stream) startCamera(cameraFacing);
              }}
              className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-600"
            >
              <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
              <span>Choose from Gallery</span>
            </button>
          </div>
        )}

        {/* Main Camera Viewport / Photo Preview */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[260px]">
          {!capturedImage ? (
            <>
              {/* Live Video Viewfinder */}
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Target Guidelines */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="w-[88%] max-w-[360px] aspect-[4/3] border-2 border-dashed border-emerald-400/80 rounded-2xl relative shadow-lg bg-emerald-500/5 backdrop-blur-[0.5px]">
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                  
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                    <span className="text-[11px] font-semibold text-emerald-200/90 bg-black/60 px-3 py-1 rounded-full border border-emerald-500/30 backdrop-blur-xs">
                      Align weighing slip or scale display within frame
                    </span>
                  </div>
                </div>
              </div>

              {/* Overlaid Camera Tools */}
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

              {/* Error fallback message */}
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
                      Choose Photo from Gallery
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
                alt="Captured Slip" 
                className="w-full h-full object-contain max-h-[340px]" 
              />

              {/* OCR Processing Overlay with Live Progress */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 z-20 animate-fade-in text-center">
                  <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-3" />
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <span>Analyzing Weighing Slip...</span>
                  </p>
                  <p className="text-xs text-slate-300 mt-1.5 font-medium">
                    {ocrStatus}
                  </p>
                  <div className="w-56 bg-slate-800 rounded-full h-2 mt-3.5 overflow-hidden border border-slate-700">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${ocrProgress || 35}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Section: Controls & Extracted Results Review */}
        <div className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 shrink-0 space-y-3">
          {!capturedImage ? (
            /* Live Camera Controls */
            <div className="flex items-center justify-around py-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-all cursor-pointer"
                title="Choose photo from device gallery"
              >
                <div className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700">
                  <ImageIcon className="h-5 w-5 text-indigo-400" />
                </div>
                <span className="text-[10px] font-semibold">Gallery</span>
              </button>

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
          ) : multiBags.length > 1 ? (
            /* --- MULTI-BAG RECEIPT SLIP REVIEW TABLE --- */
            <div className="space-y-2.5 animate-fade-in max-h-[50vh] flex flex-col">
              {/* Slip Summary Header Badge */}
              <div className="bg-emerald-950/70 border border-emerald-700/80 p-2.5 rounded-2xl flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="font-bold text-emerald-300 text-xs block">
                        Weighing Slip: {multiBags.length} Bags Extracted (Serials 1 to {multiBags.length})
                      </span>
                      <span className="text-[10px] text-emerald-400/90 font-mono">
                        Total Gross: <strong>{multiGross.toFixed(3)} kg</strong>
                        {ocrResult?.reportedGrossWeight ? ` • Slip Gross: ${ocrResult.reportedGrossWeight.toFixed(3)} kg` : ''}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddMultiBag}
                    className="px-2 py-1 bg-emerald-800/80 hover:bg-emerald-700 text-emerald-200 border border-emerald-600 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Bag</span>
                  </button>
                </div>

                {/* Gross Matching Status Badge */}
                {ocrResult?.reportedGrossWeight && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-800/60">
                    {Math.abs(multiGross - ocrResult.reportedGrossWeight) < 0.05 ? (
                      <span className="text-emerald-300 font-bold flex items-center gap-1">
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Total Gross & Slip Gross Match ({multiGross.toFixed(3)} kg)</span>
                      </span>
                    ) : (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="text-amber-300 font-semibold flex items-center gap-1 text-[10px]">
                          <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
                          <span>Diff: {(multiGross - ocrResult.reportedGrossWeight).toFixed(3)} kg</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const diff = ocrResult.reportedGrossWeight! - multiGross;
                            if (multiBags.length > 0) {
                              const lastIdx = multiBags.length - 1;
                              const updatedLast = Math.max(0, (parseFloat(multiBags[lastIdx]) || 0) + diff);
                              handleMultiBagChange(lastIdx, updatedLast.toFixed(3));
                            }
                          }}
                          className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded text-[10px] font-bold cursor-pointer shrink-0"
                        >
                          Match to Slip Gross ({ocrResult.reportedGrossWeight.toFixed(3)} kg)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scrollable Extracted Bags Grid */}
              <div 
                className="overflow-y-auto overscroll-contain max-h-[180px] sm:max-h-[220px] p-2 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-1.5 touch-pan-y"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {multiBags.map((w, idx) => (
                    <div 
                      key={`multi-bag-${idx}`}
                      className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/80"
                    >
                      <span className="text-[10px] font-mono font-bold text-slate-400 w-12 shrink-0">
                        #{idx + 1}
                      </span>
                      <input 
                        type="text"
                        inputMode="decimal"
                        value={w}
                        onChange={(e) => handleMultiBagChange(idx, e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-lg text-xs font-mono font-bold text-emerald-300 text-center"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMultiBag(idx)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-all cursor-pointer"
                        title="Delete bag"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex gap-2 pt-1 shrink-0">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
                >
                  <span>Apply All {multiBags.length} Bags to Ledger</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* --- SINGLE SCALE DISPLAY WEIGHT REVIEW --- */
            <div className="space-y-3 animate-fade-in">
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
                      placeholder="e.g. 30.500"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/60 rounded-xl text-lg sm:text-xl font-black font-mono text-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-400 text-center"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                      kg
                    </span>
                  </div>
                </div>

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
              </div>

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
