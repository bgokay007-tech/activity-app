import { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer, StackActions, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCredentials, setUser } from '../store/slices/authSlice';
import { setLang } from '../store/slices/langSlice';
import { setUnreadCount, incrementUnread, clearUnread } from '../store/slices/notificationSlice';
import useT from '../hooks/useT';
import { ActivityIndicator, View, Text, Platform } from 'react-native';
import RainbowLogo from '../components/RainbowLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import api from '../services/api';
import { connectSocket, disconnectSocket, onSocket } from '../services/socket';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

export const navigationRef = createNavigationContainerRef();

function navigateFromNotif(data) {
    if (!navigationRef.isReady() || !data) return;
    const type = data.type;
    if (type === 'MESSAGE') {
        if (data.senderId) {
            navigationRef.navigate('MessagesTab', {
                screen: 'Chat',
                params: { other: { id: data.senderId, username: data.senderUsername }, conversation: { id: data.conversationId || null } },
            });
        } else {
            navigationRef.navigate('MessagesTab');
        }
    } else if (type === 'FRIEND_REQUEST' || type === 'FRIEND_ACCEPTED') {
        if (data.senderId) {
            navigationRef.navigate('HomeTab', { screen: 'Profile', params: { userId: data.senderId } });
        } else {
            navigationRef.navigate('ProfileTab');
        }
    } else if (type === 'RESERVATION' || type === 'RESERVATION_UPDATE' || type === 'VENUE_ORDER' || type === 'PAYMENT_ALERT') {
        // venueId varsa (ör. VENUE_ORDER) sadece o tesisin takvimi açılır — yoksa (ör. bazı
        // RESERVATION bildirimleri) eski davranış korunur, tüm tesis kartları açılmayı dener.
        navigationRef.navigate('BusinessApp', { openReservations: true, venueId: data.venueId || null });
    } else if (type === 'VENUE_REQUEST') {
        navigationRef.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'venues' } });
    } else if (type === 'SUBSCRIPTION_REQUEST' || type === 'SUBSCRIPTION_RECEIPT') {
        navigationRef.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'subscriptions' } });
    } else if (data.category && data.subCategory) {
        let initialTab = 'rivals';
        if (type?.startsWith('TOURNAMENT') || type === 'CANCELLATION_REQUEST') initialTab = 'tournaments';
        else if (type === 'MATCH_CONFIRMED') initialTab = 'rivals';
        else if (type === 'SCORE_CONFIRMED' || type === 'MATCH_COMPLETED') initialTab = 'archive';
        navigationRef.navigate('HomeTab', {
            screen: 'SubCategory',
            params: {
                category: data.category, sub: data.subCategory, initialTab, highlightRivalId: data.rivalId || null,
                // Kadro kartındaki bir slota doğrudan davet edildiyse (bkz. inviteToRival),
                // ilan detayı açılınca kartın arka yüzü o slotu vurgulayarak açılsın diye.
                ...(data.inviteSide && { inviteSide: data.inviteSide, inviteSlotIndex: data.inviteSlotIndex ?? null }),
                // DOUBLE (2v2 tenis/padel) forma daveti — NotificationsScreen'deki (uygulama içi
                // bildirim listesi) aynı alanla AYNI mantık, burada gerçek OS bildirim tıklaması
                // (bildirim tepsisinden) için — bu ikisi AYRI kod yolları, biri unutulunca
                // "bildirime tıklayınca kart görünmüyor" hatası sadece OS bildiriminde ortaya
                // çıkıyordu (kullanıcı raporu).
                ...(data.inviteDoubleSlot && { inviteDoubleSlot: data.inviteDoubleSlot }),
            },
        });
    }
}

