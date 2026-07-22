// Paylaşılan avatar bileşeni — ProfilePage.jsx'teki yerel Avatar ile aynı sözleşme
// (user.avatar → resim, yoksa kullanıcı adının ilk harfi + gradient daire).
// ProfilePage/MessagesScreen'deki kopyalara kasıtlı olarak dokunulmadı, bu sadece
// yeni kullanım yerleri (Okey/Batak masası) için ortak bir bileşen.
const SIZES = { xs: 'w-7 h-7 text-xs', sm: 'w-8 h-8 text-sm', md: 'w-12 h-12 text-lg', lg: 'w-20 h-20 text-3xl', xl: 'w-28 h-28 text-4xl' };

export default function Avatar({ user, size = 'lg', ring = false }) {
    const sizeCls = SIZES[size] || SIZES.lg;
    const ringCls = ring ? 'ring-2 ring-offset-2 ring-offset-transparent ring-amber-400' : '';
    if (user?.avatar) {
        return <img src={user.avatar} alt={user.username || ''} className={`${sizeCls} ${ringCls} rounded-full object-cover flex-shrink-0 transition`} />;
    }
    return (
        <div className={`${sizeCls} ${ringCls} rounded-full bg-gradient-to-b from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0 transition`}>
            {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
    );
}
