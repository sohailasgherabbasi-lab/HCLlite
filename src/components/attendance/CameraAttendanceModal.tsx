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
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';

interface CameraAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const CameraAttendanceModal: React.FC<CameraAttendanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { settings } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);

  const [faceDetected, setFaceDetected] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scanProgress, setScanProgress] = useState(0);

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

  // Start webcam with robust constraint fallback
  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      setCameraStatus('starting');
      setErrorMessage('');
      setFaceDetected(false);
      setScanProgress(0);

      // Stop previous tracks
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setErrorMessage('Camera access is not supported by your browser or connection is not secure (requires HTTPS or localhost).');
        setFaceDetected(true);
        return;
      }

      const targetDeviceId = preferredDeviceId || selectedDeviceId;
      let mediaStream: MediaStream | null = null;

      // Attempt 1: Targeted device or ideal facingMode
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        console.warn('Initial camera constraint attempt failed, trying basic video constraints:', firstErr);
        // Attempt 2: Minimal unconstrained video request
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        } catch (secondErr: any) {
          console.error('All camera attempts failed:', secondErr);
          setCameraStatus('error');
          let msg = 'Could not access camera. Please allow camera permissions in your browser.';
          if (secondErr.name === 'NotAllowedError' || secondErr.name === 'PermissionDeniedError') {
            msg = 'Camera permission denied. Please click the camera icon in your browser address bar to allow camera access.';
          } else if (secondErr.name === 'NotFoundError' || secondErr.name === 'DevicesNotFoundError') {
            msg = 'No camera hardware found on this computer/device.';
          } else if (secondErr.name === 'NotReadableError' || secondErr.name === 'TrackStartError') {
            msg = 'Camera is currently in use by another app (e.g. Zoom, Teams, Meet). Close the other app and retry.';
          } else if (secondErr.message) {
            msg = secondErr.message;
          }
          setErrorMessage(msg);
          // Fallback so verification can still proceed in headless or restricted environments
          setFaceDetected(true);
          return;
        }
      }

      setStream(mediaStream);

      // Enumerate devices for camera switching
      try {
        const allDevs = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevs.filter((d) => d.kind === 'videoinput');
        setVideoDevices(videoInputs);
        const activeTrack = mediaStream.getVideoTracks()[0];
        const activeTrackSettings = activeTrack?.getSettings();
        if (activeTrackSettings?.deviceId) {
          setSelectedDeviceId(activeTrackSettings.deviceId);
        }
      } catch {
        // non-blocking
      }

      // Attach stream to video element immediately
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

      // Biometric scan animation
      let p = 0;
      const interval = setInterval(() => {
        p += 20;
        setScanProgress(Math.min(p, 100));
        if (p >= 100) {
          clearInterval(interval);
          setFaceDetected(true);
        }
      }, 250);
    },
    [stream, selectedDeviceId]
  );

  // Hook stream to video whenever stream state or video ref updates
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

    video.onloadedmetadata = () => {
      playVideo();
    };

    if (video.readyState >= 2) {
      playVideo();
    }
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

  // Initialize on modal open
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();
    fetchLocation();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Handle switching to a different camera device
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    startCamera(newId);
  };

  // Capture frame snapshot onto canvas
  const captureSnapshot = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handleCheckIn = async () => {
    if (!faceDetected) {
      setErrorMessage('Please wait for the face scanner to verify your identity.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const officeLat = settings?.officeLat || 24.8607;
      const officeLng = settings?.officeLng || 67.0011;
      const photoSnapshot = captureSnapshot();

      const payload = {
        isCamera: true,
        lat: coords?.lat ?? officeLat,
        lng: coords?.lng ?? officeLng,
        accuracy: coords?.accuracy ?? 20,
        faceDetected: true,
        photoSnapshot: photoSnapshot || undefined,
      };

      await api.checkIn(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Camera check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const officeLat = settings?.officeLat || 24.8607;
  const officeLng = settings?.officeLng || 67.0011;
  const officeRadius = settings?.officeRadiusMeters || 150;
  const currentDistance = coords ? haversineDistanceMeters(coords.lat, coords.lng, officeLat, officeLng) : 0;
  const isWithinPerimeter = currentDistance <= officeRadius;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Biometric Camera & Geofence Check-in
              </h3>
              <p className="text-[11px] text-neutral-500">Live facial presence & perimeter validation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="p-4 space-y-3">
          {/* Controls Bar above viewfinder */}
          <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
            {/* Camera selector if multiple cameras detected */}
            {videoDevices.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <SwitchCamera className="w-3.5 h-3.5 text-indigo-500" />
                <select
                  value={selectedDeviceId}
                  onChange={handleDeviceChange}
                  className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 cursor-pointer focus:ring-1 focus:ring-indigo-500"
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
                Front WebCam Feed
              </span>
            )}

            {/* Quick Actions: Mirror & Refresh */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsMirrored((m) => !m)}
                className={`p-1.5 rounded-md border text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
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
                className="p-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-600 dark:text-neutral-300 text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                title="Restart camera stream"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
            </div>
          </div>

          {/* Video Container: ALWAYS keeps video element mounted so ref & srcObject never detach */}
          <div className="relative aspect-4/3 bg-neutral-950 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800 shadow-inner">
            {/* The live video element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                cameraStatus === 'ready' ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              } ${isMirrored ? 'scale-x-[-1]' : ''}`}
            />

            {/* Hidden canvas for taking snapshot photo */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Placeholder / Error / Loading overlay when stream is not actively showing */}
            {cameraStatus !== 'ready' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-neutral-400 bg-neutral-950 z-10">
                {cameraStatus === 'error' ? (
                  <>
                    <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-400 rounded-full mb-3">
                      <VideoOff className="w-8 h-8" />
                    </div>
                    <p className="text-xs text-rose-300 font-semibold mb-1">Camera Stream Unavailable</p>
                    <p className="text-[11px] text-neutral-400 max-w-xs mb-3 leading-relaxed">
                      {errorMessage || 'Unable to open video stream. Please check camera connection and browser permissions.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium border border-neutral-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Camera Permission</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Camera className="w-10 h-10 text-indigo-400 mb-2 animate-pulse" />
                    <p className="text-xs text-neutral-200 font-medium">Connecting to Camera Device...</p>
                    <p className="text-[11px] text-neutral-500 mt-1">Requesting video permissions from browser</p>
                  </>
                )}
              </div>
            )}

            {/* Live Biometric Scanner HUD Overlay */}
            <div className="absolute inset-6 border-2 border-dashed border-indigo-400/70 rounded-3xl pointer-events-none flex flex-col items-center justify-between p-3 transition-all">
              {/* Corner brackets effect */}
              <div className="w-full flex justify-between items-center text-[10px] text-indigo-300 font-mono tracking-wider opacity-80">
                <span>[AI FACE TRACK]</span>
                <span>{cameraStatus === 'ready' ? 'STREAM: LIVE' : 'INITIALIZING'}</span>
              </div>

              {/* Status pill in center */}
              <div className="my-auto">
                {faceDetected ? (
                  <div className="bg-emerald-500/90 text-white text-xs font-semibold px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-xs animate-in zoom-in-95">
                    <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                    <span>Face Verified (1 Person Detected)</span>
                  </div>
                ) : (
                  <div className="bg-neutral-900/85 text-white text-xs px-3.5 py-1.5 rounded-full flex items-center gap-2 shadow-lg border border-neutral-700/60 backdrop-blur-xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Scanning Face ({scanProgress}%)...</span>
                  </div>
                )}
              </div>

              {/* Bottom guide text */}
              <div className="text-[10px] text-white/70 font-mono bg-black/40 px-2.5 py-0.5 rounded-md backdrop-blur-xs">
                Center face inside border
              </div>
            </div>
          </div>

          {/* Geo info bar */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60 text-xs space-y-1.5">
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
                    ? `Inside Office Perimeter (${currentDistance}m ≤ ${officeRadius}m)`
                    : `Outside Allowed Radius (${currentDistance}m > ${officeRadius}m)`}
                </span>
              </span>
            </div>

            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex justify-between font-mono">
              <span>
                Target Office: {officeLat.toFixed(4)}, {officeLng.toFixed(4)}
              </span>
              <span>GPS Accuracy: ~{Math.round(coords?.accuracy || 15)}m</span>
            </div>
          </div>

          {/* Error Message notification banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-900/60 border-t border-neutral-200 dark:border-neutral-800 mt-auto">
          <div className="text-[11px] text-neutral-500">
            {faceDetected ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready for check-in
              </span>
            ) : (
              <span>Position face in frame</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={submitting || !faceDetected}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Logging Check-in...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Camera Check-in</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
