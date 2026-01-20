
import React, { useState, useEffect } from 'react';
import { UserMood } from '../types';
import { saveUserMood, subscribeToTodayMood } from '../services/firebaseService';

interface MoodTrackerProps {
  user: any;
}

const MOODS = [
  { label: 'Happy', icon: '😄', color: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Excited', icon: '🤩', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { label: 'Tired', icon: '😴', color: 'bg-slate-200 text-slate-700 border-slate-300' },
  { label: 'Frustrated', icon: '😤', color: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Sad', icon: '😢', color: 'bg-blue-100 text-blue-700 border-blue-200' }
];

const MOOD_RESPONSES: Record<string, string[]> = {
  'Happy': ["That's the spirit! Keep crushing it!", "Awesome energy!", "Love to see it!", "Great vibes lead to great construction!", "Fantastic!", "Smiling makes the concrete cure faster!", "High energy today!", "You're on fire!", "Positivity is contagious!", "Glad you're feeling good!"],
  'Excited': ["Let's gooo! Big progress incoming!", "Channel that energy!", "Hyped! Let's make today productive.", "Excitement builds empires!", "Love the enthusiasm!", "Can't stop, won't stop!", "That's what I like to hear!", "Energy levels critical! In a good way!", "Let's turn that excitement into results!", "Boom! Let's knock out some targets."],
  'Tired': ["Hang in there.", "Construction is a marathon, not a sprint.", "Coffee first, then concrete.", "It's been a long haul. You're doing great.", "Take a deep breath.", "Fatigue is temporary, glory is forever.", "Power through, but rest later.", "Rough day? Tomorrow is a new pour.", "Stay safe. Watch your step.", "Almost there."],
  'Frustrated': ["Deep breath.", "Construction without chaos isn't construction.", "Shake it off.", "Don't let the site get to you.", "Frustration happens. Solving it makes you an engineer.", "Walk it off, re-group.", "Is it the machine or the operator? Fix it and move on.", "Some days are stones, some days are diamonds.", "Keep your cool.", "Let's turn that frustration into fuel."],
  'Sad': ["Sending good vibes.", "It's okay to have off days.", "Head up.", "Tough times don't last, tough engineers do.", "Hope your day gets brighter.", "We appreciate you.", "Take it easy on yourself today.", "The sun will rise again tomorrow.", "Just focus on one task at a time.", "Here's to a better tomorrow."]
};

export const MoodTracker: React.FC<MoodTrackerProps> = ({ user }) => {
  const [currentMood, setCurrentMood] = useState<UserMood | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    
    // Subscribe only to TODAY'S mood document
    const unsubscribe = subscribeToTodayMood(user.uid, (mood) => {
        if (mood) {
            setCurrentMood(mood);
            // Only set message from DB if we don't have a local one (prevents flickering)
            if (mood.note && !localMessage) {
                setLocalMessage(mood.note);
            }
        }
    });

    return () => unsubscribe();
  }, [user]);

  const handleMoodSelect = async (moodConfig: typeof MOODS[0]) => {
      if (!user?.uid || loading) return;
      
      setLoading(true);

      // 1. Optimistic UI Update (Instant Feedback)
      const responses = MOOD_RESPONSES[moodConfig.label] || MOOD_RESPONSES['Happy'];
      const randomMsg = responses[Math.floor(Math.random() * responses.length)];
      setLocalMessage(randomMsg);
      
      const optimisticMood: UserMood = {
          id: 'temp',
          uid: user.uid,
          mood: moodConfig.label as any,
          note: randomMsg,
          timestamp: new Date().toISOString()
      };
      setCurrentMood(optimisticMood);

      // 2. Background Save
      try {
          await saveUserMood(user.uid, moodConfig.label as any, randomMsg);
      } catch (error) {
          console.error("Failed to save mood", error);
          // Revert if failed (optional, but keeping simple for now)
      } finally {
          setLoading(false);
      }
  };

  if (!currentMood) {
      return (
        <div className="animate-fade-in mt-3">
            <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wide">How are you feeling today?</p>
            <div className="flex gap-2 flex-wrap">
                {MOODS.map(m => (
                    <button 
                    key={m.label} 
                    onClick={() => handleMoodSelect(m)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm flex items-center gap-1.5 bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 uppercase tracking-wide`}
                    >
                        <span className="text-base">{m.icon}</span> {m.label}
                    </button>
                ))}
            </div>
        </div>
      );
  }

  return (
    <div className="animate-fade-in flex flex-col items-start gap-3 mt-3">
        <div className="flex items-center gap-3">
            {/* Selected Mood Badge */}
            <div className="bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100 flex items-center gap-2 shadow-sm transition-all">
                <span className="text-xl">{MOODS.find(m => m.label === currentMood.mood)?.icon}</span>
                <span className="text-sm font-bold text-indigo-900 uppercase tracking-wide">{currentMood.mood}</span>
            </div>
            
            {/* Small switcher buttons */}
            <div className="flex gap-1">
                {MOODS.filter(m => m.label !== currentMood.mood).map(m => (
                        <button 
                        key={m.label} 
                        onClick={() => handleMoodSelect(m)}
                        className="w-8 h-8 rounded-full border border-slate-100 flex items-center justify-center bg-white text-base hover:bg-slate-50 transition-colors opacity-60 hover:opacity-100"
                        title={`Change to ${m.label}`}
                        >
                        {m.icon}
                        </button>
                ))}
            </div>
        </div>

        {/* Message Bubble */}
        {localMessage && (
            <div className="relative bg-white border border-indigo-200 p-3 rounded-2xl rounded-tl-none shadow-md max-w-full md:max-w-md animate-fade-in z-10">
                <p className="text-sm text-indigo-800 font-medium italic">"{localMessage}"</p>
                <div className="absolute top-0 -left-2 w-3 h-3 bg-white border-l border-t border-indigo-200 transform -rotate-45"></div>
            </div>
        )}
    </div>
  );
};
