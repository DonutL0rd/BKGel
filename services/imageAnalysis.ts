import { GelSettings, LaneData, Band, Rect, SmearRegion } from '../types';

// Helper: Convert RGB to Grayscale
const getGrayscaleValue = (data: Uint8ClampedArray, index: number, invert: boolean): number => {
  const val = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  return invert ? 255 - val : val;
};

// Auto-detect if image needs inversion (Light background -> needs invert)
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

export const detectBestRotation = (data: Uint8ClampedArray, width: number, height: number): number => {
    const shouldInvert = detectIdeallyInverted(data, width, height);
    const margin = 0.1;
    const cropX = Math.floor(width * margin);
    const cropY = Math.floor(height * margin);
    const cropW = Math.floor(width * (1 - 2 * margin));
    const cropH = Math.floor(height * (1 - 2 * margin));

    const getProjectionVariance = (angleDeg: number) => {
        const rad = (angleDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cx = cropW / 2;
        const cy = cropH / 2;

        const projection = new Float32Array(cropW).fill(0);
        const counts = new Uint16Array(cropW).fill(0);
        const step = 2; 

        for (let y = 0; y < cropH; y += step) {
            for (let x = 0; x < cropW; x += step) {
                const nx = (x - cx) * cos - (y - cy) * sin + cx;
                if (nx >= 0 && nx < cropW) {
                    const idx = ((cropY + y) * width + (cropX + x)) * 4;
                    const val = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
                    const signal = shouldInvert ? (255 - val) : val;
                    const bin = Math.floor(nx);
                    if (bin >= 0 && bin < cropW) {
                        projection[bin] += signal;
                        counts[bin]++;
                    }
                }
            }
        }

        let sum = 0;
        let sumSq = 0;
        let n = 0;
        for (let i = 0; i < cropW; i++) {
            if (counts[i] > 0) {
                const val = projection[i] / counts[i];
                sum += val;
                sumSq += val * val;
                n++;
            }
        }
        if (n === 0) return 0;
        return (sumSq - (sum * sum) / n) / n;
    };

    let bestAngle = 0;
    let maxVar = -1;
    for (let a = -10; a <= 10; a += 1) {
        const v = getProjectionVariance(a);
        if (v > maxVar) { maxVar = v; bestAngle = a; }
    }

    let refinedAngle = bestAngle;
    for (let a = bestAngle - 1; a <= bestAngle + 1; a += 0.1) {
        const v = getProjectionVariance(a);
        if (v > maxVar) { maxVar = v; refinedAngle = a; }
    }
    return refinedAngle;
};

export const autoDetectROI = (data: Uint8ClampedArray, width: number, height: number, invert: boolean): { top: number, bottom: number, left: number, right: number } => {
    const xProfile = new Float32Array(width).fill(0);
    const yProfile = new Float32Array(height).fill(0);
    const step = 2;

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const idx = (y * width + x) * 4;
            const val = getGrayscaleValue(data, idx, !invert);
            xProfile[x] += val;
            yProfile[y] += val;
        }
    }

    const findBounds = (rawProfile: Float32Array, length: number) => {
        const profile = gaussianSmooth(Array.from(rawProfile), 20);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < length; i++) {
            if (profile[i] < min) min = profile[i];
            if (profile[i] > max) max = profile[i];
        }

        const range = max - min;
        const threshold = min + (range * 0.15); 

        const center = Math.floor(length / 2);
        let start = 0;
        let tempStart = center;
        while(tempStart > 0 && profile[tempStart] > threshold) tempStart--;
        start = tempStart;

        let tempEnd = center;
        while(tempEnd < length - 1 && profile[tempEnd] > threshold) tempEnd++;
        let end = tempEnd;

        if (start === center && end === center) {
             for(let i=0; i<length; i++) if (profile[i] > threshold) { start = i; break; }
             for(let i=length-1; i>=0; i--) if (profile[i] > threshold) { end = i; break; }
        }
        return { start, end };
    };

    const xBounds = findBounds(xProfile, width);
    const yBounds = findBounds(yProfile, height);

    const padX = Math.floor(width * 0.02);
    const padY = Math.floor(height * 0.02);

    const safeStartX = Math.max(0, xBounds.start - padX);
    const safeEndX = Math.min(width, xBounds.end + padX);
    const safeStartY = Math.max(0, yBounds.start - padY);
    const safeEndY = Math.min(height, yBounds.end + padY);

    return { 
        left: parseFloat(((safeStartX / width) * 100).toFixed(1)), 
        right: parseFloat((((width - safeEndX) / width) * 100).toFixed(1)), 
        top: parseFloat(((safeStartY / height) * 100).toFixed(1)), 
        bottom: parseFloat((((height - safeEndY) / height) * 100).toFixed(1)) 
    };
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

