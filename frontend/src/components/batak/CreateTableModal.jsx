import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSocket } from '../../services/socket';

const VARIANTS = ['ihaleli', 'esli_ihaleli', 'herkes_kendine', 'gomme'];
const DIFFICULTIES = [['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']];

// Adım adım (geri dönülebilir) masa kurma sihirbazı: varyant -> online/bot ->
// (bot ise zorluk, online ise derece aralığı -> puan bahsi -> ekstra derece
// bahsi -> seyirciye açık) -> masayı kur. `batak:matched` geldiğinde üst
// bileşen zaten tableId'yi set edip lobiyi tamamen unmount ediyor, bu yüzden
// modal'ın kendisi ayrıca kapanmayı yönetmek zorunda değil.
export default function CreateTableModal({ interest, defaultVariant, onClose }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('variant');
    const [variant, setVariant] = useState(defaultVariant || null);
    const [difficulty, setDifficulty] = useState('medium');
    const [difficultyConfirmed, setDifficultyConfirmed] = useState(false);
    const [ratingRangeMin, setRatingRangeMin] = useState('');
    const [ratingRangeMax, setRatingRangeMax] = useState('');
    const [betAmount, setBetAmount] = useState('100');
    const [wagerRating, setWagerRating] = useState(false);
    const [ratingAmount, setRatingAmount] = useState('0.10');
    const [spectatorOpen, setSpectatorOpen] = useState(false);
    const [error, setError] = useState('');

    const isTeam = variant === 'esli_ihaleli';
    const parsedBet = Math.max(0, Math.floor(Number(betAmount) || 0));
    const parsedRating = wagerRating ? Math.max(0, Number(ratingAmount) || 0) : 0;
    const parsedRangeMin = ratingRangeMin.trim() === '' ? null : Number(ratingRangeMin);
    const parsedRangeMax = ratingRangeMax.trim() === '' ? null : Number(ratingRangeMax);
    const canAfford = interest && interest.walletPoints >= parsedBet && interest.skillRating >= parsedRating && parsedBet > 0;

    const goVariant = (v) => { setVariant(v); setStep('opponent'); };
    const goOpponent = (kind) => setStep(kind === 'bot' ? 'difficulty' : 'range');

    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return setError('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:playVsBots', { difficulty });
    };

    const createTable = () => {
        const socket = getSocket();
        if (!socket) return setError('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:createPrivateTable', {
            betAmount: parsedBet, ratingAmount: parsedRating,
            ratingRangeMin: parsedRangeMin, ratingRangeMax: parsedRangeMax,
            variant, listed: true, spectatorOpen,
        });
    };

    const BACK = { opponent: 'variant', difficulty: 'opponent', range: 'opponent', stake: 'range', rating: 'stake', spectator: 'rating' };
    const back = () => setStep(BACK[step] || 'variant');

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-bold text-base">{t('batak.createTable')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="px-5 py-4 overflow-y-auto">
                    {error && <p className="text-red-400 text-xs font-bold mb-3 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

                    {step === 'variant' && (
                        <div className="flex flex-col gap-2">
                            <p className="text-gray-400 text-xs font-bold mb-1">{t('batak.step.chooseVariant')}</p>
                            {VARIANTS.map(v => (
                                <button key={v} onClick={() => goVariant(v)}
                                    className="w-full text-left bg-gray-800 border border-gray-700 hover:border-purple-500 text-white font-bold px-4 py-3 rounded-xl transition">
                                    {t(`batak.variant.${v}`)}
                                </button>
                            ))}
                        </div>
                    )}

                    {step === 'opponent' && (
                        <div className="flex flex-col gap-2">
                            <p className="text-gray-400 text-xs font-bold mb-1">{t('batak.step.chooseOpponent')}</p>
                            <button onClick={() => goOpponent('online')}
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold px-4 py-3 rounded-xl">
                                🌐 {t('batak.step.onlinePlayers')}
                            </button>
                            <button onClick={() => goOpponent('bot')}
                                className="w-full bg-gray-800 border border-gray-700 text-white font-bold px-4 py-3 rounded-xl">
                                🤖 {t('batak.step.vsBot')}
                            </button>
                        </div>
                    )}

                    {step === 'difficulty' && (
                        <div className="flex flex-col gap-3">
                            <p className="text-gray-400 text-xs font-bold">{t('batak.step.difficulty')}</p>
                            {difficultyConfirmed ? (
                                <button onClick={() => setDifficultyConfirmed(false)}
                                    className="w-full flex items-center justify-between bg-purple-600/20 border border-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm">
                                    <span>{t('batak.step.difficultySelected', { level: DIFFICULTIES.find(([k]) => k === difficulty)?.[1] })} ✓</span>
                                    <span className="text-purple-300 text-xs">{t('batak.step.change')}</span>
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    {DIFFICULTIES.map(([k, label]) => (
                                        <button key={k} onClick={() => { setDifficulty(k); setDifficultyConfirmed(true); }}
                                            className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition ${difficulty === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button onClick={startVsBots}
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl">
                                🤖 {t('batak.step.startVsBots')}
                            </button>
                        </div>
                    )}

                    {step === 'range' && (
                        <div className="flex flex-col gap-2">
                            <label className="block text-gray-400 text-xs font-bold mb-1">{t('batak.step.ratingRange')}</label>
                            <p className="text-gray-500 text-[11px] mb-1">{t('batak.step.ratingRangeHint')}</p>
                            <div className="flex gap-2 mb-2">
                                <input type="number" min="0" max="5" step="0.01" value={ratingRangeMin} onChange={e => setRatingRangeMin(e.target.value)}
                                    placeholder="Min" className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
                                <input type="number" min="0" max="5" step="0.01" value={ratingRangeMax} onChange={e => setRatingRangeMax(e.target.value)}
                                    placeholder="Max" className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
                            </div>
                            <button onClick={() => setStep('stake')} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl text-sm">
                                → {t('batak.step.stake')}
                            </button>
                        </div>
                    )}

                    {step === 'stake' && (
                        <div className="flex flex-col gap-2">
                            <label className="block text-gray-400 text-xs font-bold mb-1">{t('batak.step.stake')}</label>
                            <p className="text-gray-500 text-[11px] mb-1">{t('batak.step.stakeHint')}</p>
                            <input type="number" min="1" value={betAmount} onChange={e => setBetAmount(e.target.value)}
                                placeholder="Örn. 250" className="w-full bg-gray-800 border border-gray-700 text-white text-sm font-bold rounded-lg px-3 py-2 mb-1" />
                            {interest && parsedBet > interest.walletPoints && (
                                <p className="text-red-400 text-[11px] mb-1">Bakiyende bu kadar puan yok ({interest.walletPoints} puanın var).</p>
                            )}
                            <button onClick={() => setStep('rating')} disabled={parsedBet <= 0}
                                className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40">
                                → {t('batak.step.extraRating')}
                            </button>
                        </div>
                    )}

                    {step === 'rating' && (
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-gray-400 text-xs font-bold mb-1">
                                <input type="checkbox" checked={wagerRating} onChange={e => setWagerRating(e.target.checked)} />
                                {t('batak.step.extraRating')}
                            </label>
                            {wagerRating && (
                                <>
                                    <input type="number" min="0" max="5" step="0.01" value={ratingAmount} onChange={e => setRatingAmount(e.target.value)}
                                        placeholder="Örn. 0.25" className="w-full bg-gray-800 border border-gray-700 text-white text-sm font-bold rounded-lg px-3 py-2 mb-1" />
                                    {interest && parsedRating > interest.skillRating && (
                                        <p className="text-red-400 text-[11px] mb-1">Bu kadar dereceye sahip değilsin ({interest.skillRating?.toFixed(2)}).</p>
                                    )}
                                </>
                            )}
                            <button onClick={() => setStep('spectator')} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-xl text-sm mt-1">
                                → {t('batak.step.spectatorOpen')}
                            </button>
                        </div>
                    )}

                    {step === 'spectator' && (
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-2 text-gray-400 text-xs font-bold">
                                <input type="checkbox" checked={spectatorOpen} onChange={e => setSpectatorOpen(e.target.checked)} />
                                {t('batak.step.spectatorOpen')}
                            </label>
                            <p className="text-gray-500 text-[11px]">{t('batak.step.spectatorOpenHint')}</p>
                            <p className="text-amber-300/90 text-[11px] bg-amber-500/10 rounded-lg px-3 py-2">
                                {isTeam ? t('batak.payout.team') : t('batak.payout.solo')}
                            </p>
                            <button onClick={createTable} disabled={!canAfford}
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-40">
                                {t('batak.step.create')} ({parsedBet} puan{parsedRating > 0 ? ` + ${parsedRating.toFixed(2)} derece` : ''})
                            </button>
                        </div>
                    )}

                    {step !== 'variant' && (
                        <button onClick={back} className="text-gray-400 text-xs font-bold mt-4">‹ {t('batak.step.back')}</button>
                    )}
                </div>
            </div>
        </div>
    );
}
