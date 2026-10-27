/**
 * Gold-Standard Facial Biometrics Utility powered by @vladmandic/face-api
 *
 * Implements:
 * 1. Deep Neural Network Face Detection (TinyFaceDetector)
 * 2. 68-Point Facial Landmark Localization (FaceLandmark68Net)
 * 3. 128-dimensional Deep Face Embeddings (FaceRecognitionNet / ResNet-34)
 * 4. High-Precision Euclidean Distance & Confidence Match Scoring
 * 5. Strict Anti-Proxy & False Match Prevention (Distance <= 0.58, Confidence >= 70%)
 */

import * as faceapi from '@vladmandic/face-api';

export interface FaceQualityResult {
  isAcceptable: boolean;
  brightness: number; // 0 - 255
  contrast: number;   // standard deviation
  hasFacePresence: boolean;
  feedback: string;
}

export interface BiometricMatchResult {
  match: boolean;
  similarity: number; // 0.0 - 1.0 (1.0 = identical)
  distance: number;   // Euclidean distance (lower is closer; <= 0.58 is match)
  confidence: number; // 0 - 100%
  scoreLabel: 'Very High' | 'High' | 'Moderate' | 'Low' | 'Mismatch';
  reason?: string;
}

export interface FaceApiExtractionResult {
  hasFace: boolean;
  descriptor: number[] | null;
  detection: any | null;
  landmarks: any | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// 1. NEURAL MODEL MANAGEMENT (Singleton loader from /models)
// ---------------------------------------------------------------------------
let modelsLoadingPromise: Promise<boolean> | null = null;
let modelsLoaded = false;

export function isFaceApiLoaded(): boolean {
  return modelsLoaded;
}

export async function loadFaceApiModels(modelsUri = '/models'): Promise<boolean> {
  if (modelsLoaded) return true;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    try {
      // Primary: load from local /models
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelsUri),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelsUri),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelsUri),
      ]);
      modelsLoaded = true;
      return true;
    } catch (primaryErr) {
      console.warn('Local /models loading failed, trying jsdelivr CDN fallback...', primaryErr);
      try {
        const cdnUri = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(cdnUri),
          faceapi.nets.faceLandmark68Net.loadFromUri(cdnUri),
          faceapi.nets.faceRecognitionNet.loadFromUri(cdnUri),
        ]);
        modelsLoaded = true;
        return true;
      } catch (cdnErr) {
        console.error('Failed to load face-api neural models from both local and CDN:', cdnErr);
        modelsLoaded = false;
        return false;
      }
    }
  })();

  return modelsLoadingPromise;
}

/**
 * Detect face and extract 128-d deep neural descriptor using @vladmandic/face-api
 */
