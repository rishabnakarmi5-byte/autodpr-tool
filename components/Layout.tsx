
import React, { useEffect, useState } from 'react';
import { TabView, UserProfile, UserMood } from '../types';
import { subscribeToUserProfile, subscribeToUserMoods, saveUserMood } from '../services/firebaseService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  user: any;
  onLogout: () => void;
}

const MOODS = [
  { label: 'Happy', icon: '😄', color: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Excited', icon: '🤩', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { label: 'Tired', icon: '😴', color: 'bg-slate-200 text-slate-700 border-slate-300' },
  { label: 'Frustrated', icon: '😤', color: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Sad', icon: '😢', color: 'bg-blue-100 text-blue-700 border-blue-200' }
];

// Pre-defined messages to ensure instant response
const MOOD_RESPONSES: Record<string, string[]> = {
  'Happy': [
      "That's the spirit! Keep crushing it!",
      "Awesome energy! The site is lucky to have you.",
      "Love to see it! Keep the momentum going.",
      "Great vibes lead to great construction!",
      "Fantastic! Let's build something amazing today.",
      "Smiling makes the concrete cure faster (not really, but feels like it)!",
      "High energy today! Let's get things done.",
      "You're on fire! Keep up the great work.",
      "Positivity is contagious. Spread it around!",
      "Glad you're feeling good! Enjoy the shift."
  ],
  'Excited': [
      "Let's gooo! Big progress incoming!",
      "Channel that energy into the project!",
      "Hyped! Let's make today productive.",
      "Excitement builds empires (and dams)!",
      "Love the enthusiasm! Let's tackle the hard stuff.",
      "Can't stop, won't stop! Full speed ahead.",
      "That's what I like to hear! Let's roll.",
      "Energy levels critical! In a good way!",
      "Let's turn that excitement into results!",
      "Boom! Let's knock out some targets."
  ],
  'Tired': [
      "Hang in there. One step at a time.",
      "Construction is a marathon, not a sprint. Pace yourself.",
      "Coffee first, then concrete.",
      "It's been a long haul. You're doing great.",
      "Take a deep breath. You got this.",
      "Fatigue is temporary, glory is forever (or at least until the defect liability period).",
      "Power through, but don't forget to rest later.",
      "Rough day? Tomorrow is a new pour.",
      "Stay safe. Watch your step when you're tired.",
      "Almost there. Keep pushing."
  ],
  'Frustrated': [
      "Deep breath. Problems are just solutions waiting to happen.",
      "Construction without chaos isn't construction. You'll handle it.",
      "Shake it off. Focus on what you can control.",
      "Don't let the site get to you. You're the boss.",
      "Frustration happens. Solving it makes you an engineer.",
      "Walk it off, re-group, and attack the problem.",
      "Is it the machine or the operator? Doesn't matter, fix it and move on.",
      "Some days are stones, some days are diamonds.",
      "Keep your cool. Cooler heads prevail.",
      "Let's turn that frustration into fuel."
  ],
  'Sad': [
      "Sending good vibes your way.",
      "It's okay to have off days. Be kind to yourself.",
      "Head up. You're doing important work.",
      "Tough times don't last, tough engineers do.",
      "Hope your day gets brighter.",
      "We appreciate you. Hang in there.",
      "Take it easy on yourself today.",
      "The sun will rise again tomorrow.",
      "Just focus on one task at a time.",
      "Here's to a better tomorrow."
  ]
};

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, user, onLogout }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todaysMood, setTodaysMood] = useState<UserMood | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  useEffect(() => {
    if(user?.uid) {
        const unsubProfile = subscribeToUserProfile(user.uid, (p) => setProfile(p));
        // Check for mood log specifically for today
        const unsubMood = subscribeToUserMoods(user.uid, (moods) => {
            const today = new Date().toDateString();
            const found = moods.find(m => new Date(m.timestamp).toDateString() === today);
            setTodaysMood(found || null);
            if (found && found.note) {
                setAiMessage(found.note); // Restore note if exists locally
            }
        });
        return () => {
            unsubProfile();
            unsubMood();
        }
    }
  }, [user]);

  const handleMoodSelect = async (mood: any) => {
      // Pick a random message immediately
      const messages = MOOD_RESPONSES[mood.label] || MOOD_RESPONSES['Happy'];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      
      setAiMessage(randomMsg);
      
      if (user?.uid) {
          await saveUserMood(user.uid, mood.label, randomMsg);
      }
  };

  const getTimeGreeting = () => {
      const hour = new Date().getHours();
      if(hour < 12) return "Good Morning";
      if(hour < 18) return "Good Afternoon";
      return "Good Evening";
  };

  const MoodSection = () => (
      <div className="mb-6 md:mb-0">
          {!todaysMood ? (
            <div className="animate-fade-in">
                <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">How are you feeling today?</p>
                <div className="flex gap-2 flex-wrap">
                    {MOODS.map(m => (
                        <button 
                        key={m.label} 
                        onClick={() => handleMoodSelect(m)}
                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm flex items-center gap-1.5 bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600`}
                        >
                            <span className="text-base">{m.icon}</span> {m.label}
                        </button>
                    ))}
                </div>
            </div>
        ) : (
            <div className="animate-fade-in flex flex-col items-start gap-4">
                <div className="flex items-center gap-3">
                   {/* Mood Indicator */}
                    <div className="bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 flex items-center gap-2 shadow-sm">
                        <span className="text-xl">{MOODS.find(m => m.label === todaysMood.mood)?.icon}</span>
                        <span className="text-xs font-bold text-indigo-900">{todaysMood.mood}</span>
                    </div>
                    {/* Allow Update */}
                    <div className="flex gap-1">
                        {MOODS.filter(m => m.label !== todaysMood.mood).map(m => (
                             <button 
                                key={m.label} 
                                onClick={() => handleMoodSelect(m)}
                                className="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center bg-white text-base hover:bg-slate-50 transition-colors"
                                title={`Change to ${m.label}`}
                             >
                                {m.icon}
                             </button>
                        ))}
                    </div>
                </div>

                {/* AI Response Bubble */}
                {aiMessage && (
                    <div className="relative bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm max-w-full md:max-w-md animate-fade-in">
                        <p className="text-sm text-slate-700 italic">"{aiMessage}"</p>
                        {/* Arrow */}
                        <div className="absolute top-0 -left-2 w-3 h-3 bg-white border-l border-t border-slate-200 transform -rotate-45"></div>
                    </div>
                )}
            </div>
        )}
      </div>
  );

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
            <button onClick={() => onTabChange(TabView.PROFILE)} className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center border border-indigo-500">
               {user?.photoURL ? (
                 <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <span className="text-white text-xs font-bold">{user?.displayName?.charAt(0) || <i className="fas fa-user"></i>}</span>
               )}
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
            active={activeTab === TabView.QUANTITY} 
            onClick={() => onTabChange(TabView.QUANTITY)}
            icon="fa-calculator"
            label="Quantities"
            desc="Items & volumes"
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
                <p className="text-sm text-white font-medium truncate w-40">{user?.displayName || 'Guest User'}</p>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-indigo-900 text-indigo-300 px-1.5 rounded font-bold">Lvl {profile?.level || 1}</span>
                    <p className="text-xs text-slate-500 truncate">{profile?.xp || 0} XP</p>
                </div>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold transition-colors"
          >
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </button>
          
          <div className="mt-4 text-center">
             <span className="text-white text-[1px] opacity-[0.01] select-none pointer-events-none">built by Rishab Nakarmi</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto h-screen relative scroll-smooth pb-24 md:pb-0">
        
        {/* Desktop Greeting Header with Mood Check */}
        <div className="hidden md:flex justify-between items-center px-10 py-6 bg-white border-b border-slate-200">
           <div className="flex-1 max-w-2xl">
              <h1 className="text-2xl font-bold text-slate-800">{getTimeGreeting()}, {user?.displayName?.split(' ')[0]}!</h1>
              <div className="mt-3">
                <MoodSection />
              </div>
           </div>

           <div className="flex gap-4">
              <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase">Total Entries</div>
                  <div className="text-xl font-bold text-indigo-600">{profile?.totalEntries || 0}</div>
              </div>
              <div className="w-px bg-slate-200 h-10"></div>
              <div className="text-right">
                  <div className="text-xs font-bold text-slate-400 uppercase">Level</div>
                  <div className="text-xl font-bold text-green-600">{profile?.level || 1}</div>
              </div>
           </div>
        </div>
        
        {/* Mobile Mood Check (Inside Content) */}
        <div className="md:hidden px-4 pt-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                 <h2 className="text-lg font-bold text-slate-800 mb-2">{getTimeGreeting()}, {user?.displayName?.split(' ')[0]}!</h2>
                 <MoodSection />
            </div>
        </div>

        <div className="p-4 md:p-10 max-w-7xl mx-auto pb-24 md:pb-20">
          {children}
        </div>
        
        <div className="md:hidden absolute bottom-24 left-1/2 transform -translate-x-1/2">
             <span className="text-white text-[1px] opacity-[0.01] select-none pointer-events-none">built by Rishab Nakarmi</span>
        </div>
      </main>

      {/* Mobile Bottom Navigation (Scrollable) */}
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
            active={activeTab === TabView.QUANTITY} 
            onClick={() => onTabChange(TabView.QUANTITY)}
            icon="fa-calculator"
            label="Qty"
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
      <p className={`font-semibold ${active ? 'text-indigo-400' : 'text-slate-200'}`}>{label}</p>
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
    <span className={`text-[10px] font-medium whitespace-nowrap ${active ? 'font-bold' : ''}`}>{label}</span>
    {active && <div className="w-1 h-1 bg-indigo-600 rounded-full mt-1"></div>}
  </button>
);
