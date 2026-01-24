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
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <BarChart3 className="text-slate-500" size={20} />
        <h2 className="text-lg font-semibold text-slate-700">Comparative Analysis</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Composition Chart */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex justify-between">
            <span>Sample Composition Analysis</span>
            <span className="text-xs font-normal text-slate-400">Banded vs. Smear (Degradation)</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lane" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Volume (Int)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend iconType="circle" fontSize={10} />
                <Bar dataKey="bandedVol" name="Banded Fraction" stackId="a" fill="#2563eb" />
                <Bar dataKey="smearVol" name="Smear Fraction" stackId="a" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Normalized Smear Chart */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
           <h3 className="text-sm font-semibold text-slate-700 mb-4 flex justify-between">
            <span>Smear Density</span>
            <span className="text-xs font-normal text-slate-400">Smear % of Total Signal</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lane" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: 'Smear Density (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip 
                   cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                   contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                   formatter={(value: number) => [`${value}%`, 'Smear Density']}
                />
                <Legend iconType="circle" />
                <Bar dataKey="smearPercent" name="Smear %" fill="#d97706">
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
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
           <TrendingUp size={16} className="text-green-600"/>
           <h3 className="text-sm font-semibold text-slate-700">Relative Quantification (Normalized to Max Banded)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3">Lane</th>
                <th className="px-6 py-3 text-right">Banded Vol</th>
                <th className="px-6 py-3 text-right">Relative Qty (%)</th>
                <th className="px-6 py-3 text-right">Smear Vol</th>
                <th className="px-6 py-3 text-right">Smear Ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chartData.map((d) => {
                 const relQty = maxBanded > 0 ? (d.bandedVol / maxBanded) * 100 : 0;
                 const smearRatio = d.bandedVol > 0 ? (d.smearVol / d.bandedVol) : (d.smearVol > 0 ? Infinity : 0);
                 
                 return (
                  <tr key={d.index} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{d.lane}</td>
                    <td className="px-6 py-3 text-right font-mono">{d.bandedVol.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-600 rounded-full" style={{ width: `${relQty}%` }}></div>
                          </div>
                          <span className="font-mono w-10">{relQty.toFixed(0)}%</span>
                       </div>
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-amber-700">{d.smearVol.toLocaleString()}</td>
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