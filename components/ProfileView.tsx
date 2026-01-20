
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { subscribeToUserProfile } from '../services/firebaseService';

interface ProfileViewProps {
  user: any;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user?.uid) {
      const unsubProfile = subscribeToUserProfile(user.uid, setProfile);
      return () => {
        unsubProfile();
      };
    }
  }, [user]);

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
    </div>
  );
};
