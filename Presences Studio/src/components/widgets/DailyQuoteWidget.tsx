import React, { useState } from 'react';
import { Sparkles, RefreshCw, Quote } from 'lucide-react';

const QUOTES = [
  { text: "Education is not the learning of facts, but the training of the mind to think.", author: "Albert Einstein" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
];

export const DailyQuoteWidget: React.FC = () => {
  const [index, setIndex] = useState(0);
  const q = QUOTES[index];

  const handleNext = () => {
    setIndex(prev => (prev + 1) % QUOTES.length);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-950/80 to-slate-900/90 border border-amber-500/30 backdrop-blur-xl shadow-lg text-white text-xs select-none max-w-sm truncate">
      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <div className="truncate flex-1">
        <span className="text-slate-300 italic truncate font-serif">"{q.text}"</span>
        <span className="text-[10px] text-amber-400 font-bold ml-1.5">— {q.author}</span>
      </div>
      <button 
        onClick={handleNext}
        className="p-1 hover:text-amber-300 text-slate-400 transition shrink-0"
        title="Next Inspirational Thought"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
};
