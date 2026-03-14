
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getRawInputsForDate } from '../services/firebaseService';

interface RawInputsModalProps {
    date: string;
    isOpen: boolean;
    onClose: () => void;
}

export const RawInputsModal: React.FC<RawInputsModalProps> = ({ date, isOpen, onClose }) => {
    const [inputs, setInputs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && date) {
            setLoading(true);
            setError(null);
            getRawInputsForDate(date)
                .then(data => {
                    setInputs(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to load inputs:", err);
                    // Fallback: If it fails (e.g. missing index), stop loading and show empty or error
                    setError("Could not load logs (Index missing or network error).");
                    setInputs([]);
                    setLoading(false);
                });
        }
    }, [isOpen, date]);

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-left font-sans">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden relative">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800">Raw Inputs for {date}</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition-colors">
                        <i className="fas fa-times text-slate-600"></i>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="text-center p-8 text-slate-400"><i className="fas fa-circle-notch fa-spin"></i> Loading logs...</div>
                    ) : error ? (
                        <div className="text-center p-8 text-red-400 italic">
                            <i className="fas fa-exclamation-circle mb-2 block text-2xl"></i>
                            {error}
                        </div>
                    ) : inputs.length === 0 ? (
                        <div className="text-center p-8 text-slate-400 italic">
                            <i className="fas fa-folder-open mb-2 block text-2xl opacity-30"></i>
                            No raw inputs found for this date.
                        </div>
                    ) : (
                        inputs.map((input) => (
                            <div key={input.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-slate-400">{new Date(input.timestamp).toLocaleTimeString()}</span>
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${input.status === 'failed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {input.status === 'failed' ? 'Parsing Error' : 'Auto Saved'}
                                    </span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg text-sm font-mono whitespace-pre-wrap text-slate-700 border border-slate-100">
                                    {input.rawText}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">User: {input.user}</span>
                                    {input.locations && input.locations.length > 0 && (
                                        <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                            <strong>Loc:</strong> {input.locations.join(', ')}
                                        </span>
                                    )}
                                    {input.components && input.components.length > 0 && (
                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100">
                                            <strong>Comp:</strong> {input.components.join(', ')}
                                        </span>
                                    )}
                                </div>
                                {input.errorMessage && (
                                     <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                         <strong>Error:</strong> {input.errorMessage}
                                     </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
                    <p className="text-xs text-slate-500">These are raw texts saved automatically before processing.</p>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
