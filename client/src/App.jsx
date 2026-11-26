import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';
import Admin from './pages/Admin.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import Bookings from './pages/Bookings.jsx';
import CenterDetail from './pages/CenterDetail.jsx';
import Centers from './pages/Centers.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import NewBooking from './pages/NewBooking.jsx';
import Attendance from './pages/Attendance.jsx';
import Planning from './pages/Planning.jsx';
import Directory from './pages/Directory.jsx';
import Register from './pages/Register.jsx';
import Utilization from './pages/Utilization.jsx';

function Private({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Private><Layout /></Private>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/new" element={<Private roles={['institute_admin', 'super_admin']}><NewBooking /></Private>} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/centers" element={<Centers />} />
        <Route path="/centers/:id" element={<CenterDetail />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/utilization" element={<Utilization />} />
        <Route path="/directory" element={<Private roles={['exam_agency', 'super_admin']}><Directory /></Private>} />
        <Route path="/admin" element={<Private roles={['super_admin']}><Admin /></Private>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