export async function detectAndExtractFaceApiDescriptor(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  options?: { scoreThreshold?: number; inputSize?: number }
): Promise<FaceApiExtractionResult> {
  if (!modelsLoaded) {
    const loaded = await loadFaceApiModels();
    if (!loaded) {
      return {
        hasFace: false,
        descriptor: null,
        detection: null,
        landmarks: null,
        error: 'Face recognition models could not be loaded.',
      };
    }
  }

  try {
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: options?.inputSize || 224,
      scoreThreshold: options?.scoreThreshold || 0.35,
    });

    const fullDetection = await faceapi
      .detectSingleFace(input, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!fullDetection || !fullDetection.descriptor) {
      return {
        hasFace: false,
        descriptor: null,
        detection: null,
        landmarks: null,
      };
    }

    const descriptorArray = Array.from(fullDetection.descriptor);

    return {
      hasFace: true,
      descriptor: descriptorArray,
      detection: fullDetection.detection,
      landmarks: fullDetection.landmarks,
    };
  } catch (err: any) {
    console.warn('Error during face-api detection:', err);
    return {
      hasFace: false,
      descriptor: null,
      detection: null,
      landmarks: null,
      error: err?.message || 'Face detection failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. EUCLIDEAN DISTANCE & BIOMETRIC VERIFICATION (Deep FaceNet Embeddings)
// ---------------------------------------------------------------------------
/**
 * Compares two 128-dimensional neural face descriptors.
 *
 * FaceNet / ResNet Euclidean distance:
 * - Distance <= 0.58: Same individual (Confidence 75% - 99%)
 * - Distance 0.59 - 0.64: Borderline / Low confidence
 * - Distance >= 0.65: Different individuals (Mismatch, blocks fake/proxy entries)
 */
export function compareFaceBiometrics(
  vector1: number[],
  vector2: number[],
  minConfidence = 70,
  maxDistanceThreshold = 0.58
): BiometricMatchResult {
  if (!Array.isArray(vector1) || !Array.isArray(vector2) || vector1.length === 0 || vector2.length === 0) {
    return {
      match: false,
      similarity: 0,
      distance: 9.99,
      confidence: 0,
      scoreLabel: 'Mismatch',
      reason: 'Biometric descriptor data is missing or empty.',
    };
  }

  if (vector1.length !== 128 || vector2.length !== 128) {
    return {
      match: false,
      similarity: 0,
      distance: 9.99,
      confidence: 0,
      scoreLabel: 'Mismatch',
      reason: 'Biometric vector format mismatch. Please re-enroll Face ID.',
    };
  }

  // 1. Calculate Euclidean Distance
  let sumSq = 0;
  for (let i = 0; i < 128; i++) {
    const diff = vector1[i] - vector2[i];
    sumSq += diff * diff;
  }
  const distance = Math.sqrt(sumSq);

  // 2. Similarity index (1.0 = identical; 0.0 = completely distinct)
  // Distance usually ranges from 0.0 to 1.3
  const similarity = Math.max(0, Math.min(1.0, 1.0 - distance / 1.15));

  // 3. Realistic Confidence Curve calibrated for 128-d FaceNet ResNet:
  // - distance <= 0.32 => 93% - 99%
  // - distance 0.33 .. 0.48 => 82% - 92%
  // - distance 0.49 .. 0.58 => 70% - 81%
  // - distance 0.59 .. 0.68 => 45% - 69%
  // - distance >= 0.69 => 10% - 44% (definite mismatch)
  let confidence = 0;
  if (distance <= 0.32) {
    confidence = Math.round(99 - (distance / 0.32) * 6);
  } else if (distance <= 0.48) {
    confidence = Math.round(92 - ((distance - 0.32) / 0.16) * 10);
  } else if (distance <= 0.58) {
    confidence = Math.round(81 - ((distance - 0.48) / 0.10) * 11);
  } else if (distance <= 0.68) {
    confidence = Math.round(68 - ((distance - 0.58) / 0.10) * 23);
  } else {
    confidence = Math.round(Math.max(8, 44 - ((distance - 0.68) / 0.40) * 35));
  }
  confidence = Math.min(99, Math.max(5, confidence));

  const isMatch = distance <= maxDistanceThreshold && confidence >= minConfidence;

  let scoreLabel: BiometricMatchResult['scoreLabel'] = 'Mismatch';
  if (confidence >= 90) scoreLabel = 'Very High';
  else if (confidence >= 80) scoreLabel = 'High';
  else if (confidence >= 70) scoreLabel = 'Moderate';
  else if (confidence >= 50) scoreLabel = 'Low';

  return {
    match: isMatch,
    similarity: Number(similarity.toFixed(4)),
    distance: Number(distance.toFixed(4)),
    confidence,
    scoreLabel,
    reason: isMatch
      ? `Biometric identity confirmed (${confidence}% match, distance: ${distance.toFixed(3)}).`
      : `Face mismatch (${confidence}% match, distance: ${distance.toFixed(3)}): Live face does not match enrolled profile. Proxy attendance blocked.`,
  };
}

/**
 * 1:N Facial Identification Kiosk Helper:
 * Compares live face descriptor against all registered employees in the organization.
 * Returns the best match only if distance <= 0.58 and confidence >= 70%.
 */
export function identifyFaceAcrossEmployees(
  liveDescriptor: number[],
  employees: any[],
  minConfidence = 70,
  maxDistanceThreshold = 0.58
): {
  matchedEmployee: any | null;
  bestConfidence: number;
  bestSimilarity: number;
  bestDistance: number;
  match: boolean;
  message: string;
} {
  if (!Array.isArray(liveDescriptor) || liveDescriptor.length !== 128 || !Array.isArray(employees)) {
    return {
      matchedEmployee: null,
      bestConfidence: 0,
      bestSimilarity: 0,
      bestDistance: 9.99,
      match: false,
      message: 'Invalid biometric parameters for recognition.',
    };
  }

  let bestEmp: any = null;
  let highestConfidence = 0;
  let highestSimilarity = 0;
  let lowestDistance = 9.99;

  for (const emp of employees) {
    if (!emp.faceEnrolled || !Array.isArray(emp.faceDescriptor) || emp.faceDescriptor.length !== 128) {
      continue;
    }

    const result = compareFaceBiometrics(liveDescriptor, emp.faceDescriptor, minConfidence, maxDistanceThreshold);
    if (result.distance < lowestDistance) {
      lowestDistance = result.distance;
      highestConfidence = result.confidence;
      highestSimilarity = result.similarity;
      if (result.match) {
        bestEmp = emp;
      }
    }
  }

  if (bestEmp) {
    return {
      matchedEmployee: bestEmp,
      bestConfidence: highestConfidence,
      bestSimilarity: highestSimilarity,
      bestDistance: lowestDistance,
      match: true,
      message: `Employee Authenticated: ${bestEmp.firstName} ${bestEmp.lastName} (${highestConfidence}% match).`,
    };
  }

  return {
    matchedEmployee: null,
    bestConfidence: highestConfidence,
    bestSimilarity: highestSimilarity,
    bestDistance: lowestDistance,
    match: false,
    message: highestConfidence > 45
      ? `Unrecognized Face (Best match only ${highestConfidence}%): Live face does not match any enrolled employee.`
      : 'No matching employee profile found for live camera face.',
  };
}

// ---------------------------------------------------------------------------
// 3. FRAME QUALITY & LIGHTING ASSESSMENT
// ---------------------------------------------------------------------------
export function assessFaceCaptureQuality(canvas: HTMLCanvasElement): FaceQualityResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return {
      isAcceptable: false,
      brightness: 0,
      contrast: 0,
      hasFacePresence: false,
      feedback: 'Camera frame not ready',
    };
  }

  const { width, height } = canvas;
  const startX = Math.floor(width * 0.2);
  const startY = Math.floor(height * 0.15);
  const sampleW = Math.floor(width * 0.6);
  const sampleH = Math.floor(height * 0.7);

  const imgData = ctx.getImageData(startX, startY, sampleW, sampleH);
  const data = imgData.data;

  let totalLuminance = 0;
  const pixelCount = data.length / 4;
  let skinToneMatches = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;

    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cr >= 130 && cr <= 175 && cb >= 75 && cb <= 130) {
      skinToneMatches++;
    }
  }

  const avgBrightness = Math.round(totalLuminance / pixelCount);

  let varianceSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    varianceSum += Math.pow(lum - avgBrightness, 2);
  }
  const contrast = Math.round(Math.sqrt(varianceSum / pixelCount));
  const skinRatio = skinToneMatches / pixelCount;

  const hasFacePresence = skinRatio >= 0.15 && contrast >= 15;

  let feedback = 'Face detected and aligned';
  let isAcceptable = true;

  if (avgBrightness < 45) {
    feedback = 'Lighting too dark. Please face towards a light source.';
    isAcceptable = false;
  } else if (avgBrightness > 230) {
    feedback = 'Lighting too bright or washed out. Reduce backlighting.';
    isAcceptable = false;
  } else if (contrast < 15) {
    feedback = 'Low contrast. Adjust camera position or room lighting.';
    isAcceptable = false;
  } else if (!hasFacePresence) {
    feedback = 'Please position your face directly inside the circular guide.';
    isAcceptable = false;
  }

  return {
    isAcceptable,
    brightness: avgBrightness,
    contrast,
    hasFacePresence,
    feedback,
  };
}

/**
 * Backward compatibility fallback extractor
 */
export function extractFaceBiometrics(canvas: HTMLCanvasElement): number[] {
  const result: number[] = new Array(128).fill(0);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return result;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const step = Math.max(1, Math.floor(data.length / (128 * 4)));
  for (let i = 0; i < 128; i++) {
    const idx = i * step * 4;
    if (idx < data.length - 4) {
      const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
      result[i] = Number((lum * 2 - 1).toFixed(4));
    }
  }
  return result;
}
