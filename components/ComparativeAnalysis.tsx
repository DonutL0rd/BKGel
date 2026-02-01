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
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <BarChart3 className="text-slate-500" size={20} />
        <h2 className="text-lg font-semibold text-slate-200">Comparative Analysis</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Composition Chart */}
        <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex justify-between">
            <span>Sample Composition Analysis</span>
            <span className="text-xs font-normal text-slate-500">Banded vs. Smear (Degradation)</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="lane" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Volume (Int)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#f1f5f9' }}
                />
                <Legend iconType="circle" fontSize={10} wrapperStyle={{ color: '#94a3b8' }} />
                <Bar dataKey="bandedVol" name="Banded Fraction" stackId="a" fill="#3b82f6" />
                <Bar dataKey="smearVol" name="Smear Fraction" stackId="a" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Normalized Smear Chart */}
        <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 shadow-sm">
           <h3 className="text-sm font-semibold text-slate-200 mb-4 flex justify-between">
            <span>Smear Density</span>
            <span className="text-xs font-normal text-slate-500">Smear % of Total Signal</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="lane" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Smear Density (%)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }} />
                <Tooltip 
                   cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                   contentStyle={{ borderRadius: '8px', fontSize: '12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#f1f5f9' }}
                   formatter={(value: number) => [`${value}%`, 'Smear Density']}
                />
                <Legend iconType="circle" wrapperStyle={{ color: '#94a3b8' }} />
                <Bar dataKey="smearPercent" name="Smear %" fill="#f59e0b">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={entry.smearPercent > 20 ? 1 : 0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Relative Quantification Table */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
           <TrendingUp size={16} className="text-green-500"/>
           <h3 className="text-sm font-semibold text-slate-200">Relative Quantification (Normalized to Max Banded)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Lane</th>
                <th className="px-6 py-3 text-right">Banded Vol</th>
                <th className="px-6 py-3 text-right">Relative Qty (%)</th>
                <th className="px-6 py-3 text-right">Smear Vol</th>
                <th className="px-6 py-3 text-right">Smear Ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {chartData.map((d) => {
                 const relQty = maxBanded > 0 ? (d.bandedVol / maxBanded) * 100 : 0;
                 const smearRatio = d.bandedVol > 0 ? (d.smearVol / d.bandedVol) : (d.smearVol > 0 ? Infinity : 0);
                 
                 return (
                  <tr key={d.index} className="hover:bg-slate-800/50">
                    <td className="px-6 py-3 font-medium text-slate-200">{d.lane}</td>
                    <td className="px-6 py-3 text-right font-mono text-slate-300">{d.bandedVol.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500 rounded-full" style={{ width: `${relQty}%` }}></div>
                          </div>
                          <span className="font-mono w-10 text-slate-400">{relQty.toFixed(0)}%</span>
                       </div>
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-amber-500">{d.smearVol.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-mono text-slate-500">
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