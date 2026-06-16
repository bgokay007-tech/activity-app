import { Component } from 'react';
import { View, Text, LogBox } from 'react-native';

LogBox.ignoreLogs(['expo-notifications']);
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import Navigation from './src/navigation';

class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <View style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <Text style={{ color: '#f00', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Crash:</Text>
                    <Text style={{ color: '#fff', fontSize: 12 }}>{this.state.error?.message}</Text>
                    <Text style={{ color: '#aaa', fontSize: 10, marginTop: 8 }}>{this.state.error?.stack?.slice(0, 300)}</Text>
                </View>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    return (
        <ErrorBoundary>
            <SafeAreaProvider>
                <Provider store={store}>
                    <StatusBar style="light" />
                    <Navigation />
                </Provider>
            </SafeAreaProvider>
        </ErrorBoundary>
    );
}
