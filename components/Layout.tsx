

import React, { useEffect, useState } from 'react';
import { TabView, UserProfile } from '../types';
import { subscribeToUserProfile } from '../services/firebaseService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  user: any;
  onLogout: () => void;
  onSaveCheckpoint: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, onLogout, onSaveCheckpoint }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if(user?.uid) {
        const unsubProfile = subscribeToUserProfile(user.uid, (p) => setProfile(p));
        return () => unsubProfile();
    }
  }, [user]);

  const getTimeGreeting = () => {
      const hour = new Date().getHours();
      if(hour < 12) return "Good Morning";
      if(hour < 18) return "Good Afternoon";
      return "Good Evening";
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100 text-slate-800 font-sans relative">
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-50">
        <h1 className="font-bold text-xl flex items-center tracking-widest uppercase">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center mr-2">
            <i className="fas fa-hard-hat text-white text-sm"></i>
          </div>
          DPR MAKER
        </h1>
        <div className="flex items-center gap-3">
            <button 
                onClick={onSaveCheckpoint}
                className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 active:scale-95 transition-transform"
                title="Save Checkpoint"
            >
                <i className="fas fa-save"></i>
            </button>
            <button onClick={() => onTabChange(TabView.PROFILE)} className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border border-indigo-500">
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <span className="text-white text-xs font-bold">{user?.displayName?.charAt(0) || <i className="fas fa-user"></i>}</span>
               )}
            </button>
        </div>
      </div>

      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-slate-300 min-h-screen shadow-2xl sticky top-0 h-screen z-10">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-3xl font-bold tracking-widest text-white flex items-center gap-3 uppercase">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <i className="fas fa-hard-hat text-white text-lg"></i>
             </div>
             DPR MAKER
          </h1>
          <p className="text-xs text-slate-500 mt-3 font-bold uppercase tracking-wider">Construction Management</p>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-3 overflow-y-auto">
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
            active={activeTab === TabView.LINING} 
            onClick={() => onTabChange(TabView.LINING)}
            icon="fa-road"
            label="HRT Lining"
            desc="Tunnel progress chart"
          />
          <NavButton 
            active={activeTab === TabView.QUANTITY} 
            onClick={() => onTabChange(TabView.QUANTITY)}
            icon="fa-calculator"
            label="Quantities"
            desc="Items & volumes"
          />
          <NavButton 
            active={activeTab === TabView.FINANCIAL} 
            onClick={() => onTabChange(TabView.FINANCIAL)}
            icon="fa-coins"
            label="Financial"
            desc="Estimates & Rates"
          />
          <NavButton 
            active={activeTab === TabView.HISTORY} 
            onClick={() => onTabChange(TabView.HISTORY)}
            icon="fa-clock-rotate-left"
            label="History"
            desc="Past records"
          />
          <div className="pt-4 pb-2">
             <div className="border-t border-slate-800"></div>
          </div>
          <NavButton 
            active={activeTab === TabView.SETTINGS} 
            onClick={() => onTabChange(TabView.SETTINGS)}
            icon="fa-cog"
            label="Project Settings"
            desc="Hierarchy & Items"
          />
          <NavButton 
            active={activeTab === TabView.LOGS} 
            onClick={() => onTabChange(TabView.LOGS)}
            icon="fa-list-check"
            label="Activity Logs"
            desc="Audit trail"
          />
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-3 cursor-pointer hover:bg-slate-800 p-2 rounded-lg transition-colors" onClick={() => onTabChange(TabView.PROFILE)}>
             <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border-2 border-indigo-500 relative">
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <span className="text-white font-bold">{user?.displayName?.charAt(0) || <i className="fas fa-user"></i>}</span>
               )}
               <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
             </div>
             <div className="overflow-hidden">
                <p className="text-sm text-white font-medium truncate w-40 tracking-wide uppercase">{user?.displayName || 'Guest User'}</p>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-indigo-900 text-indigo-300 px-1.5 rounded font-bold">Lvl {profile?.level || 1}</span>
                    <p className="text-xs text-slate-500 truncate">{profile?.xp || 0} XP</p>
                </div>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-3 rounded-lg text-sm font-bold transition-colors tracking-wide uppercase"
          >
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </button>
          <div className="mt-4 text-center">
             <span className="text-white text-[1px] opacity-[0.01] select-none pointer-events-none">built by Rishab Nakarmi</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto h-screen relative scroll-smooth pb-24 md:pb-0">
        <div className="hidden md:flex justify-between items-center px-10 py-6 bg-white border-b border-slate-200">
           <div className="flex-1 max-w-2xl">
              <h1 className="text-3xl font-bold text-slate-800 tracking-wide uppercase">{getTimeGreeting()}, {user?.displayName?.split(' ')[0]}!</h1>
           </div>
           <div className="flex gap-8 items-center">
              <button 
                 onClick={onSaveCheckpoint}
                 className="flex items-center gap-2 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 px-4 py-2 rounded-xl border border-slate-200 hover:border-emerald-200 transition-all shadow-sm active:scale-95 group"
                 title="Save System Snapshot"
              >
                 <i className="fas fa-save text-emerald-500 group-hover:scale-110 transition-transform"></i>
                 <span className="text-xs font-bold uppercase tracking-wider">Save Checkpoint</span>
              </button>

              <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Entries</div>
                  <div className="text-3xl font-bold text-indigo-600">{profile?.totalEntries || 0}</div>
              </div>
              <div className="w-px bg-slate-200 h-10"></div>
              <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Level</div>
                  <div className="text-3xl font-bold text-green-600">{profile?.level || 1}</div>
              </div>
           </div>
        </div>
        
        <div className="md:hidden px-4 pt-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                 <h2 className="text-2xl font-bold text-slate-800 mb-2 uppercase">{getTimeGreeting()}, {user?.displayName?.split(' ')[0]}!</h2>
            </div>
        </div>

        <div className="p-4 md:p-10 max-w-7xl mx-auto pb-24 md:pb-20">
          {children}
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-pb">
        <div className="flex overflow-x-auto no-scrollbar py-3 px-2 gap-4">
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
            active={activeTab === TabView.LINING} 
            onClick={() => onTabChange(TabView.LINING)}
            icon="fa-road"
            label="Lining"
            />
            <MobileNavButton 
            active={activeTab === TabView.QUANTITY} 
            onClick={() => onTabChange(TabView.QUANTITY)}
            icon="fa-calculator"
            label="Qty"
            />
             <MobileNavButton 
            active={activeTab === TabView.FINANCIAL} 
            onClick={() => onTabChange(TabView.FINANCIAL)}
            icon="fa-coins"
            label="Money"
            />
            <MobileNavButton 
            active={activeTab === TabView.HISTORY} 
            onClick={() => onTabChange(TabView.HISTORY)}
            icon="fa-clock-rotate-left"
            label="History"
            />
            <MobileNavButton 
            active={activeTab === TabView.LOGS} 
            onClick={() => onTabChange(TabView.LOGS)}
            icon="fa-list-check"
            label="Logs"
            />
            <MobileNavButton 
            active={activeTab === TabView.SETTINGS} 
            onClick={() => onTabChange(TabView.SETTINGS)}
            icon="fa-cog"
            label="Settings"
            />
            <MobileNavButton 
            active={activeTab === TabView.PROFILE} 
            onClick={() => onTabChange(TabView.PROFILE)}
            icon="fa-user"
            label="Profile"
            />
        </div>
      </div>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
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
      <p className={`font-bold text-lg tracking-wide uppercase ${active ? 'text-indigo-400' : 'text-slate-200'}`}>{label}</p>
      <p className="text-xs text-slate-500 group-hover:text-slate-400">{desc}</p>
    </div>
  </button>
);

const MobileNavButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center min-w-[60px] space-y-1 ${
      active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
    }`}
  >
    <div className={`text-lg transition-transform ${active ? '-translate-y-1' : ''}`}>
       <i className={`fas ${icon}`}></i>
    </div>
    <span className={`text-[10px] font-bold whitespace-nowrap tracking-wide uppercase ${active ? 'text-indigo-700' : ''}`}>{label}</span>
    {active && <div className="w-1 h-1 bg-indigo-600 rounded-full mt-1"></div>}
  </button>
);