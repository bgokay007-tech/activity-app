/** SubCategoryScreen EntityShareModal kaydı — RivalCard/TournamentCard doğrudan Share.share çağırırken modal açılsın. */
let opener = null;

export function registerEntityShareOpener(fn) {
    opener = fn;
    return () => {
        if (opener === fn) opener = null;
    };
}

/** @returns {boolean} modal açıldıysa true */
export function tryOpenEntityShare(kind, item, extra = null) {
    if (!opener || !item?.id) return false;
    opener({ kind, item, extra });
    return true;
}
