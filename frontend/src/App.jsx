import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { useSelector } from 'react-redux';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import CategoryPage from './pages/CategoryPage';
import SubCategoryPage from './pages/SubCategoryPage';
import ProfilePage from './pages/ProfilePage';
import MessagesPage from './pages/MessagesPage';
import CourtsPage from './pages/CourtsPage';
import VenuesPage from './pages/VenuesPage';
import AdminPage from './pages/AdminPage';
import ArchivePage from './pages/ArchivePage';
import MusicPage from './pages/MusicPage';
import CinemaPage from './pages/CinemaPage';
import TheaterPage from './pages/TheaterPage';
import ActivityFeedPage from './pages/ActivityFeedPage';
import BusinessHomePage from './pages/BusinessHomePage';
import FriendFindingPage from './pages/FriendFindingPage';
import ChessPage from './pages/games/ChessPage';
import TavlaPage from './pages/games/TavlaPage';
import OkeyPage from './pages/games/OkeyPage';
import BatakPage from './pages/games/BatakPage';
import MyReservationsPage from './pages/MyReservationsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import NotificationsPage from './pages/NotificationsPage';
import UserPostsPage from './pages/UserPostsPage';
import BusinessRegisterPage from './pages/BusinessRegisterPage';
import TravelExplorePage from './pages/travel/TravelExplorePage';
import TravelRouteCreatePage from './pages/travel/TravelRouteCreatePage';
import TravelRouteDetailPage from './pages/travel/TravelRouteDetailPage';
import TravelTripCreatePage from './pages/travel/TravelTripCreatePage';
import TravelTripDetailPage from './pages/travel/TravelTripDetailPage';
import TravelVerificationPage from './pages/travel/TravelVerificationPage';

function App() {
  const token = useSelector(state => state.auth.token);
  const lang  = useSelector(state => state.lang.lang);
  const { i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang]);

  return (
    <ErrorBoundary resetKey={location.pathname}>
    <Routes>
      <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/home" />} />
      <Route path="/register" element={!token ? <RegisterPage /> : <Navigate to="/home" />} />
      <Route path="/register/business" element={!token ? <BusinessRegisterPage /> : <Navigate to="/home" />} />
      <Route path="/forgot-password" element={!token ? <ForgotPasswordPage /> : <Navigate to="/home" />} />
      <Route path="/home" element={token ? <HomePage /> : <Navigate to="/login" />} />
      <Route path="/category/:category" element={token ? <CategoryPage /> : <Navigate to="/login" />} />
      <Route path="/category/:category/:sub" element={token ? <SubCategoryPage /> : <Navigate to="/login" />} />
      <Route path="/profile" element={token ? <ProfilePage /> : <Navigate to="/login" />} />
      <Route path="/profile/:userId" element={token ? <ProfilePage /> : <Navigate to="/login" />} />
      <Route path="/profile/:userId/posts" element={token ? <UserPostsPage /> : <Navigate to="/login" />} />
      <Route path="/messages" element={token ? <MessagesPage /> : <Navigate to="/login" />} />
      <Route path="/messages/:userId" element={token ? <MessagesPage /> : <Navigate to="/login" />} />
      <Route path="/courts" element={token ? <CourtsPage /> : <Navigate to="/login" />} />
      <Route path="/venues" element={token ? <VenuesPage /> : <Navigate to="/login" />} />
      <Route path="/admin" element={token ? <AdminPage /> : <Navigate to="/login" />} />
      <Route path="/archive" element={token ? <ArchivePage /> : <Navigate to="/login" />} />
      <Route path="/music" element={token ? <MusicPage /> : <Navigate to="/login" />} />
      <Route path="/cinema" element={token ? <CinemaPage /> : <Navigate to="/login" />} />
      <Route path="/theater" element={token ? <TheaterPage /> : <Navigate to="/login" />} />
      <Route path="/activity" element={token ? <ActivityFeedPage /> : <Navigate to="/login" />} />
      <Route path="/notifications" element={token ? <NotificationsPage /> : <Navigate to="/login" />} />
      <Route path="/business" element={token ? <BusinessHomePage /> : <Navigate to="/login" />} />
      <Route path="/friend-finding" element={token ? <FriendFindingPage /> : <Navigate to="/login" />} />
      <Route path="/games/chess" element={token ? <ChessPage /> : <Navigate to="/login" />} />
      <Route path="/games/tavla" element={token ? <TavlaPage /> : <Navigate to="/login" />} />
      <Route path="/games/okey" element={token ? <OkeyPage /> : <Navigate to="/login" />} />
      <Route path="/games/batak" element={token ? <BatakPage /> : <Navigate to="/login" />} />
      <Route path="/reservations" element={token ? <MyReservationsPage /> : <Navigate to="/login" />} />
      <Route path="/travel" element={token ? <TravelExplorePage /> : <Navigate to="/login" />} />
      <Route path="/travel/routes/new" element={token ? <TravelRouteCreatePage /> : <Navigate to="/login" />} />
      <Route path="/travel/routes/:routeId" element={token ? <TravelRouteDetailPage /> : <Navigate to="/login" />} />
      <Route path="/travel/trips/new" element={token ? <TravelTripCreatePage /> : <Navigate to="/login" />} />
      <Route path="/travel/trips/:tripId" element={token ? <TravelTripDetailPage /> : <Navigate to="/login" />} />
      <Route path="/travel/verify" element={token ? <TravelVerificationPage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={token ? "/home" : "/login"} />} />
    </Routes>
    </ErrorBoundary>
  );
}

export default App;