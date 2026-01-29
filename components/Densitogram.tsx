import React, { useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend
} from 'recharts';
import { LaneData, Band } from '../types';
import { ImageDown } from 'lucide-react';

const ReferenceAreaAny = ReferenceArea as any;

interface DensitogramProps {
  laneData: LaneData | null;
  showBackground: boolean;
  onChartClick: (index: number) => void;
  isAddMode: boolean;
  selectedBandId: string | null;
}

const Densitogram: React.FC<DensitogramProps> = ({ 
  laneData, 
  showBackground, 
  onChartClick, 
  isAddMode,
  selectedBandId
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  const handleExport = () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        canvas.width = svg.clientWidth;
        canvas.height = svg.clientHeight;
        ctx?.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `densitogram_lane_${laneData?.index || 'plot'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  };

  if (!laneData) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 rounded-md">
        Select a lane to view profile
      </div>
    );
  }

  const chartData = laneData.rawProfile.map((val, idx) => ({
    pixel: idx,
    raw: Math.round(val),
    background: Math.round(laneData.backgroundProfile[idx]),
    net: Math.round(laneData.netProfile[idx]),
  }));

  const getBandColor = (band: Band) => {
    if (band.isExcluded) return "#94a3b8"; // Slate-400 (Gray)
    if (band.isMainBand) return "#2563eb"; // Blue-600
    if (band.isManual) return "#7c3aed";   // Violet-600
    return "#f43f5e";                      // Rose-500
  };

  return (
    <div className="relative">
      <button 
        onClick={handleExport}
        className="absolute top-0 right-0 z-10 p-1 text-slate-400 hover:text-blue-600 bg-white/80 rounded"
        title="Export Plot as PNG"
      >
        <ImageDown size={16} />
      </button>

      <div 
        ref={chartRef} 
        className={`h-64 w-full ${isAddMode ? 'cursor-crosshair ring-2 ring-indigo-200 rounded bg-indigo-50/10' : 'cursor-pointer'}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onClick={(e) => {
              if (e && e.activeLabel) onChartClick(Number(e.activeLabel));
            }}
          >
            <defs>
              <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="pixel" 
              type="number" 
              label={{ value: 'Migration Distance (px)', position: 'insideBottom', offset: -5, fontSize: 12 }} 
              tick={{fontSize: 10}}
            />
            <YAxis 
              label={{ value: 'Intensity (AU)', angle: -90, position: 'insideLeft', fontSize: 12 }} 
              tick={{fontSize: 10}}
            />
            {!isAddMode && (
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                labelStyle={{ color: '#64748b' }}
              />
            )}
            
            <Legend 
               verticalAlign="top" 
               height={36} 
               payload={[
                 { value: 'Net Signal', type: 'rect', color: '#3b82f6' },
                 { value: 'Main Band', type: 'line', color: '#2563eb' },
                 { value: 'Other Bands', type: 'line', color: '#f43f5e' },
                 { value: 'Smear/Residue', type: 'rect', color: '#f59e0b' }
               ]}
            />

            {showBackground && (
              <Area
                type="monotone"
                dataKey="background"
                stroke="#94a3b8"
                fill="transparent"
                strokeWidth={1}
                strokeDasharray="4 4"
                name="Background"
                isAnimationActive={false}
              />
            )}
            
            <Area
              type="monotone"
              dataKey="net"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorNet)"
              name="Net Intensity"
              isAnimationActive={false}
            />
            
            {/* Render Smears */}
            {laneData.smears.map((smear) => (
                <ReferenceAreaAny
                   key={smear.id}
                   x1={smear.yStart}
                   x2={smear.yEnd}
                   fill="#f59e0b" // Amber
                   fillOpacity={0.15}
                   stroke="none"
                />
            ))}

            {/* Render Bands */}
            {laneData.bands.map((band) => {
               const isSelected = band.id === selectedBandId;
               const color = getBandColor(band);
               
               const fillOpacity = isSelected ? 0.3 : (band.isExcluded ? 0.05 : 0.1);
               const strokeWidth = isSelected ? 2 : 1;

               return (
                 <React.Fragment key={band.id}>
                    {/* Peak Marker */}
                    <ReferenceLine
                      x={band.yPeak}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={isSelected ? "0" : "2 2"}
                    />
                    
                    {/* Integration Area */}
                    <ReferenceAreaAny 
                      x1={band.yStart} 
                      x2={band.yEnd} 
                      fill={color}
                      fillOpacity={fillOpacity}
                      stroke={isSelected ? color : 'none'}
                      strokeOpacity={0.5}
                    />
                 </React.Fragment>
               );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {isAddMode && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none animate-bounce">
          Click graph to place band peak
        </div>
      )}
    </div>
  );
};

export default Densitogram;