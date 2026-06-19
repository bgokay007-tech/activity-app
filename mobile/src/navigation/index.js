import { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer, StackActions, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCredentials, setUser } from '../store/slices/authSlice';
import { setLang } from '../store/slices/langSlice';
import useT from '../hooks/useT';
import { ActivityIndicator, View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '../services/api';
import { connectSocket, disconnectSocket, onSocket } from '../services/socket';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const navigationRef = createNavigationContainerRef();

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
    } else if (data.category && data.subCategory) {
        let initialTab = 'rivals';
        if (type?.startsWith('TOURNAMENT') || type === 'CANCELLATION_REQUEST') initialTab = 'tournaments';
        else if (type === 'MATCH_CONFIRMED') initialTab = 'rivals';
        else if (type === 'SCORE_CONFIRMED' || type === 'MATCH_COMPLETED') initialTab = 'archive';
        navigationRef.navigate('HomeTab', {
            screen: 'SubCategory',
            params: { category: data.category, sub: data.subCategory, initialTab, highlightRivalId: data.rivalId || null },
        });
    }
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
import HomeScreen from '../screens/main/HomeScreen';
import CategoryScreen from '../screens/main/CategoryScreen';
import SubCategoryScreen from '../screens/main/SubCategoryScreen';
import MessagesScreen from '../screens/main/MessagesScreen';
import ChatScreen from '../screens/main/ChatScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import UserPostsScreen from '../screens/main/UserPostsScreen';
import CreatePostScreen from '../screens/main/CreatePostScreen';
import colors from '../theme/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const NotificationsStack = createNativeStackNavigator();

function HomeStackNav() {
    return (
        <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <HomeStack.Screen name="Home" component={HomeScreen} />
            <HomeStack.Screen name="Category" component={CategoryScreen} />
            <HomeStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <HomeStack.Screen name="Profile" component={ProfileScreen} />
            <HomeStack.Screen name="UserPosts" component={UserPostsScreen} />
            <HomeStack.Screen name="CreatePost" component={CreatePostScreen} />
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
            <ProfileStack.Screen name="Profile" component={ProfileScreen} />
            <ProfileStack.Screen name="UserPosts" component={UserPostsScreen} />
            <ProfileStack.Screen name="CreatePost" component={CreatePostScreen} />
        </ProfileStack.Navigator>
    );
}

function NotificationsStackNav() {
    return (
        <NotificationsStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <NotificationsStack.Screen name="NotificationsList" component={NotificationsScreen} />
            <NotificationsStack.Screen name="SubCategory" component={SubCategoryScreen} />
            <NotificationsStack.Screen name="Profile" component={ProfileScreen} />
            <NotificationsStack.Screen name="Chat" component={ChatScreen} />
        </NotificationsStack.Navigator>
    );
}

function TabIcon({ label, active }) {
    const icons = {
        Home: active ? '🏠' : '🏡',
        Messages: active ? '💬' : '💬',
        Notifications: active ? '🔔' : '🔕',
        Profile: active ? '👤' : '👤',
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
    const userId = useSelector(s => s.auth.user?.id);
    const [unreadNotifs, setUnreadNotifs] = useState(0);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const pollRef = useRef(null);
    const shownNotifIdsRef = useRef(new Set());

    // Fetch unread count from backend — source of truth
    const syncBadge = useCallback(async () => {
        try {
            const { data } = await api.get('/notifications');
            const count = data.unreadCount || 0;
            shownNotifIdsRef.current = new Set(
                (data.notifications || []).filter(n => !n.read).map(n => n.id)
            );
            setUnreadNotifs(count);
        } catch { /* silent */ }
    }, []);

    // Poll every 30s — keeps badge in sync with server after mark-all-read
    useEffect(() => {
        const t = setTimeout(syncBadge, 2000);
        pollRef.current = setInterval(syncBadge, 30000);
        return () => { clearTimeout(t); clearInterval(pollRef.current); };
    }, [syncBadge]);

    // Socket connection — instant badge increment on new notification
    useEffect(() => {
        if (!userId) return;
        connectSocket(userId);
        const off = onSocket('notification', (notif) => {
            setUnreadNotifs(prev => prev + 1);
            if (!isExpoGo && notif?.id && !shownNotifIdsRef.current.has(notif.id)) {
                shownNotifIdsRef.current.add(notif.id);
                Notifications.scheduleNotificationAsync({
                    content: { title: notif.title, body: notif.body, sound: 'default', data: { ...(notif.data || {}), type: notif.type } },
                    trigger: null,
                }).catch(() => {});
            }
        });
        return () => { off(); disconnectSocket(); };
    }, [userId]);

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                    paddingTop: 8,
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
                name="NotificationsTab"
                component={NotificationsStackNav}
                listeners={({ navigation }) => ({
                    tabPress: (e) => {
                        setUnreadNotifs(0);
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
    );
}

export default function Navigation() {
    const dispatch = useDispatch();
    const token = useSelector(s => s.auth.token);
    const [bootstrapping, setBootstrapping] = useState(true);
    const pendingNavRef = useRef(null);

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
        }}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!token ? (
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="Register" component={RegisterScreen} />
                    </>
                ) : (
                    <Stack.Screen name="App" component={AppTabs} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
