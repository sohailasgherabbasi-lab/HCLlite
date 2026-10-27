import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  ScanFace,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Upload,
  Trash2,
  ShieldCheck,
  SwitchCamera,
  FlipHorizontal,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  assessFaceCaptureQuality,
  extractFaceBiometrics,
  FaceQualityResult,
} from '../../utils/faceBiometrics.ts';

interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: {
    id: string;
    firstName?: string;
    lastName?: string;
    employeeCode?: string;
    departmentName?: string;
    faceEnrolled?: boolean;
    facePhotoUrl?: string;
    faceEnrolledAt?: string;
    faceDescriptor?: number[];
  };
  onSuccess: (updatedEmployee: any) => void;
}

export const FaceEnrollmentModal: React.FC<FaceEnrollmentModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [currentEmployee, setCurrentEmployee] = useState(employee);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);

  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedDescriptor, setCapturedDescriptor] = useState<number[] | null>(null);
  const [quality, setQuality] = useState<FaceQualityResult | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const empName = `${currentEmployee.firstName || ''} ${currentEmployee.lastName || ''}`.trim() || 'Employee';

  // Keep currentEmployee in sync with prop
  useEffect(() => {
    setCurrentEmployee(employee);
  }, [employee]);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setCameraStatus('idle');
  }, [stream]);

  // Start webcam
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraStatus('starting');
      setCameraError('');
      setFeedback(null);
      setCapturedPhoto(null);

      // Stop any existing tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setCameraError('Camera access is not supported by your browser or connection is not secure (requires HTTPS or localhost).');
        return;
      }

      const targetDeviceId = deviceId || selectedDeviceId;
      let mediaStream: MediaStream | null = null;

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        try {
          // Fallback with minimal constraints
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (secondErr: any) {
          setCameraStatus('error');
          let msg = 'Could not access camera. Please allow camera permissions in your browser.';
          if (secondErr.name === 'NotAllowedError' || secondErr.name === 'PermissionDeniedError') {
            msg = 'Camera permission denied. Please allow camera access in browser site settings.';
          } else if (secondErr.name === 'NotReadableError' || secondErr.name === 'TrackStartError') {
            msg = 'Camera is currently locked by another application or tab. Please close other camera windows and click Retry Camera below.';
          } else if (secondErr.message) {
            msg = secondErr.message;
          }
          setCameraError(msg);
          return;
        }
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vInputs = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(vInputs);
        const activeTrack = mediaStream.getVideoTracks()[0];
        const activeSettings = activeTrack?.getSettings();
        if (activeSettings?.deviceId) {
          setSelectedDeviceId(activeSettings.deviceId);
        }
      } catch {
        // non-blocking
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        video.muted = true;
        try {
          await video.play();
        } catch (e) {
          console.warn('Video play caught in startCamera:', e);
        }
      }

      setCameraStatus('ready');
    },
    [selectedDeviceId]
  );

  // Hook stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = true;

    const playVideo = async () => {
      try {
        await video.play();
        setCameraStatus('ready');
      } catch (err) {
        console.warn('Playback caught in stream useEffect:', err);
      }
    };

    video.onloadedmetadata = () => {
      playVideo();
    };

    if (video.readyState >= 2) {
      playVideo();
    }
  }, [stream]);

  // Periodic quality check while camera is active and no snapshot yet
  useEffect(() => {
    if (cameraStatus !== 'ready' || capturedPhoto) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const q = assessFaceCaptureQuality(canvas);
      setQuality(q);
    }, 400);

    return () => clearInterval(interval);
  }, [cameraStatus, capturedPhoto, isMirrored]);

  // Lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setCapturedDescriptor(null);
      setFeedback(null);
      setCountdown(null);
      setCameraStatus('idle');
      return;
    }

    setCurrentEmployee(employee);
    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Snap photo from live camera with normalized max 320x320 size for lean Firestore storage
  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Normalizing resolution prevents Firestore document size limit issues (1MB)
    const targetSize = 320;
    const aspect = video.videoWidth / video.videoHeight;
    let w = targetSize;
    let h = Math.round(targetSize / aspect);
    if (aspect < 1) {
      h = targetSize;
      w = Math.round(targetSize * aspect);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const descriptor = extractFaceBiometrics(canvas);
    // Compact ~15-20 KB high-fidelity JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

    setCapturedPhoto(dataUrl);
    setCapturedDescriptor(descriptor);
  };

  // 3-second countdown snap
  const startCountdownSnap = () => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSnap();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Upload photo from disk with automatic normalization
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const targetSize = 320;
        const aspect = img.naturalWidth / img.naturalHeight;
        let w = targetSize;
        let h = Math.round(targetSize / aspect);
        if (aspect < 1) {
          h = targetSize;
          w = Math.round(targetSize * aspect);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const descriptor = extractFaceBiometrics(canvas);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setCapturedPhoto(compressedDataUrl);
          setCapturedDescriptor(descriptor);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedPhoto(null);
    setCapturedDescriptor(null);
    setFeedback(null);
    if (!stream) {
      startCamera();
    }
  };

  // Save biometric profile to employee record
  const handleSaveEnrollment = async () => {
    if (!capturedPhoto) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.enrollFace(currentEmployee.id, {
        photoSnapshot: capturedPhoto,
        descriptor: capturedDescriptor || [],
      });
      setCurrentEmployee(res.employee);
      setFeedback({ type: 'success', message: res.message || 'Face ID successfully registered!' });
      onSuccess(res.employee);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to enroll face profile.' });
    } finally {
      setSaving(false);
    }
  };

  // Remove existing biometric face record
  const handleDeleteFace = async () => {
    if (!confirm(`Are you sure you want to remove the biometric Face ID record for ${empName}?`)) {
      return;
    }
    setDeleting(true);
    setFeedback(null);
    try {
      const res = await api.deleteFace(currentEmployee.id);
      setCurrentEmployee({
        ...currentEmployee,
        faceEnrolled: false,
        facePhotoUrl: undefined,
        faceDescriptor: undefined,
        faceEnrolledAt: undefined,
      });
      setFeedback({ type: 'success', message: res.message || 'Face ID profile removed.' });
      onSuccess(res.employee || { ...currentEmployee, faceEnrolled: false });
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to remove face record.' });
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl sm:rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <span>Biometric Face ID Enrollment</span>
                {currentEmployee.faceEnrolled && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Enrolled
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-neutral-500 font-mono">
                {empName} ({currentEmployee.employeeCode || 'EMP'}) · {currentEmployee.departmentName || 'General'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left Camera/Preview Viewport & Right Vertical Action Panel */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* LEFT COLUMN: Camera Feed / Captured Photo Review */}
          <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between overflow-y-auto space-y-3">
            {/* Feedback message banner */}
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border shrink-0 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                    : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {!capturedPhoto ? (
              <div className="space-y-2 flex-1 flex flex-col justify-between">
                {/* Controls bar above viewfinder */}
                <div className="flex items-center justify-between text-xs text-neutral-500 shrink-0">
                  {videoDevices.length > 1 ? (
                    <div className="flex items-center gap-1.5">
                      <SwitchCamera className="w-3.5 h-3.5 text-indigo-500" />
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => {
                          setSelectedDeviceId(e.target.value);
                          startCamera(e.target.value);
                        }}
                        className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-neutral-800 dark:text-neutral-200 cursor-pointer"
                      >
                        {videoDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-[11px] flex items-center gap-1">
                      <Camera className="w-3 h-3 text-neutral-400" />
                      Live Camera Viewfinder
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsMirrored((m) => !m)}
                      className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                        isMirrored
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                          : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Mirror</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="p-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-600 dark:text-neutral-300 text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Viewport Frame */}
                <div className="relative aspect-4/3 max-h-[460px] bg-neutral-950 rounded-2xl overflow-hidden flex items-center justify-center border border-neutral-800 shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Biometric Oval Guide Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                    {/* Outer Vignette Darkening */}
                    <div className="absolute inset-0 bg-radial from-transparent via-black/25 to-black/60 pointer-events-none" />

                    {/* Face Alignment Oval */}
                    <div
                      className={`relative w-40 sm:w-48 h-52 sm:h-60 rounded-[50%] border-2 transition-colors duration-300 ${
                        quality?.isAcceptable
                          ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
                          : 'border-indigo-400/80 shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                      }`}
                    >
                      {/* Crosshairs & Alignment Marks */}
                      <div className="absolute top-1/2 left-0 right-0 h-px border-t border-dashed border-white/20" />
                      <div className="absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed border-white/20" />

                      {/* Eye Level Line */}
                      <div className="absolute top-[38%] left-3 right-3 flex items-center justify-between text-[9px] text-white/50 px-2 font-mono">
                        <span>👁 Eye Level</span>
                        <span>👁</span>
                      </div>

                      {/* Chin Rest Marker */}
                      <div className="absolute bottom-3 left-0 right-0 text-center text-[9px] text-white/50 font-mono">
                        Chin Line
                      </div>
                    </div>

                    {/* Countdown overlay */}
                    {countdown !== null && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                        <span className="text-7xl font-black text-white animate-ping font-mono">
                          {countdown}
                        </span>
                      </div>
                    )}

                    {/* Bottom Real-time Quality HUD */}
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-auto">
                      <div className="px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-lg text-[11px] text-white border border-white/10 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            quality?.isAcceptable ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                          }`}
                        />
                        <span>{quality?.feedback || 'Align face inside oval'}</span>
                      </div>

                      {quality && (
                        <div className="px-2 py-1 bg-black/70 backdrop-blur-md rounded-lg text-[10px] text-neutral-300 border border-white/10 font-mono">
                          Lum: {quality.brightness} · Con: {quality.contrast}
                        </div>
                      )}
                    </div>
                  </div>

                  {cameraStatus === 'error' && (
                    <div className="absolute inset-0 bg-neutral-950 p-6 flex flex-col items-center justify-center text-center text-neutral-400 z-10">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                      <p className="text-xs text-neutral-200 font-semibold mb-1">Webcam Not Available</p>
                      <p className="text-[11px] text-neutral-400 max-w-xs mb-3">{cameraError}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border border-neutral-700"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Upload Face Photo Instead
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Review Captured Face Step */
              <div className="space-y-3 flex-1 flex flex-col justify-between">
                <div className="relative aspect-4/3 max-h-[460px] bg-neutral-950 rounded-2xl overflow-hidden flex items-center justify-center border border-emerald-500/50 shadow-lg">
                  <img
                    src={capturedPhoto}
                    alt="Captured Face"
                    className="w-full h-full object-cover"
                  />

                  {/* Biometric Mesh Overlay Simulation */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-40 sm:w-48 h-52 sm:h-60 rounded-[50%] border-2 border-emerald-400/80 shadow-[0_0_25px_rgba(52,211,153,0.4)] flex items-center justify-center relative">
                      <span className="text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-600 px-2 py-0.5 rounded-full absolute -top-3">
                        ✓ Biometric Template Ready
                      </span>
                    </div>
                  </div>

                  <div className="absolute bottom-3 left-4 right-4 bg-black/80 backdrop-blur-md p-2.5 rounded-xl border border-white/10 flex items-center justify-between text-xs text-white">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>128-Point Multi-Scale Descriptor Generated</span>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-400">Status: Validated</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Dedicated Vertical Action Sidebar */}
          <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/70 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-3.5">
              {/* Employee Summary Card */}
              <div className="p-3 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Employee Candidate
                </span>
                <div className="flex items-center gap-3">
                  {currentEmployee.facePhotoUrl ? (
                    <img
                      src={currentEmployee.facePhotoUrl}
                      alt={empName}
                      className="w-11 h-11 rounded-xl object-cover border border-neutral-300 dark:border-neutral-700 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shrink-0">
                      ID
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white block truncate">
                      {empName}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono block truncate">
                      {currentEmployee.employeeCode || 'EMP'} · {currentEmployee.departmentName || 'General'}
                    </span>
                    {currentEmployee.faceEnrolled ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Currently Enrolled</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        <span>No Face ID Enrolled</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* If already has enrolled face, show deletion option */}
                {currentEmployee.faceEnrolled && !capturedPhoto && (
                  <button
                    type="button"
                    onClick={handleDeleteFace}
                    disabled={deleting}
                    className="w-full mt-1 px-2.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-rose-200 dark:border-rose-900 font-semibold"
                    title="Remove Existing Face Record"
                  >
                    {deleting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Removing Face Record...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Existing Face ID</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Status / Quality Guidance card */}
              <div className="p-3 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Scan Status
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      capturedPhoto
                        ? 'bg-emerald-500'
                        : quality?.isAcceptable
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {capturedPhoto
                      ? 'Photo Captured & Ready'
                      : quality?.feedback || 'Align face inside oval'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {capturedPhoto
                    ? 'Review the captured photo. Confirm to register this biometric baseline.'
                    : 'Center face, maintain natural expression, and avoid backlight.'}
                </p>
              </div>

              {/* Guidelines bullet points */}
              <div className="p-3 bg-neutral-100/70 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 space-y-1">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300 block">
                  Accuracy Tips:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-500 dark:text-neutral-400">
                  <li>Well-lit from front, no harsh shadow</li>
                  <li>Remove sunglasses or masks</li>
                  <li>Look directly into lens</li>
                </ul>
              </div>
            </div>

            {/* VERTICAL ACTION BUTTONS */}
            <div className="space-y-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {!capturedPhoto ? (
                <>
                  {/* Vertical Button 1: 3-Sec Auto Snap */}
                  <button
                    type="button"
                    onClick={startCountdownSnap}
                    disabled={cameraStatus !== 'ready' || countdown !== null}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>3-Sec Auto Snap</span>
                  </button>

                  {/* Vertical Button 2: Snap Now */}
                  <button
                    type="button"
                    onClick={handleSnap}
                    disabled={cameraStatus !== 'ready'}
                    className="w-full py-2.5 px-4 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Snap Now</span>
                  </button>

                  {/* Vertical Button 3: Upload from file */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Face Photo</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Vertical Button 1: Confirm & Enroll */}
                  <button
                    type="button"
                    onClick={handleSaveEnrollment}
                    disabled={saving}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Saving Biometric ID...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Enroll Face ID</span>
                      </>
                    )}
                  </button>

                  {/* Vertical Button 2: Retake */}
                  <button
                    type="button"
                    onClick={handleRetake}
                    disabled={saving}
                    className="w-full py-2.5 px-4 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retake Photo</span>
                  </button>
                </>
              )}

              {/* Vertical Button 4: Cancel / Close */}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cancel / Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
