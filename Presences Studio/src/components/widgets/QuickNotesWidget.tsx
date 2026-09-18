import React, { useState } from 'react';
import { StickyNote, Plus, Trash2, CheckSquare, Sparkles, ChevronDown, ChevronUp, Edit3 } from 'lucide-react';

interface NoteItem {
  id: string;
  text: string;
  color: string;
  completed: boolean;
}

export const QuickNotesWidget: React.FC = () => {
  const [notes, setNotes] = useState<NoteItem[]>([
    { id: '1', text: '🎯 Goal: Solve 3 Gauss Law Derivations', color: '#fef08a', completed: false },
    { id: '2', text: '📝 Homework: Ex 2.4 (Q1 to Q8)', color: '#bbf7d0', completed: false },
  ]);
  const [newText, setNewText] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleAddNote = () => {
    if (!newText.trim()) return;
    const colors = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#fed7aa'];
    const randomColor = colors[notes.length % colors.length];
    setNotes(prev => [
      ...prev,
      { id: Date.now().toString(), text: newText.trim(), color: randomColor, completed: false }
    ]);
    setNewText('');
  };

  const handleToggleComplete = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, completed: !n.completed } : n));
  };

  const handleDeleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="w-64 rounded-2xl bg-slate-900/95 border border-amber-500/30 backdrop-blur-xl shadow-2xl overflow-hidden text-xs text-white z-30 select-none">
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-amber-950/60 to-slate-900 border-b border-white/10 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 font-bold text-amber-300">
          <StickyNote className="w-3.5 h-3.5 text-amber-400" />
          <span>Class Goals & Notes ({notes.length})</span>
        </div>
        <button className="p-0.5 text-slate-400 hover:text-white">
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-2.5 space-y-2">
          {/* Notes List */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
            {notes.map(note => (
              <div
                key={note.id}
                className="flex items-start justify-between gap-2 p-2 rounded-xl text-slate-900 shadow-sm transition"
                style={{ backgroundColor: note.color }}
              >
                <div 
                  onClick={() => handleToggleComplete(note.id)}
                  className={`flex-1 font-medium cursor-pointer text-[11px] leading-snug ${
                    note.completed ? 'line-through opacity-50' : ''
                  }`}
                >
                  {note.text}
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-slate-700 hover:text-red-700 p-0.5 rounded shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Note Input */}
          <div className="flex items-center gap-1 pt-1">
            <input
              type="text"
              placeholder="Add quick reminder..."
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
            />
            <button
              onClick={handleAddNote}
              className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow transition"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
