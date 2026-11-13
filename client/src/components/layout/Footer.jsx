import { Link } from 'react-router-dom';
import Logo from '../ui/Logo';
import ThemeToggle from './ThemeToggle';

// Footer (Build Spec §5.1): 4 columns — brand + theme toggle, Product,
// Project, Account — and a muted bottom bar.

const GITHUB_URL = 'https://github.com/Daimx1214/hack4hack-team-formation';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="footer-tagline">
              Team formation for hackathons — set a capacity, and it holds. Every seat counted,
              every time.
            </p>
            <ThemeToggle />
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <Link to="/teams">Browse teams</Link>
            <Link to="/teams/new">Create team</Link>
            <Link to="/dashboard">My teams</Link>
          </div>
          <div className="footer-col">
            <h5>Project</h5>
            <Link to="/#how-it-works">How it works</Link>
            <a href={`${GITHUB_URL}/blob/main/DESIGN.md`} target="_blank" rel="noreferrer">
              Design notes
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <div className="footer-col">
            <h5>Account</h5>
            <Link to="/login">Log in</Link>
            <Link to="/register">Sign up</Link>
          </div>
        </div>
        <div className="footer-bottom">
          © 2026 TeamForge. Built for the Hack4Hack Crew Hiring Challenge.
        </div>
      </div>
    </footer>
  );
}
