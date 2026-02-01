import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Settings, Activity, AlertCircle, ScanLine, Crop, Trash2, Star, RotateCcw, RotateCw, PlusCircle, ImageDown, Wand2, MousePointer2 } from 'lucide-react';
import { GelSettings, LaneData, Band, InteractionMode } from './types';
import { processGelImage, detectIdeallyInverted, autoDetectROI, detectBestRotation } from './services/imageAnalysis';
import GelImageCanvas from './components/GelImageCanvas';
import Densitogram from './components/Densitogram';
import ResultsTable from './components/ResultsTable';
import ComparativeAnalysis from './components/ComparativeAnalysis';

const DEFAULT_SETTINGS: GelSettings = {
  autoDetectLanes: true,
  numLanes: 10,
  laneMargin: 10,
  laneDetectionSensitivity: 1.1,
  roiTop: 0,
  roiBottom: 0,
  roiLeft: 0,
  roiRight: 0,
  invertImage: false,
  backgroundSubtractionMethod: 'rollingBall', // Default
  backgroundRollingBallRadius: 150, 
  backgroundSmoothing: 30, 
  minPeakProminence: 2, 
  smoothing: 5, 
  minPeakDistance: 5,
  noiseTolerance: 3, 
  bandBoundarySigma: 2.5, 
  showBackgroundProfile: true,
};

