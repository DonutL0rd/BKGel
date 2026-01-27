import { GelSettings, LaneData, Band, Rect, SmearRegion } from '../types';

// --- HELPERS ---

const getGrayscaleValue = (data: Uint8ClampedArray, index: number, invert: boolean): number => {
  const val = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  return invert ? 255 - val : val;
};

const gaussianSmooth = (data: number[], windowSize: number): number[] => {
  const kernelSize = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
  const radius = Math.floor(kernelSize / 2);
  const sigma = radius / 3;
  const kernel = new Array(kernelSize);
  let sum = 0;

  for (let x = -radius; x <= radius; x++) {
    const g = (1 / (Math.sqrt(2 * Math.PI) * sigma)) * Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[x + radius] = g;
    sum += g;
  }
  for (let i = 0; i < kernelSize; i++) kernel[i] /= sum;

  const result = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let val = 0;
    for (let k = 0; k < kernelSize; k++) {
      const offset = k - radius;
      const idx = Math.min(Math.max(i + offset, 0), data.length - 1);
      val += data[idx] * kernel[k];
    }
    result[i] = val;
  }
  return result;
};

const medianFilter = (data: number[], windowSize: number): number[] => {
    const result = new Array(data.length);
    const half = Math.floor(windowSize / 2);
    for(let i=0; i<data.length; i++) {
        const start = Math.max(0, i - half);
        const end = Math.min(data.length, i + half + 1);
        const slice = data.slice(start, end).sort((a,b) => a-b);
        result[i] = slice[Math.floor(slice.length/2)];
    }
    return result;
};

const morphologicalOpening = (data: number[], radius: number): number[] => {
  const len = data.length;
  const eroded = new Array(len);
  // Erosion (Min)
  for (let i = 0; i < len; i++) {
    let min = data[i];
    const start = Math.max(0, i - radius);
    const end = Math.min(len - 1, i + radius);
    for (let j = start; j <= end; j++) {
      if (data[j] < min) min = data[j];
    }
    eroded[i] = min;
  }
  // Dilation (Max)
  const opened = new Array(len);
  for (let i = 0; i < len; i++) {
    let max = eroded[i];
    const start = Math.max(0, i - radius);
    const end = Math.min(len - 1, i + radius);
    for (let j = start; j <= end; j++) {
      if (eroded[j] > max) max = eroded[j];
    }
    opened[i] = max;
  }
  return opened;
};

// --- PRE-PROCESSING & ROI ---

export const detectIdeallyInverted = (data: Uint8ClampedArray, width: number, height: number): boolean => {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const sampleW = Math.floor(width * 0.2);
  const sampleH = Math.floor(height * 0.2);
  
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for(let y = centerY - sampleH/2; y < centerY + sampleH/2; y += 10) {
     for(let x = centerX - sampleW/2; x < centerX + sampleW/2; x += 10) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
        totalBrightness += lum;
        pixelCount++;
     }
  }
  const avg = pixelCount > 0 ? totalBrightness / pixelCount : 0;
  return avg > 100; // If bright, it's likely a white background => Invert
};

/**
 * Robust Rotation Detection using Gradient Projection.
 * Instead of raw intensity, we project the vertical gradient (edges).
 * Bands are horizontal edges. When aligned, the projection of horizontal edges is maximized.
 */
