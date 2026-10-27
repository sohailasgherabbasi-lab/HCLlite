import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  ScanFace,
  SwitchCamera,
  FlipHorizontal,
  VideoOff,
  UserCheck,
  ShieldCheck,
  Sparkles,
  UserX,
  Search,
  Users,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { getDistance, isPointWithinRadius } from 'geolib';
import {
  assessFaceCaptureQuality,
  extractFaceBiometrics,
  loadFaceApiModels,
  detectAndExtractFaceApiDescriptor,
  compareFaceBiometrics,
  identifyFaceAcrossEmployees,
  BiometricMatchResult,
} from '../../utils/faceBiometrics.ts';
import { FaceEnrollmentModal } from '../employee/FaceEnrollmentModal.tsx';

interface CameraAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  );
}

export const CameraAttendanceModal: React.FC<CameraAttendanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, settings } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestLiveDescriptorRef = useRef<number[] | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);

  // Employee list & active target employee
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [targetEmployee, setTargetEmployee] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Mode: 'verify' (1:1 Verification against selected employee) or 'auto_identify' (1:N Auto Face Scan)
  const [kioskMode, setKioskMode] = useState<'verify' | 'auto_identify'>('verify');

  // Face recognition & verification state
  const [faceDetected, setFaceDetected] = useState(false);
  const [matchResult, setMatchResult] = useState<BiometricMatchResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Geolocation
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');

  // Camera & submission
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-punch & Match Hysteresis state
  const [autoPunch, setAutoPunch] = useState(true);
  const [autoPunchCountdown, setAutoPunchCountdown] = useState<number | null>(null);
  const [punchSuccessData, setPunchSuccessData] = useState<{ name: string; time: string; confidence: number } | null>(null);

  const hasPunchedRef = useRef(false);
  const isRecognizingRef = useRef(false);
  const autoPunchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMatchTimeRef = useRef<number>(0);
  const lastMatchResultRef = useRef<BiometricMatchResult | null>(null);

  // Quick Face Enrollment modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const canSelectOtherEmployees = user?.role === 'admin' || user?.role === 'hr';

  // Load employee list and target employee profile
  const loadEmployeesAndTarget = useCallback(async () => {
    try {
      const res = await api.getEmployees({ limit: 100 });
      const items = res.items || [];
      setAllEmployees(items);

      let initialEmpId = user?.employeeId;
      if (!initialEmpId || canSelectOtherEmployees) {
        initialEmpId = user?.employeeId || items[0]?.id;
      }

      if (initialEmpId) {
        setSelectedEmpId(initialEmpId);
        const empDetail = await api.getEmployee360(initialEmpId);
        setTargetEmployee(empDetail);
      }
    } catch (err) {
      console.warn('Failed to load employees for face matching:', err);
    }
  }, [user, canSelectOtherEmployees]);

  // When selected employee changes
  const handleSelectEmployee = async (empId: string) => {
    setSelectedEmpId(empId);
    setMatchResult(null);
    setFaceDetected(false);
    setErrorMessage('');
    try {
      const empDetail = await api.getEmployee360(empId);
      setTargetEmployee(empDetail);
    } catch (err) {
      console.warn('Failed to fetch employee details:', err);
    }
  };

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Start webcam
  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      setCameraStatus('starting');
      setErrorMessage('');
      setFaceDetected(false);
      setMatchResult(null);

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setErrorMessage('Camera access is not supported by your browser or connection is not secure.');
        return;
      }

      const targetDeviceId = preferredDeviceId || selectedDeviceId;
      let mediaStream: MediaStream | null = null;

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (secondErr: any) {
          setCameraStatus('error');
          let msg = 'Could not access camera. Please allow camera permissions in your browser.';
          if (secondErr.name === 'NotAllowedError' || secondErr.name === 'PermissionDeniedError') {
            msg = 'Camera permission denied. Please allow camera access in browser site settings.';
          } else if (secondErr.message) {
            msg = secondErr.message;
          }
          setErrorMessage(msg);
          return;
        }
      }

      setStream(mediaStream);

      try {
        const allDevs = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevs.filter((d) => d.kind === 'videoinput');
        setVideoDevices(videoInputs);
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
          console.warn('video.play() initial call:', e);
        }
      }

      setCameraStatus('ready');
    },
    [stream, selectedDeviceId]
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
        console.warn('Playback error caught:', err);
      }
    };

    video.onloadedmetadata = () => playVideo();
    if (video.readyState >= 2) playVideo();
  }, [stream]);

  // Geolocation handling
  const fetchLocation = useCallback(() => {
    setLocationStatus('locating');
    if (!navigator.geolocation) {
      setLocationStatus('ready');
      setCoords({
        lat: settings?.officeLat || 24.8607,
        lng: settings?.officeLng || 67.0011,
        accuracy: 15,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationStatus('ready');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocationStatus('ready');
        setCoords({
          lat: settings?.officeLat || 24.8607,
          lng: settings?.officeLng || 67.0011,
          accuracy: 20,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [settings]);

  // Play subtle audio confirmation chime
  const playSuccessChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    } catch {
      // ignore
    }
  };

  // Submit attendance check-in (both auto-punch and manual button)
  const executePunch = async (matchedResultToUse: BiometricMatchResult, empToUse: any) => {
    if (hasPunchedRef.current || submitting) return;
    if (!empToUse?.faceEnrolled || !Array.isArray(empToUse?.faceDescriptor) || empToUse.faceDescriptor.length === 0) {
      setErrorMessage(`Please enroll Face ID for ${empToUse?.firstName || 'this employee'} before punching.`);
      return;
    }

    if (!matchedResultToUse || !matchedResultToUse.match || matchedResultToUse.confidence < 70) {
      setErrorMessage(
        `Biometric Authentication Failed (${matchedResultToUse?.confidence ?? 0}% match). Live face does not match ${empToUse.firstName}.`
      );
      return;
    }

    hasPunchedRef.current = true;
    setSubmitting(true);
    setErrorMessage('');
    setAutoPunchCountdown(null);

    try {
      const officeLat = settings?.officeLat || 24.8607;
      const officeLng = settings?.officeLng || 67.0011;
      const photoSnapshot = captureSnapshot();

      const payload = {
        employeeId: empToUse.id,
        isCamera: true,
        lat: coords?.lat ?? officeLat,
        lng: coords?.lng ?? officeLng,
        accuracy: coords?.accuracy ?? 20,
        faceDetected: true,
        faceVerified: true,
        faceMatchScore: matchedResultToUse.confidence,
        liveDescriptor: latestLiveDescriptorRef.current || empToUse.faceDescriptor,
        photoSnapshot: photoSnapshot || undefined,
      };

      await api.checkIn(payload);
      playSuccessChime();

      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setPunchSuccessData({
        name: `${empToUse.firstName} ${empToUse.lastName}`,
        time: nowTime,
        confidence: matchedResultToUse.confidence,
      });

      // Automatically close modal after celebration
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } catch (err: any) {
      hasPunchedRef.current = false;
      setErrorMessage(err.message || 'Camera check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckIn = () => {
    if (matchResult && targetEmployee) {
      executePunch(matchResult, targetEmployee);
    }
  };

  // Periodic Live Deep Biometric Recognition Loop with Auto-Punch & Movement Hysteresis
  useEffect(() => {
    if (!isOpen || cameraStatus !== 'ready') {
      return;
    }

    const interval = setInterval(async () => {
      if (hasPunchedRef.current || submitting || isRecognizingRef.current) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      isRecognizingRef.current = true;

      try {
        // 1. Detect face and extract 128-d deep neural descriptor using @vladmandic/face-api
        const extraction = await detectAndExtractFaceApiDescriptor(video);

        if (!extraction.hasFace || !extraction.descriptor) {
          // If user's face is momentarily obscured or moving, retain match for 1500ms
          if (Date.now() - lastMatchTimeRef.current > 1500) {
            setFaceDetected(false);
            setMatchResult(null);
            setAutoPunchCountdown(null);
            if (autoPunchTimerRef.current) {
              clearTimeout(autoPunchTimerRef.current);
              autoPunchTimerRef.current = null;
            }
          }
          return;
        }

        setFaceDetected(true);
        setIsComparing(true);

        const liveDescriptor = extraction.descriptor;
        latestLiveDescriptorRef.current = liveDescriptor;

        // 2. Authenticate face against enrolled employee
        let freshResult: BiometricMatchResult | null = null;
        let matchedEmp = targetEmployee;

        if (kioskMode === 'auto_identify' && allEmployees.length > 0) {
          // Auto-search across all enrolled employees
          const auto = identifyFaceAcrossEmployees(liveDescriptor, allEmployees, 70);
          if (auto.match && auto.matchedEmployee) {
            matchedEmp = auto.matchedEmployee;
            setTargetEmployee(auto.matchedEmployee);
            setSelectedEmpId(auto.matchedEmployee.id);
            freshResult = {
              match: true,
              similarity: auto.bestSimilarity,
              distance: auto.bestDistance,
              confidence: auto.bestConfidence,
              scoreLabel: auto.bestConfidence >= 85 ? 'Very High' : 'High',
              reason: `Biometric Identity Verified: ${auto.matchedEmployee.firstName} ${auto.matchedEmployee.lastName}`,
            };
          } else {
            freshResult = {
              match: false,
              similarity: auto.bestSimilarity,
              distance: auto.bestDistance,
              confidence: auto.bestConfidence,
              scoreLabel: 'Mismatch',
              reason: auto.message,
            };
          }
        } else {
          // Targeted 1:1 Biometric Verification
          const enrolledDescriptor = targetEmployee?.faceDescriptor;
          if (Array.isArray(enrolledDescriptor) && enrolledDescriptor.length > 0) {
            freshResult = compareFaceBiometrics(liveDescriptor, enrolledDescriptor, 70);
          } else {
            freshResult = {
              match: false,
              similarity: 0,
              distance: 9.99,
              confidence: 0,
              scoreLabel: 'Mismatch',
              reason: targetEmployee?.firstName
                ? `No biometric profile registered for ${targetEmployee.firstName}. Please enroll Face ID first.`
                : 'Please select an employee profile to authenticate.',
            };
          }
        }

        // 3. Hysteresis Smoothing & Immediate Auto-Punch
        if (freshResult.match) {
          lastMatchTimeRef.current = Date.now();
          lastMatchResultRef.current = freshResult;
          setMatchResult(freshResult);

          // Immediate Auto-Punch trigger on confirmed face match
          if (autoPunch && !hasPunchedRef.current && !submitting) {
            if (!autoPunchTimerRef.current) {
              setAutoPunchCountdown(1);
              autoPunchTimerRef.current = setTimeout(() => {
                autoPunchTimerRef.current = null;
                executePunch(freshResult!, matchedEmp);
              }, 600); // 600ms brief confirmation pause before touchless punch
            }
          }
        } else {
          // If current frame dipped slightly from moving a little or shifting gaze:
          // Hold the verified match for up to 2000ms so moving does NOT drop the match!
          const timeSinceLastMatch = Date.now() - lastMatchTimeRef.current;
          if (timeSinceLastMatch < 2000 && lastMatchResultRef.current?.match) {
            setMatchResult(lastMatchResultRef.current);
          } else {
            setMatchResult(freshResult);
            setAutoPunchCountdown(null);
            if (autoPunchTimerRef.current) {
              clearTimeout(autoPunchTimerRef.current);
              autoPunchTimerRef.current = null;
            }
          }
        }
      } catch (err) {
        console.warn('Face detection cycle error:', err);
      } finally {
        isRecognizingRef.current = false;
        setIsComparing(false);
      }
    }, 380);

    return () => clearInterval(interval);
  }, [isOpen, cameraStatus, targetEmployee, isMirrored, kioskMode, allEmployees, autoPunch, submitting]);

  // Initialize on modal open
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setMatchResult(null);
      setFaceDetected(false);
      setAutoPunchCountdown(null);
      setPunchSuccessData(null);
      hasPunchedRef.current = false;
      lastMatchTimeRef.current = 0;
      lastMatchResultRef.current = null;
      if (autoPunchTimerRef.current) {
        clearTimeout(autoPunchTimerRef.current);
        autoPunchTimerRef.current = null;
      }
      return;
    }

    hasPunchedRef.current = false;
    setAutoPunchCountdown(null);
    setPunchSuccessData(null);
    // Preload neural face models and load employees
    loadFaceApiModels().catch((e) => console.warn('Preload face models:', e));
    loadEmployeesAndTarget();
    startCamera();
    fetchLocation();

    return () => {
      stopCamera();
      if (autoPunchTimerRef.current) {
        clearTimeout(autoPunchTimerRef.current);
        autoPunchTimerRef.current = null;
      }
    };
  }, [isOpen]);

  // Capture frame snapshot onto canvas as compact verification thumbnail
  const captureSnapshot = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    const targetW = 240;
    const targetH = Math.round(targetW * (video.videoHeight / video.videoWidth));
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  };

  if (!isOpen) return null;

  const officeLat = settings?.officeLat || 24.8607;
  const officeLng = settings?.officeLng || 67.0011;
  const officeRadius = settings?.officeRadiusMeters || 150;
  const currentDistance = coords ? haversineDistanceMeters(coords.lat, coords.lng, officeLat, officeLng) : 0;
  const isWithinPerimeter = currentDistance <= officeRadius;

  const isVerified = matchResult?.match === true && (matchResult?.confidence ?? 0) >= 70;
  const isMismatch = faceDetected && (!matchResult || !matchResult.match || (matchResult.confidence < 70));

  return (
    <>
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
                  <span>Facial Recognition Attendance Kiosk</span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                    Touchless Auto-Punch
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-500">Instant facial recognition & automated hands-free attendance</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: Left Viewfinder & Right Vertical Actions */}
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            {/* LEFT COLUMN: Camera & Biometric Viewport */}
            <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between overflow-y-auto space-y-3">
              {/* Controls Bar above viewfinder */}
              <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300 shrink-0">
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
                      {videoDevices.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          {d.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-neutral-400" />
                    Live Biometric Scanner
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
                    title="Toggle mirror view"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>Mirror</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startCamera(selectedDeviceId)}
                    className="p-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-600 dark:text-neutral-300 text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                    title="Restart camera stream"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restart</span>
                  </button>
                </div>
              </div>

              {/* Video Container & Biometric Matching HUD */}
              <div
                className={`relative aspect-4/3 max-h-[460px] bg-neutral-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 transition-all duration-300 shadow-inner ${
                  !targetEmployee?.faceEnrolled
                    ? 'border-amber-500/50'
                    : isVerified
                    ? 'border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                    : isMismatch
                    ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.3)]'
                    : 'border-neutral-800'
                }`}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    cameraStatus === 'ready' ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
                  } ${isMirrored ? 'scale-x-[-1]' : ''}`}
                />

                <canvas ref={canvasRef} className="hidden" />

                {/* Auto-Punch In Progress Banner */}
                {autoPunchCountdown !== null && !punchSuccessData && (
                  <div className="absolute inset-x-6 top-16 z-20 flex items-center justify-center animate-in fade-in zoom-in duration-150 pointer-events-none">
                    <div className="bg-emerald-600/95 backdrop-blur-md text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-300 pointer-events-auto">
                      <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin shrink-0" />
                      <div>
                        <span className="text-xs font-bold block">
                          Face Matched ({matchResult?.confidence}%)! Marking Attendance Automatically...
                        </span>
                        <span className="text-[10px] text-emerald-100 font-mono">
                          Touchless hands-free check-in in progress
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Celebration Overlay on Successful Punch */}
                {punchSuccessData && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-950/92 backdrop-blur-md p-6 text-center text-white animate-in zoom-in duration-200">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/30 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 mb-3 animate-bounce shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                      <CheckCircle2 className="w-10 h-10 text-emerald-300" />
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-1">
                      Attendance Punched Successfully!
                    </h3>
                    <p className="text-sm text-emerald-200 font-bold mb-3">
                      {punchSuccessData.name}
                    </p>
                    <div className="inline-flex items-center gap-3 bg-black/50 px-4 py-1.5 rounded-full border border-emerald-400/40 text-xs font-mono text-emerald-300 shadow-md">
                      <span>Time: {punchSuccessData.time}</span>
                      <span>·</span>
                      <span>Match: {punchSuccessData.confidence}%</span>
                    </div>
                    <p className="text-[11px] text-emerald-300/80 mt-4 font-mono">
                      ✓ Biometric verified · Window closing...
                    </p>
                  </div>
                )}

                {/* Live HUD Overlay */}
                {cameraStatus === 'ready' && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-3 sm:p-4">
                    {/* Top Enrolled Profile Thumbnail HUD */}
                    <div className="w-full flex items-center justify-between pointer-events-auto">
                      <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white text-xs">
                        {targetEmployee?.facePhotoUrl ? (
                          <img
                            src={targetEmployee.facePhotoUrl}
                            alt="Enrolled"
                            className="w-6 h-6 rounded-md object-cover border border-white/20"
                          />
                        ) : (
                          <UserX className="w-4 h-4 text-amber-400" />
                        )}
                        <div>
                          <span className="font-semibold block text-[11px] leading-tight">
                            Target: {targetEmployee?.firstName} {targetEmployee?.lastName}
                          </span>
                          <span className="text-[9px] text-neutral-400 font-mono">
                            {targetEmployee?.faceEnrolled ? 'Enrolled Baseline Profile' : 'No Enrolled Baseline'}
                          </span>
                        </div>
                      </div>

                      {/* Live Match Confidence Badge */}
                      {targetEmployee?.faceEnrolled && faceDetected && matchResult && (
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-bold font-mono shadow-md backdrop-blur-md flex items-center gap-1.5 border animate-in fade-in ${
                            isVerified
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500'
                              : 'bg-rose-950/80 text-rose-300 border-rose-500'
                          }`}
                        >
                          {isVerified ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span>{matchResult.confidence}% Match</span>
                        </div>
                      )}
                    </div>

                    {/* Central Reticle */}
                    <div className="relative my-auto flex items-center justify-center">
                      <div
                        className={`w-40 sm:w-48 h-52 sm:h-60 rounded-[50%] border-2 transition-all duration-300 flex items-center justify-center ${
                          !targetEmployee?.faceEnrolled
                            ? 'border-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                            : isVerified
                            ? 'border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.4)]'
                            : isMismatch
                            ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]'
                            : 'border-indigo-400/60 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                        }`}
                      >
                        {/* Scanning Sweep Bar */}
                        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse opacity-60" />

                        {/* Status pill inside center */}
                        <div className="bg-black/85 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-center shadow-lg">
                          {!targetEmployee?.faceEnrolled ? (
                            <span className="text-amber-400 text-[11px] font-semibold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Enrollment Required
                            </span>
                          ) : !faceDetected ? (
                            <span className="text-white/80 text-[11px] flex items-center gap-1.5">
                              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                              Align Face in Oval...
                            </span>
                          ) : isVerified ? (
                            <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              Match Confirmed ({matchResult?.confidence}%)
                            </span>
                          ) : (
                            <span className="text-rose-400 text-[11px] font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              Face Mismatch ({matchResult?.confidence}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Guide Bar */}
                    <div className="w-full text-center">
                      <span className="text-[10px] text-white/80 font-mono bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-white/10">
                        {!targetEmployee?.faceEnrolled
                          ? 'Enroll face profile to activate camera recognition'
                          : isVerified
                          ? `✓ Biometric signature matched with ${targetEmployee?.firstName}`
                          : isMismatch
                          ? `✕ Live face does not match ${targetEmployee?.firstName}'s biometric record`
                          : 'Position face directly in front of camera'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Fallback overlay if camera error */}
                {cameraStatus === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-neutral-400 bg-neutral-950 z-10">
                    <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-400 rounded-full mb-3">
                      <VideoOff className="w-8 h-8" />
                    </div>
                    <p className="text-xs text-rose-300 font-semibold mb-1">Camera Stream Unavailable</p>
                    <p className="text-[11px] text-neutral-400 max-w-xs mb-3 leading-relaxed">
                      {errorMessage || 'Unable to open video stream. Please check camera connection.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Camera</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Geofence info strip */}
              <div className="p-2.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs shrink-0">
                <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>Geofence Status:</span>
                  </span>
                  <span
                    className={`font-semibold flex items-center gap-1 ${
                      isWithinPerimeter ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isWithinPerimeter
                        ? `Inside Perimeter (${currentDistance}m ≤ ${officeRadius}m)`
                        : `Outside Radius (${currentDistance}m > ${officeRadius}m)`}
                    </span>
                  </span>
                </div>
              </div>

              {/* Error message banner */}
              {errorMessage && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-in fade-in shrink-0">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Dedicated Vertical Control Panel */}
            <div className="w-full lg:w-84 shrink-0 border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/70 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-3.5">
                {/* Mode Selector: 1:1 Targeted vs 1:N Auto-Identify */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                      Biometric Kiosk Mode
                    </span>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-semibold">
                      128-D Anti-Proxy
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-200/60 dark:bg-neutral-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setKioskMode('verify')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        kioskMode === 'verify'
                          ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                      <span>1:1 Targeted</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKioskMode('auto_identify')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        kioskMode === 'auto_identify'
                          ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <ScanFace className="w-3.5 h-3.5 text-indigo-500" />
                      <span>1:N Auto-Detect</span>
                    </button>
                  </div>
                </div>

                {/* Target Employee Profile Card */}
                <div className="p-3 bg-white dark:bg-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-2.5">
                  <div className="flex items-center gap-3">
                    {targetEmployee?.facePhotoUrl ? (
                      <img
                        src={targetEmployee.facePhotoUrl}
                        alt={targetEmployee.firstName}
                        className="w-12 h-12 rounded-xl object-cover border-2 border-indigo-500/50 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm shrink-0">
                        {targetEmployee?.firstName?.[0] || 'E'}
                        {targetEmployee?.lastName?.[0] || 'M'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-neutral-900 dark:text-white truncate">
                        {targetEmployee?.firstName} {targetEmployee?.lastName}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono truncate">
                        {targetEmployee?.employeeCode || 'EMP'} · {targetEmployee?.departmentName || 'General'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {targetEmployee?.faceEnrolled ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Enrolled Profile</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/50 dark:border-amber-800/40">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Enrollment Needed</span>
                          </span>
                        )}
                        {kioskMode === 'auto_identify' && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                            Auto 1:N
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Switch employee dropdown & search if Admin/HR */}
                  {canSelectOtherEmployees && allEmployees.length > 0 && kioskMode === 'verify' && (
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/60 space-y-1.5">
                      <label className="text-[10px] text-neutral-500 block font-medium">Switch Target Employee:</label>
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Filter by name or EMP code..."
                          className="w-full text-[11px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg pl-7 pr-2.5 py-1 text-neutral-800 dark:text-neutral-200"
                        />
                      </div>
                      <select
                        value={selectedEmpId}
                        onChange={(e) => handleSelectEmployee(e.target.value)}
                        className="w-full text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-neutral-800 dark:text-neutral-200 cursor-pointer shadow-xs focus:ring-2 focus:ring-indigo-500"
                      >
                        {allEmployees
                          .filter((emp) => {
                            if (!searchTerm) return true;
                            const query = searchTerm.toLowerCase();
                            const full = `${emp.firstName || ''} ${emp.lastName || ''} ${emp.employeeCode || ''}`.toLowerCase();
                            return full.includes(query);
                          })
                          .map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.firstName} {emp.lastName} ({emp.employeeCode}) {emp.faceEnrolled ? '✓ Enrolled' : '⚠️ Unenrolled'}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Biometric Match Feedback Card */}
                <div
                  className={`p-3 rounded-2xl border transition-all text-xs space-y-2 ${
                    !targetEmployee?.faceEnrolled
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : isVerified
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 shadow-xs'
                      : isMismatch
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-400 dark:border-rose-700 text-rose-900 dark:text-rose-200 shadow-xs'
                      : 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1.5">
                      {!targetEmployee?.faceEnrolled ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>Enrollment Required</span>
                        </>
                      ) : isVerified ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span>Identity Verified</span>
                        </>
                      ) : isMismatch ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>Face Mismatch Detected</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                          <span>Scanning Live Biometrics...</span>
                        </>
                      )}
                    </div>
                    {matchResult && targetEmployee?.faceEnrolled && (
                      <span className="font-mono text-[11px] font-bold">
                        {matchResult.confidence}%
                      </span>
                    )}
                  </div>

                  {/* Visual Confidence Progress Bar */}
                  {targetEmployee?.faceEnrolled && faceDetected && (
                    <div className="w-full bg-black/10 dark:bg-black/30 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isVerified ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, matchResult?.confidence ?? 0))}%` }}
                      />
                    </div>
                  )}

                  <p className="text-[11px] leading-relaxed">
                    {!targetEmployee?.faceEnrolled
                      ? 'This profile does not have an enrolled biometric baseline. Please click "Enroll Face ID Now" below.'
                      : isVerified
                      ? `Biometric match confirmed (${matchResult?.confidence}% confidence ≥ 70% threshold). Proxy punch blocked.`
                      : isMismatch
                      ? `The live face in front of camera does NOT match ${targetEmployee?.firstName} ${targetEmployee?.lastName}. Proxy attendance is strictly prohibited.`
                      : 'Position face directly in front of camera with good lighting.'}
                  </p>
                </div>
              </div>

              {/* VERTICAL ACTION BUTTONS */}
              <div className="space-y-2.5 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                {/* Touchless Auto-Punch Toggle Card */}
                {targetEmployee?.faceEnrolled && (
                  <label className="flex items-center justify-between p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300/70 dark:border-emerald-800/60 rounded-xl cursor-pointer transition-colors hover:bg-emerald-100/70">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block leading-tight">
                          Auto-Punch on Match
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                          Touchless: Marks attendance instantly
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPunch}
                      onChange={(e) => {
                        setAutoPunch(e.target.checked);
                        if (!e.target.checked) setAutoPunchCountdown(null);
                      }}
                      className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                    />
                  </label>
                )}

                {/* Primary: Confirm Punch */}
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={submitting || !targetEmployee?.faceEnrolled || !isVerified}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-md transition-all cursor-pointer ${
                    isVerified
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 ring-2 ring-emerald-400/40'
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 opacity-80 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Recording Punch...</span>
                      </>
                    ) : autoPunchCountdown !== null ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                        <span>Auto-Punching In Progress...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Biometric Punch</span>
                      </>
                    )}
                  </div>
                  {!isVerified && targetEmployee?.faceEnrolled && faceDetected && (
                    <span className="text-[10px] font-normal text-rose-500 dark:text-rose-400">
                      Face Mismatch — Punch Blocked
                    </span>
                  )}
                  {isVerified && (
                    <span className="text-[10px] font-normal text-emerald-100">
                      Identity Verified ({matchResult?.confidence}%)
                    </span>
                  )}
                </button>

                {/* If Not Enrolled: Quick Enroll Button */}
                {(!targetEmployee?.faceEnrolled || isMismatch) && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setShowEnrollModal(true);
                    }}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <ScanFace className="w-4 h-4" />
                    <span>{targetEmployee?.faceEnrolled ? 'Re-Enroll / Calibrate Face ID' : 'Enroll Face ID Now'}</span>
                  </button>
                )}

                {/* Secondary: Cancel / Close */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel / Close Kiosk</span>
                </button>

                <div className="text-[10px] text-center text-neutral-400 font-mono pt-1">
                  Security: 128-D Biometric Vectors · Anti-Proxy Calibrated · Geofenced
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Face Enrollment modal if user clicks 'Enroll Face Now' */}
      {targetEmployee && (
        <FaceEnrollmentModal
          isOpen={showEnrollModal}
          onClose={() => {
            setShowEnrollModal(false);
            startCamera();
          }}
          employee={targetEmployee}
          onSuccess={(updated) => {
            setTargetEmployee(updated);
            setShowEnrollModal(false);
            loadEmployeesAndTarget();
            startCamera();
          }}
        />
      )}
    </>
  );
};
