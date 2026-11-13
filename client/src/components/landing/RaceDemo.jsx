import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';

// Interactive race demo (Build Spec §5.1): a 4-seat meter and a button
// that simulates 10 people clicking Join at the same moment. Exactly 4
// get in; the other 6 are told the team is full. Client-side simulation,
// labelled as a demo — the real guarantee lives in the API's atomic join.

const CAPACITY = 4;
const CLICKERS = 10;

export default function RaceDemo() {
  const [filled, setFilled] = useState(0);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function simulate() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setFilled(0);
    setResults([]);
    setRunning(true);
    for (let i = 0; i < CLICKERS; i += 1) {
      const joined = i < CAPACITY;
      const timer = setTimeout(
        () => {
          if (joined) setFilled((f) => Math.min(CAPACITY, f + 1));
          setResults((r) => [...r, joined ? 'joined' : 'full']);
          if (i === CLICKERS - 1) setRunning(false);
        },
        160 * (i + 1)
      );
      timers.current.push(timer);
    }
  }

  const demoTeam = { memberCount: filled, capacity: CAPACITY, seatsLeft: CAPACITY - filled, isMember: false };

  return (
    <div className="demo-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="h4">One team, {CAPACITY} seats</span>
        <span className="badge badge-info">Demo</span>
      </div>
      <div className="seat-meter" aria-hidden="true">
        <div className="seat-segments">
          {Array.from({ length: CAPACITY }, (_, i) => (
            <span
              key={i}
              className={`seat-segment${i < filled ? (demoTeam.seatsLeft === 0 ? ' filled-muted' : ' filled-brand') : ''}`}
            />
          ))}
        </div>
        <span className="seat-count">
          {filled} / {CAPACITY}
        </span>
      </div>
      <div style={{ marginTop: 20 }}>
        <Button onClick={simulate} loading={running} variant="secondary">
          Simulate 10 people clicking
        </Button>
      </div>
      <div className="demo-results" aria-live="polite">
        {results.map((r, i) => (
          <span key={i} className={`demo-chip ${r}`}>
            {r === 'joined' ? 'Joined' : 'Team is full'}
          </span>
        ))}
      </div>
      {results.length === CLICKERS && (
        <p className="small muted" style={{ marginTop: 8 }}>
          Four seats, four members — the other six were turned away cleanly. No over-fill, no
          duplicates.
        </p>
      )}
    </div>
  );
}