export const detectBestRotation = (data: Uint8ClampedArray, width: number, height: number): number => {
    const margin = 0.15;
    const cropX = Math.floor(width * margin);
    const cropY = Math.floor(height * margin);
    const cropW = Math.floor(width * (1 - 2 * margin));
    const cropH = Math.floor(height * (1 - 2 * margin));
    
    // 1. Pre-calculate specific row gradients to speed up loop
    // We only care about vertical gradients (horizontal lines)
    const getProjectedGradientVariance = (angleDeg: number) => {
        const rad = (angleDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cx = cropW / 2;
        const cy = cropH / 2;

        const projection = new Float32Array(cropW).fill(0);
        const counts = new Uint16Array(cropW).fill(0);
        const step = 4; // Sparsity for performance

        for (let y = 1; y < cropH - 1; y += step) {
            for (let x = 0; x < cropW; x += step) {
                // Coordinate in original space
                const sx = cropX + x;
                const sy = cropY + y;
                const idx = (sy * width + sx) * 4;
                const idxUp = ((sy - 1) * width + sx) * 4;
                const idxDown = ((sy + 1) * width + sx) * 4;
                
                // Simple vertical gradient kernel [-1, 0, 1]
                const valUp = data[idxUp] * 0.3 + data[idxUp+1] * 0.59 + data[idxUp+2] * 0.11;
                const valDown = data[idxDown] * 0.3 + data[idxDown+1] * 0.59 + data[idxDown+2] * 0.11;
                const grad = Math.abs(valDown - valUp);

                // Rotate destination bin
                const nx = (x - cx) * cos - (y - cy) * sin + cx;
                const bin = Math.floor(nx);
                if (bin >= 0 && bin < cropW) {
                    projection[bin] += grad;
                    counts[bin]++;
                }
            }
        }
        
        // Calculate variance of projection
        let sum = 0, sumSq = 0, n = 0;
        for (let i = 0; i < cropW; i++) {
            if (counts[i] > 0) {
                const val = projection[i] / counts[i];
                sum += val;
                sumSq += val * val;
                n++;
            }
        }
        return n > 0 ? (sumSq - (sum * sum) / n) / n : 0;
    };

    // Coarse Search
    let bestAngle = 0;
    let maxVar = -1;
    for (let a = -8; a <= 8; a += 1) {
        const v = getProjectedGradientVariance(a);
        if (v > maxVar) { maxVar = v; bestAngle = a; }
    }

    // Fine Search
    let refinedAngle = bestAngle;
    for (let a = bestAngle - 0.8; a <= bestAngle + 0.8; a += 0.1) {
        const v = getProjectedGradientVariance(a);
        if (v > maxVar) { maxVar = v; refinedAngle = a; }
    }
    return refinedAngle;
};

/**
 * Auto ROI using Otsu's Thresholding.
 * Determines optimal threshold to separate gel from background, then finds bounding box.
 */
export const autoDetectROI = (data: Uint8ClampedArray, width: number, height: number, invert: boolean): { top: number, bottom: number, left: number, right: number } => {
    // 1. Compute Histogram (on green channel approx)
    const histogram = new Uint32Array(256).fill(0);
    const step = 4;
    for(let i=0; i<data.length; i+=4*step) {
        const val = invert ? (255 - data[i+1]) : data[i+1];
        histogram[val]++;
    }

    // 2. Otsu's Method for Threshold
    let total = 0;
    for(let i=0; i<256; i++) total += histogram[i];
    
    let sum = 0;
    for(let i=0; i<256; i++) sum += i * histogram[i];
    
    let sumB = 0, wB = 0, wF = 0;
    let varMax = 0, threshold = 0;

    for(let t=0; t<256; t++) {
        wB += histogram[t];
        if(wB === 0) continue;
        wF = total - wB;
        if(wF === 0) break;
        
        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        
        if(varBetween > varMax) {
            varMax = varBetween;
            threshold = t;
        }
    }
    
    // Lower threshold slightly to be inclusive of faint bands
    threshold = Math.max(10, threshold * 0.8);

    // 3. Find Bounding Box of pixels > threshold
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    // Vertical scan for Y
    const xScanStep = 10;
    for(let y=0; y<height; y+=4) {
        for(let x=0; x<width; x+=xScanStep) {
            const idx = (y * width + x) * 4;
            const val = getGrayscaleValue(data, idx, !invert);
            if(val > threshold) {
                if(y < minY) minY = y;
                if(y > maxY) maxY = y;
            }
        }
    }
    
    // Horizontal scan for X (restricted to Y-bounds found)
    const yScanStep = 10;
    for(let x=0; x<width; x+=4) {
        for(let y=minY; y<maxY; y+=yScanStep) {
            const idx = (y * width + x) * 4;
            const val = getGrayscaleValue(data, idx, !invert);
            if(val > threshold) {
                if(x < minX) minX = x;
                if(x > maxX) maxX = x;
            }
        }
    }

    // 4. Pad and Normalize
    const padding = 0.05; // 5% padding
    const safeMinX = Math.max(0, minX - width * padding);
    const safeMaxX = Math.min(width, maxX + width * padding);
    const safeMinY = Math.max(0, minY - height * padding);
    const safeMaxY = Math.min(height, maxY + height * padding);

    return { 
        left: parseFloat(((safeMinX / width) * 100).toFixed(1)), 
        right: parseFloat((((width - safeMaxX) / width) * 100).toFixed(1)), 
        top: parseFloat(((safeMinY / height) * 100).toFixed(1)), 
        bottom: parseFloat((((height - safeMaxY) / height) * 100).toFixed(1)) 
    };
};

// --- LANE DETECTION ---

/**
 * Improved Lane Detection using combined Intensity and Edge Density.
 * Lanes are characterized by high signal (bands) AND high edge variation (bands).
 */
const detectLanes = (width: number, height: number, data: Uint8ClampedArray, settings: GelSettings): Rect[] => {
  const intensityProfile = new Float32Array(width).fill(0);
  const edgeProfile = new Float32Array(width).fill(0);
  
  const sampleTop = Math.floor(height * 0.1); 
  const sampleBottom = Math.floor(height * 0.9);
  const step = 2; 

  // 1. Build Profiles
  for (let x = 0; x < width; x++) {
    let iSum = 0;
    let eSum = 0;
    let n = 0;
    
    for (let y = sampleTop; y < sampleBottom; y += step) { 
      const idx = (y * width + x) * 4;
      const val = getGrayscaleValue(data, idx, !settings.invertImage);
      iSum += val;
      
      // Vertical Edge (simple diff)
      if (y > sampleTop) {
          const prevIdx = ((y - step) * width + x) * 4;
          const prevVal = getGrayscaleValue(data, prevIdx, !settings.invertImage);
          eSum += Math.abs(val - prevVal);
      }
      n++;
    }
    if (n > 0) {
        intensityProfile[x] = iSum / n;
        edgeProfile[x] = eSum / n;
    }
  }

  // 2. Combine Profiles
  // Normalize both
  const maxI = Math.max(...intensityProfile) || 1;
  const maxE = Math.max(...edgeProfile) || 1;
  
  const combinedProfile = new Array(width).fill(0);
  for(let x=0; x<width; x++) {
      // Score = Intensity * (1 + EdgeDensity)
      // Lanes have signal and texture (edges). Background is smooth or dark.
      combinedProfile[x] = (intensityProfile[x] / maxI) * (0.5 + 0.5 * (edgeProfile[x] / maxE));
  }

  // 3. Smooth and Detect
  const smoothed = gaussianSmooth(combinedProfile, 30);
  
  // Dynamic Threshold
  const avgVal = smoothed.reduce((a,b)=>a+b,0) / width;
  const maxVal = Math.max(...smoothed);
  const threshold = avgVal + (maxVal - avgVal) * 0.2 * (2.0 - settings.laneDetectionSensitivity);

  // Peak Finding
  const centers: number[] = [];
  const minLaneDist = width / 40;
  
  for(let i=10; i<width-10; i++) {
      if(smoothed[i] > threshold && smoothed[i] > smoothed[i-1] && smoothed[i] >= smoothed[i+1]) {
          // Check distance
          if (centers.length === 0 || (i - centers[centers.length-1]) > minLaneDist) {
              centers.push(i);
          } else {
              // If too close, keep the higher one
              const last = centers[centers.length-1];
              if (smoothed[i] > smoothed[last]) {
                  centers[centers.length-1] = i;
              }
          }
      }
  }

  // 4. Determine Boundaries (Valleys)
  const rects: Rect[] = [];
  centers.forEach((center, idx) => {
     let left = 0;
     let right = width;
     
     if (idx === 0) {
         let scan = center;
         while(scan > 0 && smoothed[scan] > smoothed[scan-1]) scan--; // Descent
         left = Math.max(0, scan - 10);
     } else {
         // Minimum between centers
         let minIdx = centers[idx-1];
         let minVal = Infinity;
         for(let k=centers[idx-1]; k<center; k++) {
             if(smoothed[k] < minVal) { minVal = smoothed[k]; minIdx = k; }
         }
         left = minIdx;
     }

     if (idx === centers.length - 1) {
         let scan = center;
         while(scan < width-1 && smoothed[scan] > smoothed[scan+1]) scan++; // Descent
         right = Math.min(width, scan + 10);
     } else {
         let minIdx = centers[idx+1];
         let minVal = Infinity;
         for(let k=center; k<centers[idx+1]; k++) {
             if(smoothed[k] < minVal) { minVal = smoothed[k]; minIdx = k; }
         }
         right = minIdx;
     }
     
     const laneW = right - left;
     const margin = laneW * (settings.laneMargin / 100);
     
     rects.push({
       x: Math.floor(left + margin/2),
       y: 0, 
       width: Math.floor(Math.max(1, laneW - margin)),
       height: height 
     });
  });

  return rects;
};

// --- BACKGROUND & ANALYSIS ---

const estimateBackground = (data: number[], settings: GelSettings): number[] => {
  if (settings.backgroundSubtractionMethod === 'none') {
      return new Array(data.length).fill(0);
  }
  
  const radius = settings.backgroundRollingBallRadius;
  const smooth = settings.backgroundSmoothing;

  if (settings.backgroundSubtractionMethod === 'median') {
      const median = medianFilter(data, radius); // Use radius as window size
      return gaussianSmooth(median, smooth);
  }

  // Default: Rolling Ball (approx via Morphological Opening)
  const opened = morphologicalOpening(data, radius);
  return gaussianSmooth(opened, smooth);
};

// --- PEAK FITTING & DECONVOLUTION ---

/**
 * Iterative Gaussian Deconvolution.
 * 1. Find initial peaks.
 * 2. Fit Gaussian mixture to reduce residual error using Gradient Descent.
 */
interface Gaussian {
    idx: number;    // Mean (Position)
    height: number; // Amplitude
    sigma: number;  // Width
}

const fitGaussians = (profile: number[], peaks: number[], settings: GelSettings): Gaussian[] => {
    const len = profile.length;
    // Initial Guesses
    let models: Gaussian[] = peaks.map(p => {
        // Estimate width (FWHM)
        let w = 1;
        while(p-w > 0 && profile[p-w] > profile[p]/2) w++;
        const sigma = Math.max(1.5, w / 1.17); // approx sigma from HWHM
        return { idx: p, height: profile[p], sigma };
    });

    const iterations = 15;
    const learningRate = 0.5;

    // Optimization Loop
    for (let iter = 0; iter < iterations; iter++) {
        // Calculate current sum model
        const currentModel = new Float32Array(len).fill(0);
        for(let x=0; x<len; x++) {
            let sum = 0;
            models.forEach(m => {
                if (Math.abs(x - m.idx) < 4 * m.sigma) {
                    sum += m.height * Math.exp(-0.5 * Math.pow((x - m.idx)/m.sigma, 2));
                }
            });
            currentModel[x] = sum;
        }

        // Adjust models based on residual at peak center
        models.forEach(m => {
            const x = Math.round(m.idx);
            if(x >= 0 && x < len) {
                const residual = profile[x] - currentModel[x];
                // Update height
                m.height += residual * learningRate;
                if(m.height < 0) m.height = 0;
            }
        });
    }
    
    return models;
};

interface DetectionResult {
  bands: Band[];
  smears: SmearRegion[];
}

const findBandsAndSmears = (
  profile: number[], 
  laneIndex: number, 
  settings: GelSettings
): DetectionResult => {
  const len = profile.length;
  const bands: Band[] = [];
  const smears: SmearRegion[] = [];
  
  const minProminence = (settings.minPeakProminence / 100) * 255; 
  const noiseFloor = settings.noiseTolerance;

  // 1. Initial Peak Finding
  // Simple local maxima with prominence check
  let peaks: number[] = [];
  for(let i=2; i<len-2; i++) {
      if(profile[i] > profile[i-1] && profile[i] > profile[i-2] && 
         profile[i] > profile[i+1] && profile[i] > profile[i+2]) {
         
         // Basic prominence check
         let minL = profile[i], minR = profile[i];
         for(let k=i-1; k>=Math.max(0, i-50); k--) if(profile[k]<minL) minL = profile[k];
         for(let k=i+1; k<Math.min(len, i+50); k++) if(profile[k]<minR) minR = profile[k];
         const prom = profile[i] - Math.max(minL, minR);
         
         if (prom > minProminence && profile[i] > noiseFloor) {
             peaks.push(i);
         }
      }
  }
  
  // Filter close peaks
  peaks.sort((a,b) => profile[b] - profile[a]);
  const finalPeaks: number[] = [];
  peaks.forEach(p => {
      if (!finalPeaks.some(fp => Math.abs(fp - p) < settings.minPeakDistance)) {
          finalPeaks.push(p);
      }
  });
  finalPeaks.sort((a,b) => a-b);

  // 2. Gaussian Deconvolution
  const gaussians = fitGaussians(profile, finalPeaks, settings);

  // 3. Create Bands from Gaussians
  // Calculate analytic volume for overlapping bands
  gaussians.forEach((g, i) => {
      // Gaussian Integral = height * sigma * sqrt(2*PI)
      const volume = g.height * g.sigma * 2.5066; 
      
      // Determine logical boundaries for visualization (2 sigma)
      const start = Math.max(0, Math.floor(g.idx - 2 * g.sigma));
      const end = Math.min(len-1, Math.ceil(g.idx + 2 * g.sigma));

      bands.push({
        id: `L${laneIndex}-B${i + 1}`,
        laneIndex,
        yPeak: Math.round(g.idx),
        yStart: start,
        yEnd: end,
        volume: volume,
        relativeMobility: g.idx / len,
        isMainBand: false,
        isExcluded: false,
        isManual: false
      });
  });

  // 4. Adaptive Smear Detection
  // Subtract band models from profile to get residual
  const residualProfile = new Float32Array(len);
  for(let x=0; x<len; x++) residualProfile[x] = profile[x];
  
  gaussians.forEach(g => {
      for(let x=Math.max(0, Math.floor(g.idx - 4*g.sigma)); x<Math.min(len, Math.ceil(g.idx + 4*g.sigma)); x++) {
          const y = g.height * Math.exp(-0.5 * Math.pow((x - g.idx)/g.sigma, 2));
          residualProfile[x] = Math.max(0, residualProfile[x] - y);
      }
  });

  // Calculate dynamic noise floor from residual histogram
  // The mode (most frequent value) is likely the background noise
  const hist = new Uint32Array(256).fill(0);
  for(let x=0; x<len; x++) {
      const val = Math.min(255, Math.floor(residualProfile[x]));
      hist[val]++;
  }
  let maxCount = 0; 
  let modeVal = 0;
  for(let i=0; i<30; i++) { // Check lower range for noise mode
      if(hist[i] > maxCount) { maxCount = hist[i]; modeVal = i; }
  }
  const dynamicThreshold = Math.max(noiseFloor, modeVal * 2.5);

  let smearStart = -1;
  const minSmearWidth = settings.minPeakDistance * 2;

  for(let x=0; x<len; x++) {
      if (residualProfile[x] > dynamicThreshold) {
          if (smearStart === -1) smearStart = x;
      } else {
          if (smearStart !== -1) {
              const smearEnd = x - 1;
              if (smearEnd - smearStart > minSmearWidth) {
                  let vol = 0;
                  for(let k=smearStart; k<=smearEnd; k++) vol += residualProfile[k];
                  smears.push({
                      id: `L${laneIndex}-S${smears.length + 1}`,
                      yStart: smearStart,
                      yEnd: smearEnd,
                      volume: vol
                  });
              }
              smearStart = -1;
          }
      }
  }

  return { bands: bands.sort((a,b) => a.yPeak - b.yPeak), smears };
};

// --- MAIN PROCESSOR ---

export interface ManualOverrides {
  excludedBands: string[];
  mainBands: Record<number, string>;
  userBands: Record<number, Band[]>;
  bandAdjustments: Record<string, { yStart: number; yEnd: number }>;
}

export const processGelImage = (
  originalImageData: ImageData,
  settings: GelSettings,
  manualOverrides: ManualOverrides
): LaneData[] => {
  const { width: origW, height: origH, data: origData } = originalImageData;
  const cropX = Math.floor((settings.roiLeft / 100) * origW);
  const cropY = Math.floor((settings.roiTop / 100) * origH);
  const cropW = Math.floor(((100 - settings.roiRight - settings.roiLeft) / 100) * origW);
  const cropH = Math.floor(((100 - settings.roiBottom - settings.roiTop) / 100) * origH);
  
  if (cropW <= 0 || cropH <= 0) return [];

  const croppedData = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcY = cropY + y;
    const srcStart = (srcY * origW + cropX) * 4;
    for (let i = 0; i < cropW * 4; i++) {
      croppedData[y * cropW * 4 + i] = origData[srcStart + i];
    }
  }

  const width = cropW;
  const height = cropH;
  const data = croppedData;

  let laneRects: Rect[] = [];
  if (settings.autoDetectLanes) {
    laneRects = detectLanes(width, height, data, settings);
  }
  
  if (!settings.autoDetectLanes || laneRects.length === 0) {
    laneRects = [];
    const laneWidth = width / settings.numLanes;
    const effectiveLaneWidth = laneWidth * (1 - settings.laneMargin / 100);
    const marginPx = (laneWidth - effectiveLaneWidth) / 2;
    for (let i = 0; i < settings.numLanes; i++) {
      laneRects.push({
        x: Math.floor(i * laneWidth + marginPx),
        y: 0,
        width: Math.floor(effectiveLaneWidth),
        height: height
      });
    }
  }

  const laneData: LaneData[] = [];

  laneRects.forEach((rect, i) => {
    const laneIndex = i + 1;

    const rawProfile = new Array(rect.height).fill(0);
    for (let y = 0; y < rect.height; y++) {
      let rowSum = 0;
      const imgY = rect.y + y;
      for (let x = 0; x < rect.width; x++) {
        const idx = (imgY * width + (rect.x + x)) * 4;
        const val = getGrayscaleValue(data, idx, !settings.invertImage); 
        rowSum += val;
      }
      rawProfile[y] = rowSum / rect.width;
    }

    const smoothedRaw = gaussianSmooth(rawProfile, settings.smoothing);
    const backgroundProfile = estimateBackground(smoothedRaw, settings);
    const netProfile = smoothedRaw.map((v, idx) => Math.max(0, v - backgroundProfile[idx]));

    const detection = findBandsAndSmears(netProfile, laneIndex, settings);
    let bands = detection.bands;
    const smears = detection.smears;

    const userBandsForLane = manualOverrides.userBands[laneIndex] || [];
    userBandsForLane.forEach(ub => {
       let { yStart, yEnd } = ub;
       yStart = Math.max(0, yStart);
       yEnd = Math.min(netProfile.length - 1, yEnd);
       let vol = 0;
       for(let k=yStart; k<=yEnd; k++) vol += netProfile[k];
       bands.push({
         ...ub, yStart, yEnd, volume: vol,
         relativeMobility: ub.yPeak / rect.height,
         isExcluded: false 
       });
    });

    bands.sort((a,b) => a.yPeak - b.yPeak);

    bands = bands.map(b => {
      const adjustment = manualOverrides.bandAdjustments[b.id];
      let { yStart, yEnd } = b;
      if (adjustment) {
        yStart = Math.max(0, adjustment.yStart);
        yEnd = Math.min(netProfile.length - 1, adjustment.yEnd);
      }
      // If manual adjustment, recalculate volume based on raw sum rather than Gaussian
      if (adjustment || b.isManual) {
           let volume = 0;
           for (let k = yStart; k <= yEnd; k++) volume += netProfile[k];
           return { ...b, yStart, yEnd, volume, isExcluded: manualOverrides.excludedBands.includes(b.id) };
      }
      return { ...b, isExcluded: manualOverrides.excludedBands.includes(b.id) };
    });

    const activeBands = bands.filter(b => !b.isExcluded);

    let mainBand: Band | null = null;
    const forcedMainId = manualOverrides.mainBands[laneIndex];
    if (forcedMainId) mainBand = activeBands.find(b => b.id === forcedMainId) || null;
    if (!mainBand && activeBands.length > 0) mainBand = activeBands.reduce((prev, current) => (prev.volume > current.volume) ? prev : current);
    
    if (mainBand) {
      const mainBandId = mainBand.id;
      bands = bands.map(b => ({ ...b, isMainBand: b.id === mainBandId }));
    }

    const totalLaneVolume = netProfile.reduce((a, b) => a + b, 0);
    let bandedVolume = 0;
    let degradationVolume = 0;
    
    if (mainBand) {
      const mbY = mainBand.yPeak;
      activeBands.forEach(b => {
         if (b.yPeak <= mbY) {
             bandedVolume += b.volume;
         } else {
             degradationVolume += b.volume;
         }
      });

      smears.forEach(s => {
          const center = (s.yStart + s.yEnd) / 2;
          if (center <= mbY) {
              bandedVolume += s.volume;
          } else {
              degradationVolume += s.volume;
          }
      });
    } else {
       degradationVolume = totalLaneVolume;
    }

    let integrityScore = 0;
    const relevantTotal = bandedVolume + degradationVolume;
    
    if (relevantTotal > 0 && mainBand) {
      integrityScore = (bandedVolume / relevantTotal) * 100;
    }

    const displayRect: Rect = {
      x: rect.x + cropX,
      y: rect.y + cropY,
      width: rect.width,
      height: rect.height
    };

    laneData.push({
      index: laneIndex,
      rect: displayRect,
      rawProfile: smoothedRaw,
      backgroundProfile,
      netProfile,
      bands,
      smears,
      totalLaneVolume,
      mainBandVolume: bandedVolume,
      degradationVolume,
      integrityScore
    });
  });

  return laneData;
};