// Paylaşılan link (activityapp://rival/<id> veya activityapp://tournament/<id>) ile
// açılış: id üzerinden category/subCategory çözülüp mevcut bildirim navigasyonuyla
// aynı hedefe (SubCategory ekranı, ilgili ilan/turnuva vurgulanmış halde) gidilir.
async function resolveDeepLinkAndNavigate(url) {
    if (!url) return;
    try {
        const { path } = ExpoLinking.parse(url);
        const [kind, id] = (path || '').replace(/^\/+/, '').split('/');
        if (!id) return;
        if (kind === 'rival') {
            const { data } = await api.get(`/rivals/${id}`);
            if (!navigationRef.isReady()) return;
            navigationRef.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: data.category, sub: data.subCategory, initialTab: 'rivals', highlightRivalId: id },
            });
        } else if (kind === 'tournament') {
            const { data } = await api.get(`/tournaments/${id}`);
            if (!navigationRef.isReady()) return;
            navigationRef.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: data.category, sub: data.subCategory, initialTab: 'tournaments', openMatchTournamentId: id, openMatchId: null },
            });
        }
    } catch { /* ilan/turnuva bulunamadı veya oturum hazır değil — sessizce yut */ }
}

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import BusinessRegisterScreen from '../screens/auth/BusinessRegisterScreen';
import BusinessHomeScreen from '../screens/business/BusinessHomeScreen';
import AdminPortalScreen from '../screens/admin/AdminPortalScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import HomeScreen from '../screens/main/HomeScreen';
import CategoryScreen from '../screens/main/CategoryScreen';
import SubCategoryScreen from '../screens/main/SubCategoryScreen';
import RecordTrailScreen from '../screens/main/RecordTrailScreen';
import AddTrailAdminScreen from '../screens/main/AddTrailAdminScreen';
import MessagesScreen from '../screens/main/MessagesScreen';
import ChatScreen from '../screens/main/ChatScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import UserPostsScreen from '../screens/main/UserPostsScreen';
import CreatePostScreen from '../screens/main/CreatePostScreen';
import VenueSearchScreen from '../screens/main/VenueSearchScreen';
import VenueDetailScreen from '../screens/main/VenueDetailScreen';
import CourtSlotsScreen from '../screens/main/CourtSlotsScreen';
import MyReservationsScreen from '../screens/main/MyReservationsScreen';
import ActivityFeedScreen from '../screens/main/ActivityFeedScreen';
import MusicHomeScreen from '../screens/main/MusicHomeScreen';
import MusicPlaylistDetailScreen from '../screens/main/MusicPlaylistDetailScreen';
import NowPlayingScreen from '../screens/main/NowPlayingScreen';
import CinemaHomeScreen from '../screens/main/CinemaHomeScreen';
import ClassicFilmPlayerScreen from '../screens/main/ClassicFilmPlayerScreen';
import TheaterHomeScreen from '../screens/main/TheaterHomeScreen';
import BatakHomeScreen from '../screens/main/BatakHomeScreen';
import BatakTableScreen from '../screens/main/BatakTableScreen';
import OkeyHomeScreen from '../screens/main/OkeyHomeScreen';
import OkeyTableScreen from '../screens/main/OkeyTableScreen';
import TavlaHomeScreen from '../screens/main/TavlaHomeScreen';
import TavlaTableScreen from '../screens/main/TavlaTableScreen';
import ChessHomeScreen from '../screens/main/ChessHomeScreen';
import ChessTableScreen from '../screens/main/ChessTableScreen';
import FriendFindingHomeScreen from '../screens/main/FriendFindingHomeScreen';
import FriendFindingMatchesScreen from '../screens/main/FriendFindingMatchesScreen';
import FriendFindingLiveScreen from '../screens/main/FriendFindingLiveScreen';
import MiniPlayer from '../components/MiniPlayer';
import YoutubeAudioPlayer from '../components/YoutubeAudioPlayer';
import colors from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const NotificationsStack = createNativeStackNavigator();
const ActivityStack = createNativeStackNavigator();

