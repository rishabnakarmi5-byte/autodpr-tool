import React from 'react';
import { TabView } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-800 font-sans">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-50">
        <h1 className="font-bold text-lg flex items-center">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center mr-2">
            <i className="fas fa-hard-hat text-white text-sm"></i>
          </div>
          AutoDPR
        </h1>
        <button 
          onClick={() => onTabChange(activeTab === TabView.INPUT ? TabView.VIEW_REPORT : TabView.INPUT)}
          className="text-indigo-200 hover:text-white"
        >
          <i className={`fas ${activeTab === TabView.INPUT ? 'fa-file-contract' : 'fa-pen'} text-xl`}></i>
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-slate-300 min-h-screen shadow-2xl sticky top-0 h-screen z-10">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <i className="fas fa-hard-hat text-white text-lg"></i>
             </div>
             AutoDPR
          </h1>
          <p className="text-xs text-slate-500 mt-3 font-medium uppercase tracking-wider">Construction Mgmt</p>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-3">
          <NavButton 
            active={activeTab === TabView.INPUT} 
            onClick={() => onTabChange(TabView.INPUT)}
            icon="fa-pen-to-square"
            label="Daily Updates"
            desc="Input site data"
          />
          
          <NavButton 
            active={activeTab === TabView.VIEW_REPORT} 
            onClick={() => onTabChange(TabView.VIEW_REPORT)}
            icon="fa-file-invoice"
            label="View Report"
            desc="Print preview"
          />

          <NavButton 
            active={activeTab === TabView.HISTORY} 
            onClick={() => onTabChange(TabView.HISTORY)}
            icon="fa-clock-rotate-left"
            label="History"
            desc="Past records"
          />
        </nav>

        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
               <i className="fas fa-user text-xs"></i>
             </div>
             <div>
                <p className="text-sm text-white font-medium">Site Engineer</p>
                <p className="text-xs text-slate-500">Bhotekoshi Project</p>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto h-screen relative scroll-smooth">
        <div className="p-4 md:p-10 max-w-7xl mx-auto pb-20">
          {children}
        </div>
      </main>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label, desc }: any) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-4 rounded-xl transition-all duration-200 group flex items-center gap-4 ${
      active 
        ? 'bg-indigo-600/10 text-white shadow-inner border border-indigo-500/20' 
        : 'hover:bg-slate-800 hover:text-white border border-transparent'
    }`}
  >
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
      active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
    }`}>
      <i className={`fas ${icon}`}></i>
    </div>
    <div>
      <p className={`font-semibold ${active ? 'text-indigo-400' : 'text-slate-200'}`}>{label}</p>
      <p className="text-xs text-slate-500 group-hover:text-slate-400">{desc}</p>
    </div>
  </button>
);
