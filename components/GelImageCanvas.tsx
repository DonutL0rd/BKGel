import React, { useRef, useEffect, useState } from 'react';
import { LaneData, GelSettings, InteractionMode, Rect } from '../types';

interface GelImageCanvasProps {
  imageSrc: string;
  settings: GelSettings;
  results: LaneData[];
  selectedLaneIndex: number | null;
  onLaneSelect: (index: number) => void;
  interactionMode: InteractionMode;
  onCropChange: (roi: { top: number, bottom: number, left: number, right: number }) => void;
  onBandClick: (bandId: string) => void;
}

const GelImageCanvas: React.FC<GelImageCanvasProps> = ({
  imageSrc,
  settings,
  results,
  selectedLaneIndex,
  onLaneSelect,
  interactionMode,
  onCropChange,
  onBandClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Dragging state for Crop
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{x: number, y: number} | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // 1. Draw Base Image
      ctx.drawImage(img, 0, 0);

      // 2. Draw Dark Overlay for ROI (Cropping)
      const cropX = Math.floor((settings.roiLeft / 100) * img.width);
      const cropY = Math.floor((settings.roiTop / 100) * img.height);
      const cropW = Math.floor(((100 - settings.roiRight - settings.roiLeft) / 100) * img.width);
      const cropH = Math.floor(((100 - settings.roiBottom - settings.roiTop) / 100) * img.height);
      const cropRight = cropX + cropW;
      const cropBottom = cropY + cropH;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      
      // Regions outside ROI
      ctx.fillRect(0, 0, img.width, cropY); // Top
      ctx.fillRect(0, cropBottom, img.width, img.height - cropBottom); // Bottom
      ctx.fillRect(0, cropY, cropX, cropH); // Left
      ctx.fillRect(cropRight, cropY, img.width - cropRight, cropH); // Right
      
      // ROI Border
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(cropX, cropY, cropW, cropH);
      ctx.setLineDash([]);

      // 3. Draw Lanes & Results (Only if not actively cropping new area, or just show them anyway)
      results.forEach((lane) => {
        const isSelected = selectedLaneIndex === lane.index;

        // Lane Boundary
        ctx.strokeStyle = isSelected ? 'rgba(234, 179, 8, 0.8)' : 'rgba(148, 163, 184, 0.3)'; 
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.strokeRect(lane.rect.x, lane.rect.y, lane.rect.width, lane.rect.height);

        // Lane Number
        ctx.fillStyle = isSelected ? 'rgba(234, 179, 8, 1)' : 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${lane.index}`, lane.rect.x + lane.rect.width / 2 - 5, lane.rect.y - 10);
        
        // Smears
        lane.smears.forEach(smear => {
           const startY = lane.rect.y + smear.yStart;
           const endY = lane.rect.y + smear.yEnd;
           ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'; 
           ctx.fillRect(lane.rect.x + 2, startY, lane.rect.width - 4, endY - startY);
        });

        // Bands
        lane.bands.forEach((band) => {
          const absoluteY = lane.rect.y + band.yPeak; 
          const startY = lane.rect.y + band.yStart;
          const endY = lane.rect.y + band.yEnd;

          // Band Box
          if (band.isExcluded) {
             // Excluded look: Crossed out or Gray
             ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
             ctx.fillRect(lane.rect.x, startY, lane.rect.width, endY - startY);
             // X mark
             ctx.beginPath();
             ctx.moveTo(lane.rect.x, startY);
             ctx.lineTo(lane.rect.x + lane.rect.width, endY);
             ctx.moveTo(lane.rect.x + lane.rect.width, startY);
             ctx.lineTo(lane.rect.x, endY);
             ctx.strokeStyle = 'rgba(100, 116, 139, 0.8)';
             ctx.lineWidth = 1;
             ctx.stroke();
          } else {
             ctx.fillStyle = band.isMainBand ? 'rgba(37, 99, 235, 0.15)' : 'rgba(244, 63, 94, 0.2)';
             ctx.fillRect(lane.rect.x, startY, lane.rect.width, endY - startY);
             
             // Marker line
             ctx.beginPath();
             ctx.moveTo(lane.rect.x, absoluteY);
             ctx.lineTo(lane.rect.x + lane.rect.width, absoluteY);
             ctx.strokeStyle = band.isMainBand ? 'rgba(37, 99, 235, 0.9)' : 'rgba(244, 63, 94, 0.8)'; 
             ctx.lineWidth = band.isMainBand ? 3 : 2;
             ctx.stroke();
          }
        });
      });

      // 4. Draw Interactive Crop Box if Dragging
      if (isDragging && dragStart && dragCurrent) {
        const x = Math.min(dragStart.x, dragCurrent.x);
        const y = Math.min(dragStart.y, dragCurrent.y);
        const w = Math.abs(dragCurrent.x - dragStart.x);
        const h = Math.abs(dragCurrent.y - dragStart.y);

        ctx.strokeStyle = '#10b981'; // Emerald
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
        ctx.fillRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    };
  };

  useEffect(() => {
    draw();
  }, [imageSrc, settings, results, selectedLaneIndex, isDragging, dragStart, dragCurrent]);

  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    if (interactionMode === 'crop') {
       setIsDragging(true);
       setDragStart(coords);
       setDragCurrent(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    if (isDragging && interactionMode === 'crop') {
      setDragCurrent(coords);
    }
    
    // Hover effects could be added here
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    
    if (interactionMode === 'crop' && isDragging && dragStart) {
       // Finalize Crop
       const x = Math.min(dragStart.x, coords.x);
       const y = Math.min(dragStart.y, coords.y);
       const w = Math.abs(coords.x - dragStart.x);
       const h = Math.abs(coords.y - dragStart.y);

       if (w > 20 && h > 20) { // Min size threshold
         const canvas = canvasRef.current!;
         const roi = {
           left: (x / canvas.width) * 100,
           top: (y / canvas.height) * 100,
           right: 100 - ((x + w) / canvas.width) * 100,
           bottom: 100 - ((y + h) / canvas.height) * 100
         };
         onCropChange(roi);
       }
       setIsDragging(false);
       setDragStart(null);
       setDragCurrent(null);
    } else if (interactionMode === 'select') {
       // Handle Click for Selection
       // 1. Check for Band Click first
       let clickedBandId: string | null = null;
       
       for(const lane of results) {
         if (coords.x >= lane.rect.x && coords.x <= lane.rect.x + lane.rect.width) {
             // In this lane
             for(const band of lane.bands) {
                 const startY = lane.rect.y + band.yStart;
                 const endY = lane.rect.y + band.yEnd;
                 if (coords.y >= startY && coords.y <= endY) {
                     clickedBandId = band.id;
                     break;
                 }
             }
             if (clickedBandId) break;
         }
       }

       if (clickedBandId) {
           onBandClick(clickedBandId);
           return;
       }

       // 2. Fallback: Select Lane
       const clickedLane = results.find(
         (lane) => coords.x >= lane.rect.x && coords.x <= lane.rect.x + lane.rect.width &&
                   coords.y >= lane.rect.y && coords.y <= lane.rect.y + lane.rect.height
       );
       if (clickedLane) {
         onLaneSelect(clickedLane.index);
       } else {
         onLaneSelect(-1);
       }
    }
  };

  return (
    <div ref={containerRef} className="w-full relative overflow-hidden rounded-md border border-slate-300 bg-black shadow-inner">
      <canvas 
        ref={canvasRef} 
        className={`w-full h-auto block ${interactionMode === 'crop' ? 'cursor-crosshair' : 'cursor-pointer'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
           if(isDragging) setIsDragging(false);
        }}
      />
    </div>
  );
};

export default GelImageCanvas;