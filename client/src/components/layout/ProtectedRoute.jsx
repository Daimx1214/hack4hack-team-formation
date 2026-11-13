import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '../ui/misc';

// Route guard (Build Spec §8): while the session is still being
// restored we render a quiet loading state instead of bouncing a
// logged-in user to /login; once restoration settles, guests are
// redirected to /login with a returnTo back to where they were going.

export default function ProtectedRoute({ user, sessionReady, children }) {
  const location = useLocation();
  if (!sessionReady) {
    return (
      <div className="page">
        <div className="container" aria-label="Loading">
          <Skeleton height={36} width={240} style={{ marginBottom: 16 }} />
          <Skeleton height={16} width="40%" />
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return children;
}
