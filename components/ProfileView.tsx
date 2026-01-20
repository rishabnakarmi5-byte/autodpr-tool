
import React, { useState, useEffect } from 'react';
import { UserProfile, UserMood } from '../types';
import { subscribeToUserProfile, saveUserMood, subscribeToUserMoods } from '../services/firebaseService';

interface ProfileViewProps {
  user: any;
}

const MOODS = [
  { label: 'Happy', icon: '😄', color: 'bg-green-100 text-green-600', quote: "Success is not the key to happiness. Happiness is the key to success." },
  { label: 'Excited', icon: '🤩', color: 'bg-yellow-100 text-yellow-600', quote: "The future belongs to those who believe in the beauty of their dreams." },
  { label: 'Tired', icon: '😴', color: 'bg-slate-100 text-slate-600', quote: "Rest when you're weary. Refresh and renew yourself, your body, your mind, your spirit." },
  { label: 'Frustrated', icon: '😤', color: 'bg-red-100 text-red-600', quote: "Obstacles are those frightful things you see when you take your eyes off your goal." },
  { label: 'Sad', icon: '😢', color: 'bg-blue-100 text-blue-600', quote: "Every day may not be good, but there's something good in every day." }
];

export const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [moods, setMoods] = useState<UserMood[]>([]);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [motivationalMessage, setMotivationalMessage] = useState<string>('');

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

  const handleMoodSelect = async (moodLabel: string) => {
    setSelectedMood(moodLabel);
    const moodObj = MOODS.find(m => m.label === moodLabel);
    setMotivationalMessage(moodObj?.quote || "Keep going!");
    
    if (user?.uid) {
        // Just cast string to the specific union type for simplicity here
        await saveUserMood(user.uid, moodLabel as any);
    }
  };

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
        {/* Mood Tracker */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-xl font-bold text-slate-800 mb-4">How are you feeling today?</h3>
           
           <div className="flex flex-wrap gap-4 mb-6">
              {MOODS.map(m => (
                <button
                  key={m.label}
                  onClick={() => handleMoodSelect(m.label)}
                  className={`flex-1 min-w-[100px] p-4 rounded-xl border transition-all transform hover:-translate-y-1 hover:shadow-md flex flex-col items-center gap-2
                    ${selectedMood === m.label ? `${m.color} border-current ring-2 ring-offset-2` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}
                  `}
                >
                  <span className="text-3xl">{m.icon}</span>
                  <span className="font-bold text-sm">{m.label}</span>
                </button>
              ))}
           </div>

           {motivationalMessage && (
             <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl text-center animate-fade-in">
                <i className="fas fa-quote-left text-indigo-200 text-2xl mb-2 block"></i>
                <p className="text-indigo-800 font-medium text-lg italic">{motivationalMessage}</p>
             </div>
           )}
        </div>

        {/* Mood History */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
           <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Moods</h3>
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
