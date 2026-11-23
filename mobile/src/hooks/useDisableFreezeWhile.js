import { useEffect } from 'react';
import { enableFreeze } from 'react-native-screens';

// react-native-screens enableFreeze(true) uygulama arka plana düşünce aktif ekranı
// da donduruyor. Modal o ekranın altında yaşadığı için ✕ / geri / picker dokunuşları
// ölü kalıyordu (turnuva oluştur açıkken başka uygulamaya gir-çık). Modal/sheet
// görünürken freeze kapat, kapanınca tekrar aç.
let holdCount = 0;

function acquire() {
    holdCount += 1;
    if (holdCount === 1) enableFreeze(false);
}

function release() {
    holdCount = Math.max(0, holdCount - 1);
    if (holdCount === 0) enableFreeze(true);
}

export default function useDisableFreezeWhile(active) {
    useEffect(() => {
        if (!active) return undefined;
        acquire();
        return () => release();
    }, [active]);
}
