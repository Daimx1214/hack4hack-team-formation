import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

// 404 (Build Spec §5.7): a large mono '404' in the brand text colour,
// a plain H1, and a way back. No jokes, no illustrations.

export default function NotFound() {
  return (
    <div className="page">
      <div className="container not-found">
        <p className="not-found-code" aria-hidden="true">
          404
        </p>
        <h1 className="h1">This page doesn't exist</h1>
        <p className="muted" style={{ margin: '12px 0 28px' }}>
          The link may be old, or the address may have a typo.
        </p>
        <Link to="/teams">
          <Button>Back to Teams</Button>
        </Link>
      </div>
    </div>
  );
}
