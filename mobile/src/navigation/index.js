import { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
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

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
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
            <ProfileStack.Screen name="UserPosts" component={UserPostsScreen} />
            <ProfileStack.Screen name="CreatePost" component={CreatePostScreen} />
        </ProfileStack.Navigator>
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
    const notifsClearedRef = useRef(false);

    // Socket connection + real-time notification badge
    useEffect(() => {
        if (!userId) return;
        connectSocket(userId);
        const off = onSocket('notification', (notif) => {
            if (notifsClearedRef.current) {
                notifsClearedRef.current = false;
            }
            setUnreadNotifs(prev => prev + 1);
            if (!isExpoGo && notif?.id && !shownNotifIdsRef.current.has(notif.id)) {
                shownNotifIdsRef.current.add(notif.id);
                Notifications.scheduleNotificationAsync({
                    content: { title: notif.title, body: notif.body, sound: 'default', data: notif.data || {} },
                    trigger: null,
                }).catch(() => {});
            }
        });
        return () => { off(); disconnectSocket(); };
    }, [userId]);

    // Initial load only — set badge from backend unread count
    useEffect(() => {
        const init = async () => {
            try {
                const { data } = await api.get('/notifications');
                const notifCount = data.unreadCount || 0;
                shownNotifIdsRef.current = new Set(
                    (data.notifications || []).filter(n => !n.read).map(n => n.id)
                );
                setUnreadNotifs(notifCount);
            } catch { /* silent */ }
        };
        const t = setTimeout(init, 3000);
        return () => clearTimeout(t);
    }, []);

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
                component={NotificationsScreen}
                listeners={{ tabPress: () => { setUnreadNotifs(0); notifsClearedRef.current = true; } }}
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
        (async () => {
            try {
                const { status } = await Notifications.requestPermissionsAsync();
                if (status !== 'granted') return;
                const projectId =
                    Constants.expoConfig?.extra?.eas?.projectId ??
                    Constants.easConfig?.projectId;
                if (!projectId) return;
                const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
                await api.post('/auth/push-token', { token: pushToken });
            } catch (e) { console.warn('Push setup error:', e?.message); }
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
        <NavigationContainer>
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
