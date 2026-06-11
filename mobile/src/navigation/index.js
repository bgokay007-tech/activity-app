import { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCredentials } from '../store/slices/authSlice';
import { setLang } from '../store/slices/langSlice';
import useT from '../hooks/useT';
import { ActivityIndicator, View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '../services/api';

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
    const [unreadCount, setUnreadCount] = useState(0);
    const pollRef = useRef(null);

    useEffect(() => {
        const fetchUnread = async () => {
            try {
                const { data } = await api.get('/notifications');
                setUnreadCount(data.unreadCount || 0);
            } catch { /* silent */ }
        };
        fetchUnread();
        pollRef.current = setInterval(fetchUnread, 30000);
        return () => clearInterval(pollRef.current);
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
                options={{ tabBarLabel: t.messages, tabBarIcon: ({ focused }) => <TabIcon label="Messages" active={focused} /> }}
            />
            <Tab.Screen
                name="NotificationsTab"
                component={NotificationsScreen}
                listeners={{ tabPress: () => setUnreadCount(0) }}
                options={{
                    tabBarLabel: t.alerts,
                    tabBarIcon: ({ focused }) => <TabIcon label="Notifications" active={focused} />,
                    tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
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
        ]).then(([token, lang]) => {
            if (token) dispatch(setCredentials({ token, user: null }));
            if (lang) dispatch(setLang(lang));
        }).finally(() => setBootstrapping(false));
    }, []);

    useEffect(() => {
        if (!token) return;
        (async () => {
            try {
                // Push notifications removed from Expo Go in SDK 53+, requires a dev/prod build
                if (Constants.appOwnership === 'expo') return;
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
