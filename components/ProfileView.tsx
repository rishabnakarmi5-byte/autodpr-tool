
import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, UserMood } from '../types';
import { subscribeToUserProfile, subscribeToUserMoods } from '../services/firebaseService';

interface ProfileViewProps {
  user: any;
}

const MOODS = [
  { label: 'Happy', icon: '😄', color: 'bg-green-100 text-green-600' },
  { label: 'Excited', icon: '🤩', color: 'bg-yellow-100 text-yellow-600' },
  { label: 'Tired', icon: '😴', color: 'bg-slate-100 text-slate-600' },
  { label: 'Frustrated', icon: '😤', color: 'bg-red-100 text-red-600' },
  { label: 'Sad', icon: '😢', color: 'bg-blue-100 text-blue-600' }
];

export const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [moods, setMoods] = useState<UserMood[]>([]);

  useEffect(() => {
    if (user?.uid) {
      const unsubProfile = subscribeToUserProfile(user.uid, setProfile);
      const unsubMoods = subscribeToUserMoods(user.uid, setMoods);
      return () => {
        unsubProfile();
        unsubMoods();
      };
    }
  }, [user]);

  // Calculate mood trend (last 7 entries)
  const moodTrend = useMemo(() => {
      if (moods.length === 0) return null;
      
      const counts: Record<string, number> = {};
      moods.forEach(m => {
          counts[m.mood] = (counts[m.mood] || 0) + 1;
      });
      
      const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
      const dominant = sorted[0][0];
      
      return {
          dominant,
          message: `You have been feeling ${dominant} recently.`
      };
  }, [moods]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
        <div className="h-32 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
        <div className="px-8 pb-8">
           <div className="relative -mt-16 mb-4 flex justify-between items-end">
             <div className="flex items-end gap-4">
               <div className="w-32 h-32 rounded-full border-4 border-white bg-slate-200 overflow-hidden shadow-lg">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-slate-400">
                        <i className="fas fa-user"></i>
                    </div>
                  )}
               </div>
               <div className="mb-2">
                 <h1 className="text-3xl font-bold text-slate-800">{user?.displayName}</h1>
                 <p className="text-slate-500">{user?.email}</p>
               </div>
             </div>
             <div className="hidden md:block text-right mb-2">
                 <div className="text-xs font-bold uppercase text-slate-400">Joined</div>
                 <div className="text-slate-700 font-medium">{profile?.joinedDate ? new Date(profile.joinedDate).toLocaleDateString() : 'N/A'}</div>
             </div>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                 <div className="text-2xl font-bold text-indigo-600">{profile?.level || 1}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold">Level</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                 <div className="text-2xl font-bold text-green-600">{profile?.totalEntries || 0}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold">Total Entries</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                 <div className="text-2xl font-bold text-purple-600">{profile?.xp || 0}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold">XP Earned</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                 <div className="text-2xl font-bold text-blue-600">{profile?.totalDays || 1}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold">Days Active</div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        
        {/* Mood Analysis */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-xl font-bold text-slate-800 mb-4">Well-being Analysis</h3>
           {moodTrend ? (
               <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl flex items-center gap-4">
                   <div className="text-4xl">
                       {MOODS.find(m => m.label === moodTrend.dominant)?.icon}
                   </div>
                   <div>
                       <h4 className="font-bold text-indigo-900 text-lg">Weekly Trend</h4>
                       <p className="text-indigo-700">{moodTrend.message}</p>
                       <p className="text-xs text-indigo-500 mt-1">Based on your last {Math.min(7, moods.length)} check-ins.</p>
                   </div>
               </div>
           ) : (
               <p className="text-slate-500 italic">Check in daily on the dashboard to see your trend analysis here.</p>
           )}
        </div>

        {/* Mood History */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-lg font-bold text-slate-800 mb-4">History</h3>
           <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              {moods.length === 0 ? (
                <div className="text-slate-400 text-center italic text-sm py-4">No mood history yet.</div>
              ) : (
                moods.map(m => {
                   const moodConfig = MOODS.find(x => x.label === m.mood);
                   return (
                     <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="text-2xl">{moodConfig?.icon}</div>
                        <div className="flex-1">
                           <div className="text-sm font-bold text-slate-700">{m.mood}</div>
                           <div className="text-xs text-slate-400">{new Date(m.timestamp).toLocaleDateString()} {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                           {m.note && <div className="text-[10px] text-indigo-500 mt-1 italic line-clamp-1">"{m.note}"</div>}
                        </div>
                     </div>
                   );
                })
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
