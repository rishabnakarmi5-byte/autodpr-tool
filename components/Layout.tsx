
import React from 'react';
import { TabView, UserProfile } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  user: any;
  profile: UserProfile | null;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, profile, onLogout }) => {
  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-800 font-sans relative">
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-slate-300 min-h-screen shadow-2xl sticky top-0 h-screen z-10">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <i className="fas fa-hard-hat text-white text-lg"></i>
             </div>
             DPR Maker Pro
          </h1>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          <NavButton active={activeTab === TabView.INPUT} onClick={() => onTabChange(TabView.INPUT)} icon="fa-pen-to-square" label="Daily Updates" />
          <NavButton active={activeTab === TabView.VIEW_REPORT} onClick={() => onTabChange(TabView.VIEW_REPORT)} icon="fa-file-invoice" label="View Report" />
          <NavButton active={activeTab === TabView.QUANTITY} onClick={() => onTabChange(TabView.QUANTITY)} icon="fa-calculator" label="Quantities" />
          <NavButton active={activeTab === TabView.HISTORY} onClick={() => onTabChange(TabView.HISTORY)} icon="fa-clock-rotate-left" label="History" />
          <NavButton active={activeTab === TabView.LOGS} onClick={() => onTabChange(TabView.LOGS)} icon="fa-list-check" label="Activity Logs" />
          <NavButton active={activeTab === TabView.SETTINGS} onClick={() => onTabChange(TabView.SETTINGS)} icon="fa-cog" label="Project Settings" />
          <NavButton active={activeTab === TabView.RECYCLE_BIN} onClick={() => onTabChange(TabView.RECYCLE_BIN)} icon="fa-trash" label="Recycle Bin" />
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-3 cursor-pointer p-2 rounded-lg hover:bg-white/5" onClick={() => onTabChange(TabView.PROFILE)}>
             <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border-2 border-indigo-500">
               {user?.photoURL ? <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-white font-bold">{user?.displayName?.charAt(0)}</span>}
             </div>
             <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{user?.displayName}</p>
                <div className="flex items-center justify-between mt-1">
                   <span className="text-[10px] text-indigo-400 font-bold uppercase">LVL {profile?.level || 1}</span>
                   <span className="text-[10px] text-slate-500">{profile?.exp || 0} EXP</span>
                </div>
                <div className="w-full bg-slate-700 h-1 rounded-full mt-1 overflow-hidden">
                   <div className="bg-indigo-500 h-full" style={{ width: `${(profile?.exp || 0) % 100}%` }}></div>
                </div>
             </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold transition-all">
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto h-screen relative pb-24 md:pb-0">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 no-print">
           <div>
              <h2 className="text-lg font-bold text-slate-700">{getGreeting()}, {user?.displayName?.split(' ')[0]}!</h2>
              <p className="text-xs text-slate-400">Keep up the great work on site today.</p>
           </div>
           <button onClick={() => onTabChange(TabView.PROFILE)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full transition-all">
              <i className="fas fa-user-circle"></i> My Profile
           </button>
        </header>
        <div className="p-4 md:p-10 max-w-7xl mx-auto">{children}</div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center py-3 z-50">
        <MobileNavButton active={activeTab === TabView.INPUT} onClick={() => onTabChange(TabView.INPUT)} icon="fa-pen-to-square" label="Input" />
        <MobileNavButton active={activeTab === TabView.VIEW_REPORT} onClick={() => onTabChange(TabView.VIEW_REPORT)} icon="fa-file-invoice" label="Report" />
        <MobileNavButton active={activeTab === TabView.QUANTITY} onClick={() => onTabChange(TabView.QUANTITY)} icon="fa-calculator" label="Qty" />
        <MobileNavButton active={activeTab === TabView.SETTINGS} onClick={() => onTabChange(TabView.SETTINGS)} icon="fa-cog" label="Settings" />
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
    <i className={`fas ${icon} w-5`}></i>
    <span className="font-semibold">{label}</span>
  </button>
);

const MobileNavButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center w-full ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
    <i className={`fas ${icon} text-lg`}></i>
    <span className="text-[10px] font-medium mt-1">{label}</span>
  </button>
);
