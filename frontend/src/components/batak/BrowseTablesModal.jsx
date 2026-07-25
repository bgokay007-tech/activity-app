import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '../Avatar';
import { getSocket, onSocket } from '../../services/socket';

// Bir varyantın herkese-açık, henüz dolmamış masalarını 3'erli satırlar
// halinde listeler; canlı günceller (`batak:tableList`), boş koltuğa
// "Katıl", seyirciye açıksa "İzle" ile girilebilir.
export default function BrowseTablesModal({ variant, onClose, onJoined, onSpectate }) {
    const { t } = useTranslation();
    const [tables, setTables] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const socket = getSocket();
        socket?.emit('batak:listTables', { variant });
        const offList = onSocket('batak:tableList', (data) => { if (data.variant === variant) setTables(data.tables || []); });
        const offErr = onSocket('batak:error', (data) => setError(data?.message || 'Bir hata oluştu.'));
        return () => {
            offList(); offErr();
            getSocket()?.emit('batak:unsubscribeLobby', { variant });
        };
    }, [variant]);

    const join = (tableId) => {
        setError('');
        const socket = getSocket();
        if (!socket) return setError('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:joinTable', { tableId });
        onJoined?.(tableId);
    };
    const spectate = (tableId) => {
        setError('');
        const socket = getSocket();
        if (!socket) return setError('Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:spectateTable', { tableId });
        onSpectate?.(tableId);
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-white font-bold text-base">{t(`batak.variant.${variant}`)} — {t('batak.browseTitle')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="px-5 py-4 overflow-y-auto">
                    {error && <p className="text-red-400 text-xs font-bold mb-3 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

                    {tables.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-10">{t('batak.browse.empty')}</p>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {tables.map(tbl => {
                                const filled = tbl.seats.filter(s => !s.open).length;
                                return (
                                    <div key={tbl.tableId} className="bg-gray-800 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-2">
                                        <p className="text-amber-400 font-black text-sm">🪙 {tbl.betAmount}</p>
                                        {tbl.ratingAmount > 0 && <p className="text-sky-400 text-[11px] font-bold">⭐ {tbl.ratingAmount.toFixed(2)}</p>}
                                        {(tbl.ratingRangeMin != null || tbl.ratingRangeMax != null) && (
                                            <p className="text-gray-500 text-[10px]">{tbl.ratingRangeMin ?? 0}–{tbl.ratingRangeMax ?? 5}</p>
                                        )}
                                        <div className="flex -space-x-1">
                                            {tbl.seats.filter(s => !s.open).map(s => <Avatar key={s.seat} user={s} size="xs" />)}
                                        </div>
                                        <p className="text-gray-400 text-[10px] font-bold">{t('batak.browse.seats', { filled })}</p>
                                        <button onClick={() => join(tbl.tableId)}
                                            className="w-full bg-purple-600 text-white font-bold py-1.5 rounded-lg text-xs">
                                            {t('batak.browse.join')}
                                        </button>
                                        {tbl.spectatorOpen && (
                                            <button onClick={() => spectate(tbl.tableId)}
                                                className="w-full bg-gray-700 text-gray-200 font-bold py-1.5 rounded-lg text-xs">
                                                {t('batak.browse.watch')}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
