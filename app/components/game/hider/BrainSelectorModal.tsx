import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { QUESTION_DATA } from '../../../lib/game_data';

interface BrainSelectorModalProps {
    isOpen: boolean;
    gameId: string;
    onSuccess: () => void;
    onCancel: () => void;
}

export default function BrainSelectorModal({ isOpen, gameId, onSuccess, onCancel }: BrainSelectorModalProps) {
    const [selection, setSelection] = useState<string[]>([]);
    const [category, setCategory] = useState<string>('matching');
    const [submitting, setSubmitting] = useState(false);

    // Supabase client is imported directly now

    if (!isOpen) return null;

    // Helper to flatten questions with IDs
    const getFlattenedQuestions = () => {
        const all: any[] = [];
        Object.entries(QUESTION_DATA).forEach(([catKey, catData]) => {
            const catId = catData.id;
            catData.questions.all.forEach((q: any, idx: number) => {
                all.push({
                    ...q,
                    id: `${catId}_${idx}`,
                    category: catId,
                    question: q.label
                });
            });
        });
        return all;
    };
    const flatQuestions = getFlattenedQuestions();

    const toggleQuestion = (qId: string, qCat: string) => {
        if (selection.includes(qId)) {
            setSelection(prev => prev.filter(id => id !== qId));
            return;
        }

        const selectedCats = selection.map(id => flatQuestions.find(q => q.id === id)?.category);
        if (selectedCats.includes(qCat)) {
            alert(`You already selected a question from ${qCat.toUpperCase()}!`);
            return;
        }

        if (selection.length >= 3) {
            alert("Select exactly 3 questions.");
            return;
        }
        setSelection(prev => [...prev, qId]);
    };

    const handleConfirm = async () => {
        if (selection.length !== 3) {
            alert("Select 3 questions.");
            return;
        }

        setSubmitting(true);
        console.log("BrainSelector: Inserting bans for game", gameId, selection);

        const bans = selection.map((qId) => ({
            game_id: gameId,
            type: 'QUESTION_ID',
            value: qId,
            reason: 'BRAIN_CURSE'
        }));

        try {
            const { error } = await supabase.from('game_bans').insert(bans);
            if (error) throw error;

            console.log("BrainSelector: Bans inserted successfully.");
            onSuccess();
        } catch (err: any) {
            console.error("BrainSelector: Insert failed", err);
            alert(`Failed to apply bans: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in">
            <div className="max-w-2xl w-full bg-slate-900 rounded-3xl p-6 shadow-2xl border-2 border-purple-500">
                <h2 className="text-3xl font-black italic text-purple-400 mb-2 uppercase text-center">Curse Active!</h2>
                <p className="text-white text-center mb-6">You discarded your hand. Now choose the 3 questions to ban.</p>

                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 justify-center">
                    {['matching', 'visual', 'radar', 'measuring', 'thermometer', 'tentacles'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ${category === cat ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="h-64 overflow-y-auto bg-black/50 rounded-xl border border-slate-700 p-2 space-y-2 mb-6">
                    {flatQuestions.filter(q => q.category === category).map(q => {
                        const isSelected = selection.includes(q.id);
                        const isDisabled = !isSelected && selection.length >= 3;
                        return (
                            <button
                                key={q.id}
                                onClick={() => toggleQuestion(q.id, q.category)}
                                disabled={isDisabled}
                                className={`w-full text-left p-4 rounded-lg border text-sm transition-all ${isSelected
                                    ? 'bg-purple-900/60 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                    } ${isDisabled ? 'opacity-30' : ''}`}
                            >
                                <div className="font-bold">{q.question}</div>
                            </button>
                        );
                    })}
                </div>

                <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl">
                    <div className="text-slate-400 font-bold">Selected: <span className="text-white">{selection.length}/3</span></div>
                    <button
                        onClick={handleConfirm}
                        disabled={selection.length !== 3 || submitting}
                        className="bg-purple-500 hover:bg-purple-400 text-white font-black py-3 px-8 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-105 flex items-center gap-2"
                    >
                        {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        CONFIRM BANS
                    </button>
                </div>
            </div>
        </div>
    );
}