export default function App() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [effectiveImageSrc, setEffectiveImageSrc] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  
  const [settings, setSettings] = useState<GelSettings>(DEFAULT_SETTINGS);
  const [results, setResults] = useState<LaneData[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedBandId, setSelectedBandId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [addBandMode, setAddBandMode] = useState(false);
  const [hasAutoInverted, setHasAutoInverted] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');

  // Manual Overrides
  const [excludedBands, setExcludedBands] = useState<string[]>([]);
  const [mainBandOverrides, setMainBandOverrides] = useState<Record<number, string>>({});
  const [userBands, setUserBands] = useState<Record<number, Band[]>>({});
  const [bandAdjustments, setBandAdjustments] = useState<Record<string, { yStart: number; yEnd: number }>>({});

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setOriginalImageSrc(evt.target?.result as string);
        setRotation(0);
        resetOverrides();
        setSettings(prev => ({ ...prev, roiTop: 0, roiBottom: 0, roiLeft: 0, roiRight: 0 }));
        setHasAutoInverted(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetOverrides = () => {
    setExcludedBands([]);
    setMainBandOverrides({});
    setUserBands({});
    setBandAdjustments({});
    setSelectedBandId(null);
  };

  useEffect(() => {
    if (!originalImageSrc) {
      setEffectiveImageSrc(null);
      return;
    }

    const img = new Image();
    img.src = originalImageSrc;
    img.onload = () => {
      if (rotation === 0) {
        setEffectiveImageSrc(originalImageSrc);
        return;
      }
      const canvas = document.createElement('canvas');
      const isPortrait = rotation % 180 !== 0;
      canvas.width = isPortrait ? img.height : img.width;
      canvas.height = isPortrait ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        setEffectiveImageSrc(canvas.toDataURL());
      }
    };
  }, [originalImageSrc, rotation]);

  useEffect(() => {
    if (!effectiveImageSrc) return;

    setIsProcessing(true);
    const timer = setTimeout(() => {
      const img = new Image();
      img.src = effectiveImageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (!hasAutoInverted) {
             const shouldInvert = detectIdeallyInverted(imageData.data, canvas.width, canvas.height);
             if (shouldInvert !== settings.invertImage) {
                 updateSetting('invertImage', shouldInvert);
                 setHasAutoInverted(true); 
                 return; 
             }
             setHasAutoInverted(true); 
          }

          const data = processGelImage(imageData, settings, { 
            excludedBands, 
            mainBands: mainBandOverrides,
            userBands,
            bandAdjustments
          });
          setResults(data);
          setIsProcessing(false);
          if (data.length > 0 && selectedLane === null) {
            setSelectedLane(1);
          }
        }
      };
    }, 50);

    return () => clearTimeout(timer);
  }, [effectiveImageSrc, settings, excludedBands, mainBandOverrides, userBands, bandAdjustments, hasAutoInverted]);

  const updateSetting = <K extends keyof GelSettings>(key: K, value: GelSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleAutoAlign = () => {
      if (!effectiveImageSrc) return;
      const img = new Image();
      img.src = effectiveImageSrc;
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              
              const skewAngle = detectBestRotation(imageData.data, canvas.width, canvas.height);
              
              const rotatedCanvas = document.createElement('canvas');
              rotatedCanvas.width = canvas.width;
              rotatedCanvas.height = canvas.height;
              const rCtx = rotatedCanvas.getContext('2d');
              
              if (rCtx) {
                  rCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
                  rCtx.rotate((skewAngle * Math.PI) / 180);
                  rCtx.drawImage(img, -img.width / 2, -img.height / 2);
                  rCtx.setTransform(1, 0, 0, 1, 0, 0); 

                  const rotatedData = rCtx.getImageData(0, 0, rotatedCanvas.width, rotatedCanvas.height);
                  const roi = autoDetectROI(rotatedData.data, rotatedCanvas.width, rotatedCanvas.height, settings.invertImage);
                  
                  if (Math.abs(skewAngle) > 0.1) {
                    setRotation(prev => prev + skewAngle);
                  }
                  
                  setSettings(prev => ({
                      ...prev,
                      roiTop: roi.top,
                      roiBottom: roi.bottom,
                      roiLeft: roi.left,
                      roiRight: roi.right
                  }));
              }
          }
      };
  };

  const toggleExcludeBand = (bandId: string) => {
    if (bandId.startsWith('L') && bandId.includes('-M')) {
       if (window.confirm("Are you sure you want to permanently delete this manual band?")) {
           const laneIdx = parseInt(bandId.split('-')[0].replace('L',''));
           setUserBands(prev => ({
             ...prev,
             [laneIdx]: (prev[laneIdx] || []).filter(b => b.id !== bandId)
           }));
           if (selectedBandId === bandId) setSelectedBandId(null);
       }
    } else {
       setExcludedBands(prev => {
         if (prev.includes(bandId)) return prev.filter(id => id !== bandId);
         return [...prev, bandId];
       });
    }
  };

  const setMainBand = (laneIndex: number, bandId: string) => {
    setMainBandOverrides(prev => ({ ...prev, [laneIndex]: bandId }));
  };

  const resetLaneOverrides = (laneIndex: number) => {
    const newMain = { ...mainBandOverrides };
    delete newMain[laneIndex];
    setMainBandOverrides(newMain);
    const prefix = `L${laneIndex}-`;
    setExcludedBands(prev => prev.filter(id => !id.startsWith(prefix)));
    const newUserBands = { ...userBands };
    delete newUserBands[laneIndex];
    setUserBands(newUserBands);
    const newAdj = { ...bandAdjustments };
    Object.keys(newAdj).forEach(key => {
      if (key.startsWith(prefix)) delete newAdj[key];
    });
    setBandAdjustments(newAdj);
  };

  const rotate = (direction: 'cw' | 'ccw') => {
    setRotation(prev => {
      let next = direction === 'cw' ? prev + 90 : prev - 90;
      return (next % 360 + 360) % 360; 
    });
    resetOverrides();
    setSettings(prev => ({ ...prev, roiTop: 0, roiBottom: 0, roiLeft: 0, roiRight: 0 }));
  };

  const handleChartClick = (index: number) => {
    if (!selectedLane) return;
    const lane = results.find(l => l.index === selectedLane);
    const clickedBand = lane?.bands.find(b => index >= b.yStart && index <= b.yEnd);

    if (addBandMode) {
      const newBandId = `L${selectedLane}-M${Date.now()}`;
      const defaultWidth = 10;
      const newBand: Band = {
        id: newBandId,
        laneIndex: selectedLane,
        yPeak: index,
        yStart: Math.max(0, index - defaultWidth),
        yEnd: index + defaultWidth,
        volume: 0, 
        relativeMobility: 0,
        isMainBand: false,
        isExcluded: false,
        isManual: true
      };
      
      setUserBands(prev => ({
        ...prev,
        [selectedLane]: [...(prev[selectedLane] || []), newBand]
      }));
      setAddBandMode(false); 
      setSelectedBandId(newBandId);
    } else if (clickedBand) {
      setSelectedBandId(clickedBand.id);
    } else {
      setSelectedBandId(null);
    }
  };

  const updateBandBoundaries = (start: number, end: number) => {
    if (!selectedBandId) return;
    setBandAdjustments(prev => ({
      ...prev,
      [selectedBandId]: { yStart: start, yEnd: end }
    }));
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-200">
      <aside className="w-full md:w-80 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 overflow-y-auto h-screen sticky top-0">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="text-blue-500" size={24} />
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">BioQuant <span className="text-slate-500 font-normal text-sm">v3.0</span></h1>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-2 p-4 border-2 border-dashed border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors text-center">
            <Upload className="mx-auto text-blue-500" size={24} />
            <span className="text-sm font-medium text-slate-400">Upload Gel Image</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        {originalImageSrc && (
          <div className="flex gap-2 justify-center border-b border-slate-800 pb-4">
            <button onClick={() => rotate('ccw')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 rounded hover:bg-slate-700 transition-colors">
              <RotateCcw size={14} /> -90°
            </button>
             <button onClick={() => rotate('cw')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 rounded hover:bg-slate-700 transition-colors">
              <RotateCw size={14} /> +90°
            </button>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
               <Crop size={16} className="text-slate-500" />
               <h2 className="text-sm font-semibold text-slate-300">Image Crop</h2>
            </div>
            {effectiveImageSrc && (
                <button 
                  onClick={handleAutoAlign}
                  className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium bg-blue-900/30 px-2 py-1 rounded"
                  title="Auto-detect ROI and straighten image"
                >
                   <Wand2 size={12} /> Auto
                </button>
            )}
          </div>

          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Top %</label>
                <input type="number" min="0" max="100" value={Math.round(settings.roiTop)} onChange={(e) => updateSetting('roiTop', Number(e.target.value))} className="w-full mt-1 border border-slate-700 bg-slate-800 text-slate-200 rounded px-2 py-1 text-sm"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Bottom %</label>
                <input type="number" min="0" max="100" value={Math.round(settings.roiBottom)} onChange={(e) => updateSetting('roiBottom', Number(e.target.value))} className="w-full mt-1 border border-slate-700 bg-slate-800 text-slate-200 rounded px-2 py-1 text-sm"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Left %</label>
                <input type="number" min="0" max="100" value={Math.round(settings.roiLeft)} onChange={(e) => updateSetting('roiLeft', Number(e.target.value))} className="w-full mt-1 border border-slate-700 bg-slate-800 text-slate-200 rounded px-2 py-1 text-sm"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Right %</label>
                <input type="number" min="0" max="100" value={Math.round(settings.roiRight)} onChange={(e) => updateSetting('roiRight', Number(e.target.value))} className="w-full mt-1 border border-slate-700 bg-slate-800 text-slate-200 rounded px-2 py-1 text-sm"/>
              </div>
            </div>
            <p className="text-xs text-slate-500">Use "Auto" above or the "Crop Tool" on the image to set manually.</p>
          </div>

          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 pt-4">
            <ScanLine size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-300">Lane Detection</h2>
          </div>

           <div className="space-y-4">
             <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Auto-Detect Lanes</label>
              <input
                type="checkbox"
                checked={settings.autoDetectLanes}
                onChange={(e) => updateSetting('autoDetectLanes', e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
              />
            </div>
            
            {settings.autoDetectLanes && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase flex justify-between">
                  <span>Sensitivity</span>
                  <span className="text-slate-400 font-normal">{settings.laneDetectionSensitivity.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.laneDetectionSensitivity}
                  onChange={(e) => updateSetting('laneDetectionSensitivity', parseFloat(e.target.value))}
                  className="w-full mt-1 accent-blue-500 bg-slate-800"
                />
              </div>
            )}
             
            {!settings.autoDetectLanes && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Lane Count: {settings.numLanes}</label>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={settings.numLanes}
                  onChange={(e) => updateSetting('numLanes', parseInt(e.target.value))}
                  className="w-full mt-1 accent-blue-500 bg-slate-800"
                />
              </div>
            )}
             <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">Lane Margin (%)</label>
              <input
                type="range"
                min="0"
                max="50"
                value={settings.laneMargin}
                onChange={(e) => updateSetting('laneMargin', parseInt(e.target.value))}
                className="w-full mt-1 accent-blue-500 bg-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 pt-4">
            <Settings size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-300">Analysis Settings</h2>
          </div>
          
          <div className="space-y-4">
             <div>
               <label className="text-xs font-semibold text-slate-500 uppercase">Background Subtraction</label>
               <select 
                 value={settings.backgroundSubtractionMethod}
                 onChange={(e) => updateSetting('backgroundSubtractionMethod', e.target.value as any)}
                 className="w-full mt-1 border border-slate-700 rounded px-2 py-1 text-sm bg-slate-800 text-slate-200"
               >
                 <option value="rollingBall">Rolling Ball</option>
                 <option value="median">Median Filter</option>
                 <option value="none">None</option>
               </select>
             </div>
             {settings.backgroundSubtractionMethod !== 'none' && (
               <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Radius (px)</label>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="10"
                    value={settings.backgroundRollingBallRadius}
                    onChange={(e) => updateSetting('backgroundRollingBallRadius', parseInt(e.target.value))}
                    className="w-full mt-1 accent-blue-500 bg-slate-800"
                  />
               </div>
             )}
          </div>

        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 bg-slate-950 overflow-y-auto">
        {!effectiveImageSrc ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900 p-12">
            <Upload size={48} className="mb-4 text-slate-600" />
            <p className="text-lg font-medium text-slate-300">No Image Loaded</p>
            <p className="text-sm">Upload a gel electrophoresis image to begin analysis.</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm flex flex-col">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-200">Gel Image</h3>
                    
                    {/* TOOLBAR */}
                    <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <button
                          onClick={() => setInteractionMode('select')}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                             interactionMode === 'select' ? 'bg-slate-700 text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                           <MousePointer2 size={14} /> Select
                        </button>
                        <button
                          onClick={() => setInteractionMode('crop')}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                             interactionMode === 'crop' ? 'bg-slate-700 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                           <Crop size={14} /> Crop Tool
                        </button>
                    </div>
                 </div>
                 
                 <GelImageCanvas 
                   imageSrc={effectiveImageSrc}
                   settings={settings}
                   results={results}
                   selectedLaneIndex={selectedLane}
                   interactionMode={interactionMode}
                   onLaneSelect={(idx) => {
                     setSelectedLane(idx);
                     setSelectedBandId(null);
                   }}
                   onCropChange={(roi) => {
                       setSettings(prev => ({
                           ...prev,
                           roiTop: roi.top,
                           roiBottom: roi.bottom,
                           roiLeft: roi.left,
                           roiRight: roi.right
                       }));
                       // Switch back to select mode after cropping
                       setInteractionMode('select');
                   }}
                   onBandClick={toggleExcludeBand}
                 />
                 
                 <div className="mt-2 text-xs text-center text-slate-500 flex items-center justify-center gap-4">
                    {interactionMode === 'select' ? (
                        <span><strong className="text-slate-400">Click Lane</strong> to view profile. <strong className="text-slate-400">Click Band</strong> to toggle exclusion.</span>
                    ) : (
                        <span className="text-emerald-500 font-medium animate-pulse">Drag on image to crop area...</span>
                    )}
                 </div>
              </div>

              <div className="flex flex-col gap-6">
                 {/* Densitogram with Controls */}
                 <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
                   <div className="flex justify-between items-center mb-4">
                     <h3 className="text-sm font-semibold text-slate-200">
                        Lane {selectedLane} Profile
                     </h3>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setAddBandMode(!addBandMode)}
                          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${addBandMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          <PlusCircle size={14} /> Add Band
                        </button>
                     </div>
                   </div>

                   <Densitogram 
                      laneData={selectedLane && results.length > 0 ? results.find(l => l.index === selectedLane) || null : null} 
                      showBackground={settings.showBackgroundProfile}
                      onChartClick={handleChartClick}
                      isAddMode={addBandMode}
                      selectedBandId={selectedBandId}
                   />
                   
                   {/* Band Editor Controls */}
                   {selectedLane && selectedBandId && (
                     <div className="mt-4 p-3 bg-slate-800 border border-slate-700 rounded text-sm">
                        <div className="flex justify-between items-center mb-2">
                           <span className="font-semibold text-slate-200">Edit Selected Band ({selectedBandId})</span>
                           <button 
                             onClick={() => toggleExcludeBand(selectedBandId)} 
                             className="text-red-400 text-xs flex items-center gap-1 hover:text-red-300"
                           >
                             <Trash2 size={12}/> {selectedBandId.includes('-M') ? 'Delete Band' : 'Remove Band'}
                           </button>
                        </div>
                        {(() => {
                          const activeLane = results.find(l => l.index === selectedLane);
                          const activeBand = activeLane?.bands.find(b => b.id === selectedBandId);
                          if (!activeBand) return null;
                          const max = activeLane?.netProfile.length || 100;

                          return (
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <label className="text-xs text-slate-500">Start (px)</label>
                                 <input 
                                   type="range" min="0" max={activeBand.yPeak} 
                                   value={activeBand.yStart} 
                                   onChange={(e) => updateBandBoundaries(parseInt(e.target.value), activeBand.yEnd)}
                                   className="w-full accent-blue-500 bg-slate-700"
                                 />
                               </div>
                               <div>
                                 <label className="text-xs text-slate-500">End (px)</label>
                                 <input 
                                   type="range" min={activeBand.yPeak} max={max} 
                                   value={activeBand.yEnd} 
                                   onChange={(e) => updateBandBoundaries(activeBand.yStart, parseInt(e.target.value))}
                                   className="w-full accent-blue-500 bg-slate-700"
                                 />
                               </div>
                             </div>
                          );
                        })()}
                     </div>
                   )}
                 </div>

                {/* Integrity Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-sm">
                   <div className="flex items-start gap-3">
                     <AlertCircle className="text-indigo-400 mt-1" size={20} />
                     <div>
                       <div className="flex justify-between items-start w-full">
                         <h4 className="text-sm font-bold text-indigo-300">Genomic Integrity Analysis</h4>
                         {selectedLane && (
                           <button 
                             onClick={() => resetLaneOverrides(selectedLane)}
                             className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-400"
                             title="Reset manual changes for this lane"
                           >
                             <RotateCcw size={12}/> Reset Lane
                           </button>
                         )}
                       </div>
                       <p className="text-xs text-slate-400 mt-1 mb-2">
                         Click chart to add bands or select existing ones to adjust boundaries.
                       </p>
                       <div className="grid grid-cols-2 gap-4 mt-3">
                         <div className="bg-indigo-900/20 p-2 rounded border border-indigo-900/30">
                           <span className="block text-xs text-indigo-400 font-semibold uppercase">Integrity Score</span>
                           <span className="text-lg font-mono font-bold text-indigo-300">
                             {selectedLane && results.find(l => l.index === selectedLane)?.integrityScore.toFixed(1)}%
                           </span>
                         </div>
                         <div className="bg-amber-900/20 p-2 rounded border border-amber-900/30">
                            <span className="block text-xs text-amber-500 font-semibold uppercase">Smear Volume</span>
                            <span className="text-lg font-mono font-bold text-amber-500">
                             {selectedLane && Math.round(results.find(l => l.index === selectedLane)?.degradationVolume || 0).toLocaleString()}
                           </span>
                         </div>
                       </div>
                     </div>
                   </div>
                </div>
              </div>
            </div>

            <ResultsTable 
              results={results} 
              onExcludeBand={toggleExcludeBand}
              onSetMainBand={setMainBand}
            />

            <ComparativeAnalysis results={results} />
            
          </div>
        )}
      </main>
    </div>
  );
}