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
    <div className="bg-white border border-neutral-300 mt-6 overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-neutral-300 bg-neutral-100">
        <h3 className="font-bold text-neutral-900 text-sm uppercase tracking-wider">Quantification Results</h3>
        <button 
          onClick={exportCSV}
          className="flex items-center gap-2 text-sm text-neutral-800 hover:text-black font-medium"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left font-mono">
          <thead className="bg-neutral-200 text-black uppercase text-xs font-bold">
            <tr>
              <th className="px-2 py-1 border-b border-neutral-300">Lane</th>
              <th className="px-2 py-1 border-b border-neutral-300">ID</th>
              <th className="px-2 py-1 border-b border-neutral-300">Type</th>
              <th className="px-2 py-1 border-b border-neutral-300 text-right">Band Vol</th>
              <th className="px-2 py-1 border-b border-neutral-300 text-right">Smear Vol</th>
              <th className="px-2 py-1 border-b border-neutral-300 text-right">Integrity</th>
              <th className="px-2 py-1 border-b border-neutral-300 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
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
                    <tr key={item.id} className={`hover:bg-neutral-100 ${item.isMainBand ? 'bg-blue-50/20' : ''} ${item.isExcluded ? 'opacity-50 grayscale bg-neutral-50' : ''}`}>
                      {idx === 0 && (
                        <td className="px-2 py-1 font-medium text-black border-r border-neutral-200" rowSpan={allItems.length}>
                          Lane {lane.index}
                        </td>
                      )}
                      <td className="px-2 py-1 text-neutral-600 text-xs">{item.id}</td>
                      <td className="px-2 py-1">
                        {item.type === 'smear' ? (
                           <span className="text-amber-700 font-mono uppercase text-xs">
                             Smear
                           </span>
                        ) : item.isExcluded ? (
                            <span className="text-neutral-400 italic text-xs">Excluded</span>
                        ) : item.isMainBand ? (
                          <span className="text-blue-700 font-bold font-mono uppercase text-xs">
                            [Main]
                          </span>
                        ) : item.isManual ? (
                           <span className="text-purple-700 font-mono uppercase text-xs">
                            [Manual]
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-xs">Band</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {item.type === 'band' ? Math.round(item.volume).toLocaleString() : '-'}
                      </td>
                      {idx === 0 && (
                        <td className="px-2 py-1 text-right text-neutral-800 border-l border-neutral-200" rowSpan={allItems.length}>
                            {Math.round(lane.degradationVolume).toLocaleString()}
                        </td>
                      )}
                      {idx === 0 && (
                         <td className="px-2 py-1 text-right border-l border-neutral-200" rowSpan={allItems.length}>
                           <div className="flex flex-col items-end">
                              <span className={`text-sm font-bold ${
                                lane.integrityScore > 80 ? 'text-green-700' :
                                lane.integrityScore > 50 ? 'text-amber-700' : 'text-red-700'
                              }`}>
                                {lane.integrityScore.toFixed(1)}%
                              </span>
                           </div>
                         </td>
                      )}
                      
                      <td className="px-2 py-1 text-center">
                        <div className="flex justify-center gap-2">
                           {item.type === 'band' && !item.isExcluded && (
                             <button 
                               onClick={() => onSetMainBand(lane.index, item.id)}
                               disabled={item.isMainBand}
                               className={`p-1 hover:bg-neutral-200 ${item.isMainBand ? 'text-blue-600' : 'text-neutral-400'}`}
                               title="Set as Main Band"
                             >
                               <Star size={14} fill={item.isMainBand ? "currentColor" : "none"} />
                             </button>
                           )}
                           {item.type === 'band' && (
                            <button 
                                onClick={() => onExcludeBand(item.id)}
                                className={`p-1 hover:bg-neutral-200 ${item.isExcluded || item.isManual ? 'text-red-600' : 'text-neutral-500'}`}
                                title={item.isManual ? "Delete Band" : (item.isExcluded ? "Undo Remove" : "Remove Band")}
                            >
                                {item.isManual ? <Trash2 size={14} /> : (item.isExcluded ? <Eye size={14} /> : <EyeOff size={14} />)}
                            </button>
                           )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="hover:bg-neutral-50">
                    <td className="px-2 py-1 font-medium text-black border-r border-neutral-200">Lane {lane.index}</td>
                    <td className="px-2 py-1 text-neutral-400 text-xs">-</td>
                    <td className="px-2 py-1">
                      {lane.smears.length > 0 ? (
                        <span className="text-amber-700 font-mono uppercase text-xs">Smear</span>
                      ) : (
                        <span className="text-neutral-400">Empty</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">0</td>
                    <td className="px-2 py-1 text-right text-neutral-800">
                        {Math.round(lane.degradationVolume).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right border-l border-neutral-200">
                      <span className="text-red-600 font-bold">{lane.integrityScore.toFixed(1)}%</span>
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