function HomeStackNav() {
    return (
        <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <HomeStack.Screen name="Home" component={HomeScreen} />
            <HomeStack.Screen name="Category" component={CategoryScreen} />
            <HomeStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <HomeStack.Screen name="RecordTrail" component={RecordTrailScreen} />
            <HomeStack.Screen name="AddTrailAdmin" component={AddTrailAdminScreen} />
            <HomeStack.Screen name="Profile" component={ProfileScreen} />
            <HomeStack.Screen name="UserPosts" component={UserPostsScreen} />
            <HomeStack.Screen name="CreatePost" component={CreatePostScreen} />
            <HomeStack.Screen name="VenueSearch" component={VenueSearchScreen} />
            <HomeStack.Screen name="VenueDetail" component={VenueDetailScreen} />
            <HomeStack.Screen name="CourtSlots" component={CourtSlotsScreen} />
            <HomeStack.Screen name="MyReservations" component={MyReservationsScreen} />
            <HomeStack.Screen name="MusicHome" component={MusicHomeScreen} />
            <HomeStack.Screen name="MusicPlaylistDetail" component={MusicPlaylistDetailScreen} />
            <HomeStack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <HomeStack.Screen name="CinemaHome" component={CinemaHomeScreen} />
            <HomeStack.Screen name="ClassicFilmPlayer" component={ClassicFilmPlayerScreen} options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <HomeStack.Screen name="TheaterHome" component={TheaterHomeScreen} />
            <HomeStack.Screen name="BatakHome" component={BatakHomeScreen} />
            <HomeStack.Screen name="BatakTable" component={BatakTableScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <HomeStack.Screen name="OkeyHome" component={OkeyHomeScreen} />
            <HomeStack.Screen name="OkeyTable" component={OkeyTableScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <HomeStack.Screen name="TavlaHome" component={TavlaHomeScreen} />
            <HomeStack.Screen name="TavlaTable" component={TavlaTableScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <HomeStack.Screen name="ChessHome" component={ChessHomeScreen} />
            <HomeStack.Screen name="ChessTable" component={ChessTableScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <HomeStack.Screen name="FriendFindingHome" component={FriendFindingHomeScreen} />
            <HomeStack.Screen name="FriendFindingMatches" component={FriendFindingMatchesScreen} />
            <HomeStack.Screen name="FriendFindingLive" component={FriendFindingLiveScreen} />
        </HomeStack.Navigator>
    );
}

function MessagesStackNav() {
    return (
        <MessagesStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <MessagesStack.Screen name="MessagesList" component={MessagesScreen} />
            <MessagesStack.Screen name="Chat" component={ChatScreen} />
        </MessagesStack.Navigator>
    );
}

function ProfileStackNav() {
    return (
        <ProfileStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <ProfileStack.Screen name="MyProfile" component={ProfileScreen} />
            <ProfileStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <ProfileStack.Screen name="RecordTrail" component={RecordTrailScreen} />
            <ProfileStack.Screen name="AddTrailAdmin" component={AddTrailAdminScreen} />
            <ProfileStack.Screen name="Profile" component={ProfileScreen} />
            <ProfileStack.Screen name="UserPosts" component={UserPostsScreen} />
            <ProfileStack.Screen name="CreatePost" component={CreatePostScreen} />
            <ProfileStack.Screen name="BusinessHome" component={BusinessHomeScreen} />
            <ProfileStack.Screen name="AdminPortal" component={AdminPortalScreen} />
            <ProfileStack.Screen name="VenueSearch" component={VenueSearchScreen} />
            <ProfileStack.Screen name="VenueDetail" component={VenueDetailScreen} />
            <ProfileStack.Screen name="CourtSlots" component={CourtSlotsScreen} />
            <ProfileStack.Screen name="MyReservations" component={MyReservationsScreen} />
        </ProfileStack.Navigator>
    );
}

function ActivityStackNav() {
    return (
        <ActivityStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <ActivityStack.Screen name="ActivityFeed" component={ActivityFeedScreen} />
            <ActivityStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <ActivityStack.Screen name="RecordTrail" component={RecordTrailScreen} />
            <ActivityStack.Screen name="AddTrailAdmin" component={AddTrailAdminScreen} />
            <ActivityStack.Screen name="Profile" component={ProfileScreen} />
        </ActivityStack.Navigator>
    );
}

function NotificationsStackNav() {
    return (
        <NotificationsStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <NotificationsStack.Screen name="NotificationsList" component={NotificationsScreen} />
            <NotificationsStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <NotificationsStack.Screen name="RecordTrail" component={RecordTrailScreen} />
            <NotificationsStack.Screen name="AddTrailAdmin" component={AddTrailAdminScreen} />
            <NotificationsStack.Screen name="Profile" component={ProfileScreen} />
            <NotificationsStack.Screen name="Chat" component={ChatScreen} />
        </NotificationsStack.Navigator>
    );
}

function TabIcon({ label, active }) {
    const icons = {
        Home:         active ? '🏠' : '🏡',
        Messages:     active ? '💬' : '💬',
        Activity:     active ? '🌟' : '⭐',
        Notifications:active ? '🔔' : '🔕',
        Profile:      active ? '👤' : '👤',
    };
    return (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>{icons[label]}</Text>
        </View>
    );
}

function AppTabs() {
    const insets = useSafeAreaInsets();
    const tabBarHeight = 56 + insets.bottom;
    const t = useT();
    const dispatch = useDispatch();
    const userId = useSelector(s => s.auth.user?.id);
    const isBusiness = useSelector(s => s.auth.user?.isBusiness);
    const lang = useSelector(s => s.lang?.lang || 'en');
    const activityLogoText = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';
    // Rozet sayısı Redux'ta tutulur — NotificationsScreen okundu işaretlerken doğrudan
    // aynı state'i güncelliyor, 30sn'lik poll'u beklemeden rozet anında düşüyor.
    const unreadNotifs = useSelector(s => s.notifications.unreadCount);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const pollRef = useRef(null);
    const messagesPollRef = useRef(null);
    const shownNotifIdsRef = useRef(new Set());

    // Fetch unread count from backend — source of truth
    const syncBadge = useCallback(async () => {
        try {
            const { data } = await api.get('/notifications');
            const count = data.unreadCount || 0;
            // Her fetch edilen bildirim (okunmuş dahil) "zaten görüldü" sayılır — sadece
            // okunmamışlarla değiştirilirse, okunan bir bildirim bir sonraki sync'te bu
            // setten düşüyor ve soket olayı tekrar/gecikmeli gelirse yeniymiş gibi tekrar
            // yerel bildirim (toast) tetikleniyordu.
            (data.notifications || []).forEach(n => shownNotifIdsRef.current.add(n.id));
            dispatch(setUnreadCount(count));
        } catch { /* silent */ }
    }, [dispatch]);

    // Mesajlar sekmesi rozeti de aynı "sunucu = tek doğru kaynak" desenini izler —
    // daha önce bu state hiç güncellenmiyordu, rozet asla görünmüyordu.
    const syncMessagesBadge = useCallback(async () => {
        try {
            const { data } = await api.get('/messages/unread-count');
            setUnreadMessages(data.unreadCount || 0);
        } catch { /* silent */ }
    }, []);

    // Poll every 30s — keeps badge in sync with server after mark-all-read
    useEffect(() => {
        const t = setTimeout(syncBadge, 2000);
        pollRef.current = setInterval(syncBadge, 30000);
        return () => { clearTimeout(t); clearInterval(pollRef.current); };
    }, [syncBadge]);

    useEffect(() => {
        const t = setTimeout(syncMessagesBadge, 2000);
        messagesPollRef.current = setInterval(syncMessagesBadge, 30000);
        return () => { clearTimeout(t); clearInterval(messagesPollRef.current); };
    }, [syncMessagesBadge]);

    // Socket connection — instant badge increment on new notification/message
    useEffect(() => {
        if (!userId) return;
        connectSocket(userId);
        const off = onSocket('notification', (notif) => {
            // Bazı sunucu tarafı kodları createNotification'dan sonra ayrıca boş bir
            // {} 'notification' event'i daha yayınlıyor (id'siz) - bu, id'si olmayan
            // event'i sayıp rozeti çift artırmasın diye burada da id şart koşuluyor.
            if (!notif?.id) return;
            dispatch(incrementUnread());
            if (!shownNotifIdsRef.current.has(notif.id)) {
                shownNotifIdsRef.current.add(notif.id);
                Notifications.scheduleNotificationAsync({
                    content: { title: notif.title, body: notif.body, sound: 'default', data: { ...(notif.data || {}), type: notif.type } },
                    trigger: null,
                }).catch(() => {});
            }
        });
        const offMsg = onSocket('newMessage', ({ message }) => {
            if (message?.senderId && message.senderId !== userId) setUnreadMessages(c => c + 1);
        });
        return () => { off(); offMsg(); disconnectSocket(); };
    }, [userId, dispatch]);

    return (
        <View style={{ flex: 1 }}>
        <Tab.Navigator
            // İşletme hesabı "App" sekmelerine (bildirim/mesaj ikonlarından) dıştan girdiğinde,
            // sekmeler arası geri-tuşu geçmişi devreye girmesin — geri tuşu her zaman doğrudan
            // BusinessApp'e (nereden geldiyse oraya) dönsün.
            backBehavior={isBusiness ? 'none' : 'history'}
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                    paddingTop: 5,
                    height: tabBarHeight,
                },
                tabBarActiveTintColor: colors.purple,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
            }}
        >
            <Tab.Screen
                name="HomeTab"
                component={HomeStackNav}
                listeners={({ navigation }) => ({
                    tabPress: (e) => {
                        e.preventDefault();
                        navigation.navigate('HomeTab', { screen: 'Home' });
                    },
                })}
                options={{ tabBarLabel: t.home, tabBarIcon: ({ focused }) => <TabIcon label="Home" active={focused} /> }}
            />
            <Tab.Screen
                name="MessagesTab"
                component={MessagesStackNav}
                listeners={{ tabPress: () => setUnreadMessages(0) }}
                options={{
                    tabBarLabel: t.messages,
                    tabBarIcon: ({ focused }) => <TabIcon label="Messages" active={focused} />,
                    tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
                    tabBarBadgeStyle: { backgroundColor: colors.purple, color: '#fff', fontSize: 10 },
                }}
            />
            <Tab.Screen
                name="ActivityTab"
                component={ActivityStackNav}
                options={{
                    tabBarLabel: () => (
                        <RainbowLogo text={activityLogoText} style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }} />
                    ),
                    tabBarIcon: ({ focused }) => <TabIcon label="Activity" active={focused} />,
                }}
            />
            <Tab.Screen
                name="NotificationsTab"
                component={NotificationsStackNav}
                listeners={({ navigation }) => ({
                    tabPress: (e) => {
                        dispatch(clearUnread());
                        e.preventDefault();
                        navigation.navigate('NotificationsTab', { screen: 'NotificationsList' });
                    },
                })}
                options={{
                    tabBarLabel: t.alerts,
                    tabBarIcon: ({ focused }) => <TabIcon label="Notifications" active={focused} />,
                    tabBarBadge: unreadNotifs > 0 ? unreadNotifs : undefined,
                    tabBarBadgeStyle: { backgroundColor: colors.purple, color: '#fff', fontSize: 10 },
                }}
            />
            <Tab.Screen
                name="ProfileTab"
                component={ProfileStackNav}
                options={{ tabBarLabel: t.profile, tabBarIcon: ({ focused }) => <TabIcon label="Profile" active={focused} /> }}
            />
        </Tab.Navigator>
        <MiniPlayer />
        <YoutubeAudioPlayer />
        </View>
    );
}