const estimateBackground = (data: number[], radius: number, smoothing: number): number[] => {
  const len = data.length;
  const eroded = new Array(len);
  for (let i = 0; i < len; i++) {
    let min = data[i];
    const start = Math.max(0, i - radius);
    const end = Math.min(len - 1, i + radius);
    for (let j = start; j <= end; j++) {
      if (data[j] < min) min = data[j];
    }
    eroded[i] = min;
  }
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
  return gaussianSmooth(opened, smoothing);
};

// IMPROVED LANE DETECTION: Uses Variance/Standard Deviation Profile
const detectLanes = (width: number, height: number, data: Uint8ClampedArray, settings: GelSettings): Rect[] => {
  const varProfile = new Array(width).fill(0);
  const sampleTop = Math.floor(height * 0.1); 
  const sampleBottom = Math.floor(height * 0.9);
  const step = 2; 
  
  // Calculate vertical variance profile
  // Lanes have high variance (peaks + valleys), background has low variance
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = sampleTop; y < sampleBottom; y += step) { 
      const idx = (y * width + x) * 4;
      const val = getGrayscaleValue(data, idx, !settings.invertImage);
      sum += val;
      sumSq += val * val;
      n++;
    }
    if (n > 0) {
        const mean = sum / n;
        const variance = (sumSq / n) - (mean * mean);
        varProfile[x] = Math.sqrt(Math.max(0, variance)); // Standard Deviation
    }
  }
  
  // Strong smoothing to merge bands within a lane into a single "lane mound"
  const smoothed = gaussianSmooth(varProfile, 30); 
  
  // Normalize profile
  const maxVal = Math.max(...smoothed);
  if (maxVal === 0) return [];
  
  const normProfile = smoothed.map(v => v / maxVal);
  const threshold = 0.2 * settings.laneDetectionSensitivity; // Dynamic threshold based on sensitivity

  const centers: number[] = [];
  
  // Find peaks in variance profile
  for(let i = 10; i < width - 10; i++) {
      if (normProfile[i] > threshold && 
          normProfile[i] > normProfile[i-1] && 
          normProfile[i] > normProfile[i+1]) {
          
          // Check proximity to existing centers
          if (centers.length === 0 || (i - centers[centers.length-1] > width / 30)) {
               centers.push(i);
          }
      }
  }

  if (centers.length === 0) return [];

  // Determine lane widths based on valleys between peaks
  const rects: Rect[] = [];
  centers.forEach((center, idx) => {
     let left = 0;
     let right = width;
     
     // Find valley to the left
     if (idx === 0) {
         // Guess based on width of peak (half-max)
         let scan = center;
         while(scan > 0 && normProfile[scan] > normProfile[center] * 0.5) scan--;
         left = Math.max(0, center - (center - scan) * 1.5);
     } else {
         // Midpoint between centers is usually a good approximation for the boundary
         left = (centers[idx-1] + center) / 2;
     }

     // Find valley to the right
     if (idx === centers.length - 1) {
         let scan = center;
         while(scan < width-1 && normProfile[scan] > normProfile[center] * 0.5) scan++;
         right = Math.min(width, center + (scan - center) * 1.5);
     } else {
         right = (center + centers[idx+1]) / 2;
     }
     
     const laneW = right - left;
     // Add margin
     const margin = laneW * (settings.laneMargin / 100);
     
     rects.push({
       x: Math.floor(left + margin/2),
       y: 0, 
       width: Math.floor(laneW - margin),
       height: height 
     });
  });

  return rects;
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

  let peakIndices: number[] = [];
  for (let i = 2; i < len - 2; i++) {
    if (profile[i] > profile[i-1] && profile[i] > profile[i-2] && 
        profile[i] > profile[i+1] && profile[i] > profile[i+2]) {
      if (profile[i] > noiseFloor + minProminence) {
        peakIndices.push(i);
      }
    }
  }

  if (settings.minPeakDistance > 0) {
    peakIndices.sort((a, b) => profile[b] - profile[a]);
    const acceptedPeaks: number[] = [];
    for (const p of peakIndices) {
      let tooClose = false;
      for (const existing of acceptedPeaks) {
        if (Math.abs(p - existing) < settings.minPeakDistance) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) acceptedPeaks.push(p);
    }
    peakIndices = acceptedPeaks.sort((a, b) => a - b);
  }

  const gaussians = peakIndices.map(idx => {
    const height = profile[idx];
    let leftX = idx;
    while(leftX > 0 && profile[leftX] > height/2) leftX--;
    let rightX = idx;
    while(rightX < len - 1 && profile[rightX] > height/2) rightX++;
    const fwhm = (rightX - leftX) || 2;
    const sigma = Math.max(1.0, fwhm / 2.355); 
    return { idx, height, sigma };
  });

  const bandVolumes = new Array(gaussians.length).fill(0);
  const modelSumProfile = new Array(len).fill(0);

  for (let x = 0; x < len; x++) {
    let sumWeights = 0;
    const weights: number[] = [];
    if (profile[x] <= noiseFloor) continue;
    gaussians.forEach((g, gIdx) => {
      const exponent = -0.5 * Math.pow((x - g.idx) / g.sigma, 2);
      if (Math.abs(x - g.idx) <= 4 * g.sigma) {
        const w = g.height * Math.exp(exponent);
        weights[gIdx] = w;
        sumWeights += w;
      } else {
        weights[gIdx] = 0;
      }
    });

    if (sumWeights > 0.0001) {
      modelSumProfile[x] = sumWeights; 
      gaussians.forEach((g, gIdx) => {
        if (weights[gIdx] > 0) {
          bandVolumes[gIdx] += profile[x] * (weights[gIdx] / sumWeights);
        }
      });
    }
  }

  gaussians.forEach((g, i) => {
    const adaptiveThreshold = Math.max(noiseFloor, g.height * 0.05);
    const maxHalfWidth = settings.bandBoundarySigma * g.sigma;
    
    let s = g.idx;
    while(s > 0 && profile[s] > adaptiveThreshold && (g.idx - s) < maxHalfWidth * 1.5) {
        if (s > 1 && profile[s-1] > profile[s] + noiseFloor) break;
        s--;
    }
    const start = s;

    let e = g.idx;
    while(e < len - 1 && profile[e] > adaptiveThreshold && (e - g.idx) < maxHalfWidth * 1.5) {
        if (e < len - 2 && profile[e+1] > profile[e] + noiseFloor) break;
        e++;
    }
    const end = e;

    bands.push({
      id: `L${laneIndex}-B${i + 1}`,
      laneIndex,
      yPeak: g.idx,
      yStart: start,
      yEnd: end,
      volume: bandVolumes[i],
      relativeMobility: g.idx / len,
      isMainBand: false,
      isExcluded: false,
      isManual: false
    });
  });

  const residueProfile = new Array(len).fill(0);
  for(let x=0; x<len; x++) residueProfile[x] = Math.max(0, profile[x] - modelSumProfile[x]);

  let smearStart = -1;
  const minSmearWidth = settings.minPeakDistance * 2;
  
  for(let x=0; x<len; x++) {
    const isSmear = residueProfile[x] > noiseFloor;
    if (isSmear) {
      if (smearStart === -1) smearStart = x;
    } else {
      if (smearStart !== -1) {
        const smearEnd = x - 1;
        if ((smearEnd - smearStart) > minSmearWidth) {
           let vol = 0;
           let sumIntensity = 0;
           for(let k=smearStart; k<=smearEnd; k++) {
               vol += residueProfile[k];
               sumIntensity += residueProfile[k];
           }
           const avgIntensity = sumIntensity / (smearEnd - smearStart + 1);
           if (vol > minProminence * 10 && avgIntensity > noiseFloor * 1.5) {
             smears.push({
               id: `L${laneIndex}-S${smears.length + 1}`,
               yStart: smearStart,
               yEnd: smearEnd,
               volume: vol
             });
           }
        }
        smearStart = -1;
      }
    }
  }

  return { bands: bands.sort((a,b) => a.yPeak - b.yPeak), smears };
};

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
    const backgroundProfile = estimateBackground(smoothedRaw, settings.backgroundRollingBallRadius, settings.backgroundSmoothing);
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
      let volume = 0;
      for (let k = yStart; k <= yEnd; k++) volume += netProfile[k];
      return { ...b, yStart, yEnd, volume, isExcluded: manualOverrides.excludedBands.includes(b.id) };
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
