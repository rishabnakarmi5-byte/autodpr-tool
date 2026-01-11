import React from 'react';
import { TabView } from '../types';
import { User } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  user: User | null;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, onLogout }) => {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-800 font-sans relative">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-50">
        <h1 className="font-bold text-lg flex items-center">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center mr-2">
            <i className="fas fa-hard-hat text-white text-sm"></i>
          </div>
          DPR Maker
        </h1>
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border border-indigo-500">
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <span className="text-white text-xs font-bold">{user?.displayName?.charAt(0) || <i className="fas fa-user"></i>}</span>
               )}
            </div>
             <button onClick={onLogout} className="text-slate-400 hover:text-white">
                <i className="fas fa-sign-out-alt"></i>
            </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-slate-300 min-h-screen shadow-2xl sticky top-0 h-screen z-10">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <i className="fas fa-hard-hat text-white text-lg"></i>
             </div>
             Construction<br/>DPR Maker
          </h1>
          <p className="text-xs text-slate-500 mt-3 font-medium uppercase tracking-wider">Project Management</p>
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

          <NavButton 
            active={activeTab === TabView.LOGS} 
            onClick={() => onTabChange(TabView.LOGS)}
            icon="fa-list-check"
            label="Activity Logs"
            desc="Audit trail"
          />

          <NavButton 
            active={activeTab === TabView.RECYCLE_BIN} 
            onClick={() => onTabChange(TabView.RECYCLE_BIN)}
            icon="fa-trash"
            label="Recycle Bin"
            desc="Deleted items"
          />
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border-2 border-indigo-500">
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <span className="text-white font-bold">{user?.displayName?.charAt(0) || <i className="fas fa-user"></i>}</span>
               )}
             </div>
             <div className="overflow-hidden">
                <p className="text-sm text-white font-medium truncate w-40">{user?.displayName || 'Guest User'}</p>
                <p className="text-xs text-slate-500 truncate w-40">{user?.email}</p>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </button>
          
          {/* Invisible Signature */}
          <div className="mt-4 text-center">
             <span className="text-white text-[1px] opacity-[0.01] select-none pointer-events-none">built by Rishab Nakarmi</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto h-screen relative scroll-smooth pb-24 md:pb-0">
        <div className="p-4 md:p-10 max-w-7xl mx-auto pb-20">
          {children}
        </div>
        {/* Mobile invisible signature */}
        <div className="md:hidden absolute bottom-24 left-1/2 transform -translate-x-1/2">
             <span className="text-white text-[1px] opacity-[0.01] select-none pointer-events-none">built by Rishab Nakarmi</span>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center py-3 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-pb">
        <MobileNavButton 
          active={activeTab === TabView.INPUT} 
          onClick={() => onTabChange(TabView.INPUT)}
          icon="fa-pen-to-square"
          label="Input"
        />
        <MobileNavButton 
          active={activeTab === TabView.VIEW_REPORT} 
          onClick={() => onTabChange(TabView.VIEW_REPORT)}
          icon="fa-file-invoice"
          label="Report"
        />
        <MobileNavButton 
          active={activeTab === TabView.HISTORY} 
          onClick={() => onTabChange(TabView.HISTORY)}
          icon="fa-clock-rotate-left"
          label="History"
        />
        <MobileNavButton 
          active={activeTab === TabView.RECYCLE_BIN} 
          onClick={() => onTabChange(TabView.RECYCLE_BIN)}
          icon="fa-trash"
          label="Bin"
        />
      </div>
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

const MobileNavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full space-y-1 ${
      active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
    }`}
  >
    <div className={`text-lg transition-transform ${active ? '-translate-y-1' : ''}`}>
       <i className={`fas ${icon}`}></i>
    </div>
    <span className={`text-[10px] font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
    {active && <div className="w-1 h-1 bg-indigo-600 rounded-full mt-1"></div>}
  </button>
);