import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { LaneData } from '../types';
import { BarChart3, TrendingUp } from 'lucide-react';

interface ComparativeAnalysisProps {
  results: LaneData[];
}

const ComparativeAnalysis: React.FC<ComparativeAnalysisProps> = ({ results }) => {
  if (results.length < 2) return null;

  // Prepare data for charts
  const chartData = results.map(lane => {
    // Note: lane.mainBandVolume now represents the "Banded Fraction" (Main + Above)
    // Note: lane.degradationVolume now represents the "Smear Fraction" (Below)
    
    const totalSignal = lane.mainBandVolume + lane.degradationVolume;
    const smearPercent = totalSignal > 0 ? (lane.degradationVolume / totalSignal) * 100 : 0;

    return {
      lane: `Lane ${lane.index}`,
      index: lane.index,
      bandedVol: Math.round(lane.mainBandVolume),
      smearVol: Math.round(lane.degradationVolume),
      smearPercent: parseFloat(smearPercent.toFixed(1)),
      integrity: lane.integrityScore
    };
  });

  // Find max volume for scaling
  const maxBanded = Math.max(...chartData.map(d => d.bandedVol));

  return (
    <div className="space-y-6 mt-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 border-b border-neutral-300 pb-2">
        <BarChart3 className="text-neutral-500" size={20} />
        <h2 className="text-xs font-bold text-neutral-800 uppercase tracking-wide">Comparative Analysis</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Composition Chart */}
        <div className="bg-white p-4 border border-neutral-300">
          <h3 className="text-xs font-bold text-neutral-700 mb-4 flex justify-between uppercase tracking-wide">
            <span>Sample Composition</span>
            <span className="text-xs font-normal text-neutral-400 normal-case">Banded vs. Smear</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="lane" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Volume (Int)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ borderRadius: '0px', fontSize: '12px', border: '1px solid #000' }}
                />
                <Legend iconType="square" fontSize={10} />
                <Bar dataKey="bandedVol" name="Banded Fraction" stackId="a" fill="#000000" />
                <Bar dataKey="smearVol" name="Smear Fraction" stackId="a" fill="#d4d4d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Normalized Smear Chart */}
        <div className="bg-white p-4 border border-neutral-300">
           <h3 className="text-xs font-bold text-neutral-700 mb-4 flex justify-between uppercase tracking-wide">
            <span>Smear Density</span>
            <span className="text-xs font-normal text-neutral-400 normal-case">Smear % of Total Signal</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="lane" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Smear Density (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                   cursor={{ fill: '#f5f5f5' }}
                   contentStyle={{ borderRadius: '0px', fontSize: '12px', border: '1px solid #000' }}
                   formatter={(value: number) => [`${value}%`, 'Smear Density']}
                />
                <Legend iconType="square" />
                <Bar dataKey="smearPercent" name="Smear %" fill="#a3a3a3">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Relative Quantification Table */}
      <div className="bg-white border border-neutral-300 overflow-hidden">
        <div className="p-4 bg-neutral-100 border-b border-neutral-300 flex items-center gap-2">
           <TrendingUp size={16} className="text-neutral-600"/>
           <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">Relative Quantification (Normalized)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left font-mono">
            <thead className="bg-neutral-200 text-black uppercase text-xs font-bold">
              <tr>
                <th className="px-2 py-1 border-b border-neutral-300">Lane</th>
                <th className="px-2 py-1 border-b border-neutral-300 text-right">Banded Vol</th>
                <th className="px-2 py-1 border-b border-neutral-300 text-right">Relative Qty (%)</th>
                <th className="px-2 py-1 border-b border-neutral-300 text-right">Smear Vol</th>
                <th className="px-2 py-1 border-b border-neutral-300 text-right">Smear Ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {chartData.map((d) => {
                 const relQty = maxBanded > 0 ? (d.bandedVol / maxBanded) * 100 : 0;
                 const smearRatio = d.bandedVol > 0 ? (d.smearVol / d.bandedVol) : (d.smearVol > 0 ? Infinity : 0);
                 
                 return (
                  <tr key={d.index} className="hover:bg-neutral-100">
                    <td className="px-2 py-1 font-medium text-black">{d.lane}</td>
                    <td className="px-2 py-1 text-right">{d.bandedVol.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-neutral-200 overflow-hidden">
                             <div className="h-full bg-black" style={{ width: `${relQty}%` }}></div>
                          </div>
                          <span className="w-10">{relQty.toFixed(0)}%</span>
                       </div>
                    </td>
                    <td className="px-2 py-1 text-right text-neutral-600">{d.smearVol.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-neutral-500">
                      {smearRatio === Infinity ? '>100x' : smearRatio.toFixed(2)}x
                    </td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ComparativeAnalysis;