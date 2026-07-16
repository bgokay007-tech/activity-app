import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import musicPlaybackService from './src/services/musicPlaybackService';

registerRootComponent(App);
TrackPlayer.registerPlaybackService(() => musicPlaybackService);
