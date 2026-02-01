import React from 'react';
import { LaneData } from '../types';
import { Download, Trash2, Star, EyeOff, Eye } from 'lucide-react';

interface ResultsTableProps {
  results: LaneData[];
  onExcludeBand: (id: string) => void;
  onSetMainBand: (laneIdx: number, id: string) => void;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ results, onExcludeBand, onSetMainBand }) => {
  if (results.length === 0) return null;

  const exportCSV = () => {
    const headers = ['Lane', 'Band ID', 'Type', 'Migration (px)', 'Band Vol', 'Smear Vol (Lane)', 'Integrity Score (%)'];
    const rows = results.flatMap(lane => {
      // Create rows for bands
      const bandRows = lane.bands.map(band => [
        lane.index,
        band.id,
        band.isMainBand ? 'Main Band' : (band.isManual ? 'Manual' : 'Band'),
        band.yPeak,
        Math.round(band.volume),
        Math.round(lane.degradationVolume),
        lane.integrityScore.toFixed(2)
      ]);
      
      // Create rows for smears if any
      const smearRows = lane.smears.map(smear => [
        lane.index,
        smear.id,
        'Smear Region',
        Math.round((smear.yStart + smear.yEnd)/2),
        Math.round(smear.volume),
        Math.round(lane.degradationVolume),
        lane.integrityScore.toFixed(2)
      ]);

      if (bandRows.length === 0 && smearRows.length === 0) {
        return [[
           lane.index, '-', 'Empty', '-', '0', '0', lane.integrityScore.toFixed(2)
        ]];
      } else if (bandRows.length === 0 && smearRows.length > 0) {
         return smearRows;
      }

      return [...bandRows, ...smearRows];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "gel_integrity_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 shadow-sm mt-6 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-800">
        <h3 className="font-semibold text-slate-200">Quantification Results</h3>
        <button 
          onClick={exportCSV}
          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-3">Lane</th>
              <th className="px-6 py-3">ID</th>
              <th className="px-6 py-3">Type</th>
              <th className="px-6 py-3 text-right">Band Vol</th>
              <th className="px-6 py-3 text-right text-amber-500">Smear Vol</th>
              <th className="px-6 py-3 text-right">Integrity</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {results.map((lane) => {
              const allItems = [
                  ...lane.bands.map(b => ({...b, type: 'band'})), 
                  ...lane.smears.map(s => ({...s, type: 'smear', isMainBand: false, isExcluded: false, isManual: false, yPeak: (s.yStart+s.yEnd)/2 }))
              ];
              // Sort by position
              allItems.sort((a,b) => a.yPeak - b.yPeak);

              return (
              <React.Fragment key={lane.index}>
                {allItems.length > 0 ? (
                  allItems.map((item, idx) => (
                    <tr key={item.id} className={`hover:bg-slate-800/50 ${item.isMainBand ? 'bg-blue-900/20' : ''} ${item.isExcluded ? 'opacity-50 grayscale bg-slate-900' : ''}`}>
                      {idx === 0 && (
                        <td className="px-6 py-4 font-medium text-slate-200 border-r border-slate-800" rowSpan={allItems.length}>
                          Lane {lane.index}
                        </td>
                      )}
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{item.id}</td>
                      <td className="px-6 py-4">
                        {item.type === 'smear' ? (
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/30 text-amber-500">
                             Smear Region
                           </span>
                        ) : item.isExcluded ? (
                            <span className="text-slate-500 italic">Excluded</span>
                        ) : item.isMainBand ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-900/30 text-blue-400">
                            Main
                          </span>
                        ) : item.isManual ? (
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/30 text-indigo-400">
                            Manual
                          </span>
                        ) : (
                          <span className="text-slate-400">Band</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {item.type === 'band' ? Math.round(item.volume).toLocaleString() : '-'}
                      </td>
                      {idx === 0 && (
                        <td className="px-6 py-4 text-right font-mono text-amber-500 bg-amber-900/10 border-l border-slate-800" rowSpan={allItems.length}>
                            {Math.round(lane.degradationVolume).toLocaleString()}
                        </td>
                      )}
                      {idx === 0 && (
                         <td className="px-6 py-4 text-right border-l border-slate-800" rowSpan={allItems.length}>
                           <div className="flex flex-col items-end">
                              <span className={`text-sm font-bold ${
                                lane.integrityScore > 80 ? 'text-green-500' : 
                                lane.integrityScore > 50 ? 'text-amber-500' : 'text-red-500'
                              }`}>
                                {lane.integrityScore.toFixed(1)}%
                              </span>
                           </div>
                         </td>
                      )}
                      
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                           {item.type === 'band' && !item.isExcluded && (
                             <button 
                               onClick={() => onSetMainBand(lane.index, item.id)}
                               disabled={item.isMainBand}
                               className={`p-1 rounded hover:bg-slate-800 ${item.isMainBand ? 'text-blue-500' : 'text-slate-600'}`}
                               title="Set as Main Band"
                             >
                               <Star size={16} fill={item.isMainBand ? "currentColor" : "none"} />
                             </button>
                           )}
                           {item.type === 'band' && (
                            <button 
                                onClick={() => onExcludeBand(item.id)}
                                className={`p-1 rounded hover:bg-slate-800 ${item.isExcluded || item.isManual ? 'text-red-400' : 'text-slate-600'}`}
                                title={item.isManual ? "Delete Band" : (item.isExcluded ? "Undo Remove" : "Remove Band")}
                            >
                                {item.isManual ? <Trash2 size={16} /> : (item.isExcluded ? <Eye size={16} /> : <EyeOff size={16} />)}
                            </button>
                           )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-slate-200 border-r border-slate-800">Lane {lane.index}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">-</td>
                    <td className="px-6 py-4">
                      {lane.smears.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/30 text-amber-500">Smear</span>
                      ) : (
                        <span className="text-slate-500">Empty</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">0</td>
                    <td className="px-6 py-4 text-right font-mono text-amber-500 bg-amber-900/10">
                        {Math.round(lane.degradationVolume).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right border-l border-slate-800">
                      <span className="text-red-400 font-bold">{lane.integrityScore.toFixed(1)}%</span>
                    </td>
                    <td></td>
                  </tr>
                )}
              </React.Fragment>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;