export default function Navigation() {
    const dispatch = useDispatch();
    const token = useSelector(s => s.auth.token);
    const isBusiness = useSelector(s => s.auth.user?.isBusiness);
    const [bootstrapping, setBootstrapping] = useState(true);
    const pendingNavRef = useRef(null);
    const pendingDeepLinkRef = useRef(null);

    useEffect(() => {
        if (isExpoGo) return;
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response?.notification?.request?.content?.data) {
                pendingNavRef.current = response.notification.request.content.data;
            }
        }).catch(() => {});
        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            navigateFromNotif(response.notification.request.content.data || {});
        });
        return () => sub.remove();
    }, []);

    useEffect(() => {
        ExpoLinking.getInitialURL().then(url => {
            if (url) pendingDeepLinkRef.current = url;
        }).catch(() => {});
        const sub = ExpoLinking.addEventListener('url', ({ url }) => resolveDeepLinkAndNavigate(url));
        return () => sub.remove();
    }, []);

    useEffect(() => {
        Promise.all([
            AsyncStorage.getItem('activity_token'),
            AsyncStorage.getItem('activity_lang'),
        ]).then(async ([token, lang]) => {
            if (lang) dispatch(setLang(lang));
            if (token) {
                dispatch(setCredentials({ token, user: null }));
                try {
                    const { data } = await api.get('/auth/me');
                    dispatch(setUser(data));
                } catch { /* token may be expired — user will be prompted to login */ }
            }
        }).finally(() => setBootstrapping(false));
    }, []);

    useEffect(() => {
        if (!token) return;
        if (isExpoGo) { console.warn('[push] Expo Go detected — push skipped'); return; }
        (async () => {
            try {
                const { status } = await Notifications.requestPermissionsAsync();
                console.log('[push] permission status:', status);
                if (status !== 'granted') return;
                const projectId =
                    Constants.expoConfig?.extra?.eas?.projectId ??
                    Constants.easConfig?.projectId;
                console.log('[push] projectId:', projectId);
                if (!projectId) return;
                const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
                console.log('[push] token obtained:', pushToken?.substring(0, 40));
                await api.post('/auth/push-token', { token: pushToken });
                console.log('[push] token saved to server');
            } catch (e) { console.warn('[push] setup error:', e?.message); }
        })();
    }, [token]);

    if (bootstrapping) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.purple} />
            </View>
        );
    }

    return (
        <NavigationContainer ref={navigationRef} onReady={() => {
            if (pendingNavRef.current) {
                navigateFromNotif(pendingNavRef.current);
                pendingNavRef.current = null;
            }
            if (pendingDeepLinkRef.current) {
                resolveDeepLinkAndNavigate(pendingDeepLinkRef.current);
                pendingDeepLinkRef.current = null;
            }
        }}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!token ? (
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Register" component={RegisterScreen} />
                        <Stack.Screen name="BusinessRegister" component={BusinessRegisterScreen} />
                        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    </>
                ) : isBusiness ? (
                    <>
                        <Stack.Screen name="BusinessApp" component={BusinessHomeScreen} />
                        <Stack.Screen name="App" component={AppTabs} />
                    </>
                ) : (
                    <Stack.Screen name="App" component={AppTabs} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
