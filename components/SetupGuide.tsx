import React from 'react';

interface SetupGuideProps {
  missingKeys: string[];
  onBypass: () => void;
}

export const SetupGuide: React.FC<SetupGuideProps> = ({ missingKeys, onBypass }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-700/50">
        <div className="bg-indigo-600 px-8 py-6 text-white">
            <h1 className="text-2xl font-black flex items-center gap-3">
              <i className="fas fa-cubes text-indigo-300"></i>
              Setup Required
            </h1>
            <p className="text-indigo-100 font-medium mt-1">Connect Cloudflare & Firebase to enable sync.</p>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
             <h3 className="text-amber-900 font-bold text-sm uppercase">Missing Environment Variables</h3>
             <div className="mt-2 flex flex-wrap gap-2">
                  {missingKeys.map(key => (
                    <span key={key} className="px-2 py-1 bg-white text-amber-800 text-xs font-mono font-bold rounded border border-amber-200">
                       {key}
                    </span>
                  ))}
             </div>
          </div>

          <div className="space-y-4 text-sm text-slate-600">
             <p>To run this application, you need to configure your Firebase credentials in your environment.</p>
             <ul className="list-disc pl-5 space-y-1">
                 <li>If running locally: Create a <code className="bg-slate-100 px-1 rounded font-mono">.env</code> file.</li>
                 <li>If on Cloudflare Pages: Go to <strong>Settings &gt; Environment Variables</strong>.</li>
             </ul>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
             <div className="text-xs text-slate-400">
                Need help? Check the <a href="#" className="underline">documentation</a>.
             </div>
             <button onClick={onBypass} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold underline underline-offset-4">
                Skip Setup (Offline Mode)
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};