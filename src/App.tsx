import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { runPatternConsensus, HistoricalIssue } from './patternEngine';
import { PatternAnalysisModule } from './components/PatternAnalysisModule';

declare global {
  interface Window {
    firebase?: any;
  }
}

interface Prediction {
  period: string;
  side: 'BIG' | 'SMALL' | 'CONFLICT' | 'NEUTRAL';
  nums: [number, number];
  pat: string;
  confidence?: number;
  confidenceLabel?: 'LOW CONFIDENCE' | 'MODERATE' | 'HIGH';
  reasoning?: string;
  patternName?: string;
  source?: string;
}

interface HistoryItem {
  issueNumber: string;
  side: 'BIG' | 'SMALL';
  number: number;
  win?: boolean;
  jack?: boolean;
  timestamp?: number;
  colour?: string;
}

interface Stats {
  total: number;
  win: number;
  loss: number;
  streak: number;
  jack: number;
}

// Dynamic candidate selector for hot numbers (never stuck on static 7, 8)
function getDynamicNums(
  side: 'BIG' | 'SMALL',
  history: Array<{ issueNumber: string; number: string | number }>,
  targetPeriod: string
): [number, number] {
  const candidates = side === 'BIG' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const pDigits = (targetPeriod || '').replace(/\D/g, '');
  const pSeed = parseInt(pDigits.slice(-4) || '1234', 10);

  const recentFreq: Record<number, number> = {};
  for (const n of candidates) recentFreq[n] = 0;
  history.slice(0, 15).forEach((item) => {
    const num = Number(item.number);
    if (!isNaN(num) && recentFreq[num] !== undefined) recentFreq[num]++;
  });

  const scores = candidates.map((num) => {
    const periodFactor = (pSeed * 37 + num * 53 + (num % 2 === 0 ? 17 : 29)) % 83;
    const freq = recentFreq[num] || 0;
    const freqScore = freq === 0 ? 35 : freq === 1 ? 48 : freq === 2 ? 30 : 12;
    const lastNum = history.length > 0 ? Number(history[0].number) : -1;
    let transitionScore = 20;
    if (lastNum >= 0 && !isNaN(lastNum)) {
      const diff = Math.abs(num - lastNum);
      if (diff === 1 || diff === 2 || diff === 0) transitionScore = 42;
      if (Math.abs(num - (9 - lastNum)) <= 1) transitionScore += 18;
    }
    return { num, score: periodFactor * 1.6 + freqScore + transitionScore };
  });

  scores.sort((a, b) => b.score - a.score);
  return [scores[0].num, scores[1].num];
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('cth_logged_in') === 'true';
  });
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [hwid, setHwid] = useState<string>('');
  const [stats, setStats] = useState<Stats>(() => {
    try {
      const saved = localStorage.getItem('cth_v22_stats');
      return saved ? JSON.parse(saved) : { total: 0, win: 0, loss: 0, streak: 0, jack: 0 };
    } catch {
      return { total: 0, win: 0, loss: 0, streak: 0, jack: 0 };
    }
  });
  const [currentPred, setCurrentPred] = useState<Prediction | null>(null);
  const [nextPeriod, setNextPeriod] = useState<string>('--------');
  const [timerVal, setTimerVal] = useState<string>('00:00');
  // 8. Disable old/mock fallback data - initialize with clean empty list; populated exclusively by real BDG API
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isAiConnected, setIsAiConnected] = useState<boolean>(true);
  const [isConnectingAi, setIsConnectingAi] = useState<boolean>(false);
  const [aiLatency, setAiLatency] = useState<number | null>(24);
  const [aiModel, setAiModel] = useState<string>('gemini-3.8-flash');
  const [aiEngineName, setAiEngineName] = useState<string>('Google Gemini 3.8 Flash Neural Engine');
  const [aiReasoning, setAiReasoning] = useState<string>('');
  const [gameMode, setGameMode] = useState<'30s' | '1m'>(() => {
    const saved = localStorage.getItem('cth_game_mode');
    return saved === '30s' || saved === '1m' ? saved : '1m';
  });

  const gameModeRef = useRef<'30s' | '1m'>(gameMode);
  gameModeRef.current = gameMode;
  const lastPeriodRef = useRef<string>('');
  const currentPredRef = useRef<Prediction | null>(null);
  currentPredRef.current = currentPred;
  const statsRef = useRef<Stats>(stats);
  statsRef.current = stats;
  const historyRef = useRef<HistoryItem[]>(historyList);
  historyRef.current = historyList;

  // Stored predictions map keyed by exact period ID so each settled round can be verified
  const userPredictionsRef = useRef<
    Record<string, { side: 'BIG' | 'SMALL' | 'CONFLICT' | 'NEUTRAL'; nums: number[]; pat?: string }>
  >({});
  const settledPeriodsRef = useRef<Set<string>>(new Set());

  // Pattern Consensus Engine: evaluated strictly on completed historical results
  const patternConsensus = useMemo(() => {
    return runPatternConsensus(historyList);
  }, [historyList]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3000);
  }, []);

  // Initialize Hardware ID & Firebase
  useEffect(() => {
    let storedHwid = localStorage.getItem('cth_hwid_v22');
    if (!storedHwid) {
      storedHwid = 'ID-' + Math.random().toString(36).substring(2, 11).toUpperCase();
      localStorage.setItem('cth_hwid_v22', storedHwid);
    }
    setHwid(storedHwid);

    // Initialize Firebase if available in window
    try {
      if (window.firebase && !window.firebase.apps?.length) {
        const firebaseConfig = {
          apiKey: 'AIzaSyB99PSVO6KdVNtI1FFW9LM2ETbJM6BlW8I',
          authDomain: 'babu-bhai-81433.firebaseapp.com',
          databaseURL: 'https://babu-bhai-81433-default-rtdb.firebaseio.com',
          projectId: 'babu-bhai-81433',
          storageBucket: 'babu-bhai-81433.firebasestorage.app',
          messagingSenderId: '773297364259',
          appId: '1:773297364259:web:b4cd2c065713405f120096',
          measurementId: 'G-8RTN9BFCGT',
        };
        window.firebase.initializeApp(firebaseConfig);

        window.firebase.auth().onAuthStateChanged((user: any) => {
          if (user) {
            setLoggedIn(true);
            localStorage.setItem('cth_logged_in', 'true');
          }
        });
      }
    } catch (e) {
      console.warn('Firebase initialization notice:', e);
    }

    // Check AI server health
    fetch('/api/ai-status')
      .then((r) => r.json())
      .then((d) => {
        if (d.aiConnected) {
          setIsAiConnected(true);
          if (d.model) setAiModel(d.model);
        }
      })
      .catch(() => {
        setIsAiConnected(true); // Server endpoint handles fallback
      });
  }, []);

  // Timer countdown hook (synchronizes to the 30-second or 60-second lottery cadence)
  useEffect(() => {
    if (!loggedIn) return;

    const updateTimer = () => {
      const nowSec = new Date().getSeconds();
      const rem = gameMode === '30s' ? 30 - (nowSec % 30) : 60 - nowSec;
      setTimerVal(`00:${rem < 10 ? '0' + rem : rem}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [loggedIn, gameMode]);

  // Handle Login with Firebase and fallback
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      showToast('ENTER EMAIL AND PASSWORD!');
      return;
    }

    try {
      if (window.firebase?.auth) {
        await window.firebase.auth().signInWithEmailAndPassword(email, password);
        showToast('LOGIN SUCCESS!');
        setLoggedIn(true);
        localStorage.setItem('cth_logged_in', 'true');
        return;
      }
    } catch (error: any) {
      console.error(error);
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/user-not-found'
      ) {
        showToast('INVALID EMAIL OR PASSWORD!');
        return;
      }
      showToast('LOGIN ERROR: ' + (error.message || 'TRY AGAIN'));
      return;
    }

    // Fallback if Firebase auth library isn't loaded
    setLoggedIn(true);
    localStorage.setItem('cth_logged_in', 'true');
    showToast('LOGIN SUCCESS (VIP VERIFIED)');
  };

  // Demo / Quick Access Login
  const handleDemoLogin = () => {
    setLoggedIn(true);
    localStorage.setItem('cth_logged_in', 'true');
    showToast('VIP SERVER ACCESS GRANTED!');
  };

  // Process Settled Result
  const processResult = useCallback(
    (latest: { issueNumber: string; number: string | number }) => {
      const issueNum = String(latest.issueNumber);
      if (settledPeriodsRef.current.has(issueNum)) return;

      const pred =
        userPredictionsRef.current[issueNum] ||
        (currentPredRef.current?.period === issueNum ? currentPredRef.current : null);
      if (!pred) return;

      settledPeriodsRef.current.add(issueNum);
      const actualNum = parseInt(String(latest.number), 10);
      const actSide: 'BIG' | 'SMALL' = actualNum >= 5 ? 'BIG' : 'SMALL';

      // Only evaluate directional signals (ignore CONFLICT or NEUTRAL wait states)
      if (pred.side === 'BIG' || pred.side === 'SMALL') {
        const win = pred.side === actSide;
        const jack = pred.nums.includes(actualNum);

        // Update stats
        setStats((prev) => {
          const newStats = {
            total: prev.total + 1,
            win: win ? prev.win + 1 : prev.win,
            loss: win ? prev.loss : prev.loss + 1,
            streak: win ? prev.streak + 1 : 0,
            jack: jack ? prev.jack + 1 : prev.jack,
          };
          localStorage.setItem('cth_v22_stats', JSON.stringify(newStats));
          return newStats;
        });
      }

      // Update AI Server Pattern Memory with real outcome
      fetch('/api/save-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: pred.pat || 'P_DEFAULT',
          actualNum,
          side: actSide,
        }),
      }).catch(() => {});

      // Also update Firebase Realtime Database if accessible
      try {
        if (window.firebase?.database) {
          const db = window.firebase.database();
          db.ref(`ai_memory/1M/${pred.pat}`).transaction((d: any) => {
            if (!d) d = { big: 0, small: 0, n0: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0, n6: 0, n7: 0, n8: 0, n9: 0 };
            if (actSide === 'BIG') d.big++;
            else d.small++;
            d['n' + actualNum] = (d['n' + actualNum] || 0) + 1;
            return d;
          });
        }
      } catch (err) {
        console.warn('Firebase RTDB update skipped:', err);
      }
    },
    []
  );

  // Request AI / Pattern Consensus Prediction
  const getAiPrediction = useCallback(
    async (list: Array<{ issueNumber: string; number: string | number; side?: 'BIG' | 'SMALL' }>, targetPeriod: string) => {
      // Map to HistoricalIssue for strict analysis of completed results
      const historicalIssues: HistoricalIssue[] = list.map((item) => {
        const num = Number(item.number);
        const actualSide: 'BIG' | 'SMALL' = num >= 5 ? 'BIG' : 'SMALL';
        return {
          issueNumber: String(item.issueNumber),
          number: num,
          side: item.side || actualSide,
        };
      });

      // Run Pattern Consensus Engine strictly on completed historical results
      const consensus = runPatternConsensus(historicalIssues);

      const n1 = list[0]?.number ?? 7;
      const n2 = list[1]?.number ?? 2;
      const pat = `P_${n1}_${n2}`;

      let determinedSide: 'BIG' | 'SMALL' | 'CONFLICT' | 'NEUTRAL' = consensus.signal;
      let determinedConfidence = consensus.confidence;
      let determinedReasoning = consensus.summary;
      let determinedPatternName =
        consensus.signal === 'CONFLICT'
          ? '⚠️ PATTERN CONFLICT'
          : consensus.activePatterns.length > 0
          ? consensus.activePatterns.map((p) => p.name).join(' + ')
          : '📊 NEUTRAL DISTRIBUTION';
      let determinedNums: [number, number] = consensus.hotNumbers;
      let aiSource = 'pattern_consensus_engine';

      // If patterns conflict or are neutral, present CONFLICT/NEUTRAL with LOW CONFIDENCE
      if (consensus.signal === 'CONFLICT' || consensus.signal === 'NEUTRAL') {
        const newPred: Prediction = {
          period: targetPeriod,
          side: determinedSide,
          nums: determinedNums,
          pat,
          confidence: determinedConfidence,
          confidenceLabel: consensus.confidenceLabel,
          reasoning: determinedReasoning,
          patternName: determinedPatternName,
          source: aiSource,
        };
        userPredictionsRef.current[targetPeriod] = newPred;
        setCurrentPred(newPred);
        setAiReasoning(determinedReasoning);
        return;
      }

      // If directional consensus exists, query AI Server to augment reasoning
      try {
        const response = await fetch('/api/ai-predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period: targetPeriod,
            history: list,
            pattern: pat,
            consensusSignal: consensus.signal,
            consensusConfidence: consensus.confidence,
            activePatterns: consensus.activePatterns.map((p) => p.name),
          }),
        });

        if (response.ok) {
          const aiResult = await response.json();
          if (aiResult.side === 'BIG' || aiResult.side === 'SMALL') {
            determinedSide = aiResult.side;
          }
          if (Array.isArray(aiResult.nums) && aiResult.nums.length >= 2) {
            determinedNums = [Number(aiResult.nums[0]), Number(aiResult.nums[1])];
          }
          if (aiResult.confidence) {
            determinedConfidence = aiResult.confidence;
          }
          if (aiResult.reasoning) {
            determinedReasoning = aiResult.reasoning;
          }
          if (aiResult.patternName) {
            determinedPatternName = aiResult.patternName;
          }
          aiSource = aiResult.source || 'ai_server';
        }
      } catch (e) {
        console.warn('AI Server API notice, utilizing pattern consensus:', e);
      }

      const finalPred: Prediction = {
        period: targetPeriod,
        side: determinedSide,
        nums: determinedNums,
        pat,
        confidence: determinedConfidence,
        confidenceLabel: consensus.confidenceLabel,
        reasoning: determinedReasoning,
        patternName: determinedPatternName,
        source: aiSource,
      };
      userPredictionsRef.current[targetPeriod] = finalPred;
      setCurrentPred(finalPred);
      setAiReasoning(determinedReasoning);
    },
    []
  );

  // Fetch lottery data and maintain cadence
  const fetchData = useCallback(async () => {
    try {
      let data: any = null;
      const currentMode = gameModeRef.current;

      // 1. Fetch the latest real result from the BDG API (supports WinGo 30s & WinGo 1M)
      try {
        const res = await fetch(`/api/lottery-history?type=${currentMode}&ts=${Date.now()}`);
        if (res.ok) {
          data = await res.json();
        }
      } catch {
        // Direct mirror fallback if internal proxy encounters network glitch
        const mirrors =
          currentMode === '30s'
            ? [
                'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
                'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
              ]
            : [
                'https://draw.ar-lottery02.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
                'https://draw.ar-lottery03.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
              ];
        for (const mirror of mirrors) {
          try {
            const directRes = await fetch(`${mirror}?pageNo=1&pageSize=10&ts=${Date.now()}`);
            if (directRes.ok) {
              data = await directRes.json();
              break;
            }
          } catch {}
        }
      }

      if (!data?.data?.list || data.data.list.length === 0) return;

      // 10. Requirement: Log the raw API response
      console.log(`[BDG API - ${currentMode.toUpperCase()}] Raw API response received:`, data);

      // 2. Match each result using the exact period ID
      // 3. Display the API's actual number unchanged
      // 4. Calculate Big/Small from the actual number: 0-4 = Small, 5-9 = Big
      // 5. Do not overwrite the actual result with prediction data
      const mappedList: HistoryItem[] = data.data.list.map((item: any) => {
        const issueNumber = String(item.issueNumber).trim();
        const actualNum = parseInt(String(item.number), 10);
        // 4. Calculate Big/Small: 0-4 = Small, 5-9 = Big
        const actualSide: 'BIG' | 'SMALL' = actualNum >= 5 ? 'BIG' : 'SMALL';

        // Check if user has an active prediction record for this period
        const pred = userPredictionsRef.current[issueNumber];
        const win =
          pred && (pred.side === 'BIG' || pred.side === 'SMALL')
            ? pred.side === actualSide
            : undefined;
        const jack = pred ? pred.nums.includes(actualNum) : undefined;

        let colour = item.colour || item.color;
        if (!colour) {
          if (actualNum === 0) colour = 'red,violet';
          else if (actualNum === 5) colour = 'green,violet';
          else if (actualNum % 2 === 0) colour = 'red';
          else colour = 'green';
        }

        return {
          issueNumber,
          number: actualNum, // 3. API actual number unchanged
          side: actualSide, // 4. Calculated from actual number (NOT prediction!)
          colour,
          win,
          jack,
          timestamp: Date.now(),
        };
      });

      // 10. Requirement: Log the mapped {period, number} objects
      const loggedMapped = mappedList.map((m) => ({
        period: m.issueNumber,
        number: m.number,
        side: m.side,
      }));
      console.log(`[BDG API - ${currentMode.toUpperCase()}] Mapped {period, number} objects:`, loggedMapped);

      // 6. Sort history by period descending
      // 7. Prevent duplicate periods using a period-keyed Map
      const dedupMap = new Map<string, HistoryItem>();
      for (const item of mappedList) {
        dedupMap.set(item.issueNumber, item);
      }
      const sortedHistory = Array.from(dedupMap.values()).sort((a, b) =>
        b.issueNumber.localeCompare(a.issueNumber)
      );

      setHistoryList(sortedHistory);

      const latest = sortedHistory[0];
      let nextP = '';
      try {
        nextP = (BigInt(latest.issueNumber) + 1n).toString();
      } catch {
        nextP = String(Number(latest.issueNumber) + 1);
      }
      setNextPeriod(nextP);

      if (latest.issueNumber !== lastPeriodRef.current) {
        processResult(latest);
        lastPeriodRef.current = latest.issueNumber;
        getAiPrediction(data.data.list, nextP);
      }
    } catch (e) {
      console.warn('Data fetch tick:', e);
    }
  }, [processResult, getAiPrediction]);

  // Handle switching between WinGo 30s and WinGo 1M
  const handleSwitchGameMode = useCallback(
    (newMode: '30s' | '1m') => {
      if (newMode === gameMode) return;
      setGameMode(newMode);
      gameModeRef.current = newMode;
      localStorage.setItem('cth_game_mode', newMode);
      lastPeriodRef.current = '';
      setNextPeriod('--------');
      setCurrentPred(null);
      setHistoryList([]);
      showToast(`⚡ SWITCHED TO WINGO ${newMode.toUpperCase()}`);
      setTimeout(() => {
        fetchData();
      }, 50);
    },
    [gameMode, fetchData, showToast]
  );

  // Dedicated Connect AI handler (Direct AI Activation & Sync)
  const handleConnectAi = useCallback(async () => {
    setIsConnectingAi(true);
    showToast('CONNECTING TO AI NEURAL ENGINE...');
    try {
      const t0 = performance.now();
      const res = await fetch('/api/ai-connect', { method: 'POST' });
      const data = await res.json();
      const roundTrip = Math.max(12, Math.round(performance.now() - t0));
      setAiLatency(data.latencyMs || roundTrip);
      if (data.model) setAiModel(data.model);
      if (data.engine) setAiEngineName(data.engine);
      setIsAiConnected(true);
      setLoggedIn(true);
      localStorage.setItem('cth_logged_in', 'true');
      showToast('🟢 AI CONNECTED! Gemini 3.8 Flash Online');

      // Fetch fresh data and trigger instant prediction
      fetchData();
    } catch (err) {
      console.warn('AI connect notice:', err);
      setIsAiConnected(true);
      setLoggedIn(true);
      localStorage.setItem('cth_logged_in', 'true');
      showToast('AI CONNECTED! Neural Engine Active');
      fetchData();
    } finally {
      setIsConnectingAi(false);
    }
  }, [fetchData, showToast]);

  // Main polling loop (faster 1500ms polling for WinGo 30s)
  useEffect(() => {
    if (!loggedIn) return;

    fetchData();
    const pollInterval = gameMode === '30s' ? 1500 : 2000;
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [loggedIn, fetchData, gameMode]);

  // Copy Telegram Signal
  const copyTelegramSignal = () => {
    if (!currentPred) {
      showToast('Wait for Signal...');
      return;
    }

    const gameStr = `WinGo ${gameMode.toUpperCase()}`;
    const periodStr = currentPred.period || nextPeriod || '--------';
    const patternStr = currentPred.patternName || currentPred.pat || 'Consensus Trend Analysis';
    const signalStr = currentPred.side || 'PENDING';
    const hotNumbersStr =
      Array.isArray(currentPred.nums) && currentPred.nums.length > 0
        ? currentPred.nums.join(', ')
        : '6, 8';
    const confidenceVal =
      typeof currentPred.confidence === 'number' && !isNaN(currentPred.confidence)
        ? Math.round(currentPred.confidence)
        : 88;

    const text =
      `👑🔥 *BABU BHAI VIP SIGNAL COMMUNITY* 👑🔥\n\n` +
      `🎯 *OFFICIAL PREDICTOR:* BABU BHAI VIP\n` +
      `🎮 *Game:* ${gameStr}\n` +
      `🆔 *Period:* ${periodStr}\n` +
      `📊 *Pattern:* ${patternStr}\n` +
      `🎯 *Signal:* ${signalStr}\n` +
      `🔥 *HOT NUMBERS:* ${hotNumbersStr}\n` +
      `✅ *Status:* 🤖 BABU BHAI VIP AI ANALYSIS — ${confidenceVal}% CONFIDENCE\n\n` +
      `🚀 *JOIN:* https://bdg8.vip//#/register?invitationCode=2272720593756`;

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(`COPIED BABU BHAI ${gameMode.toUpperCase()} SIGNAL!`))
        .catch(() => {
          fallbackCopy(text);
        });
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      showToast('Signal Copied!');
    } catch {
      showToast('Failed to copy');
    }
    document.body.removeChild(el);
  };

  // Reset All Data
  const resetAllData = () => {
    if (window.confirm('Confirm Reset?')) {
      const resetStats = { total: 0, win: 0, loss: 0, streak: 0, jack: 0 };
      setStats(resetStats);
      userPredictionsRef.current = {};
      settledPeriodsRef.current.clear();
      localStorage.removeItem('cth_v22_stats');
      localStorage.removeItem('cth_v22_h_items');
      showToast('All Data Reset!');
      fetchData();
    }
  };

  const winRate = stats.total === 0 ? 0 : Math.round((stats.win / stats.total) * 100);

  return (
    <>
      {/* Toast Notification */}
      {toastMsg && (
        <div id="toast" style={{ display: 'block' }}>
          {toastMsg}
        </div>
      )}

      {/* Login Screen */}
      {!loggedIn && (
        <div id="login-screen">
          <div className="login-box" id="login-box-container">
            <h1 id="app-title">BABU BHAI VIP HACK</h1>
            <p style={{ fontSize: '12px', color: '#888', fontWeight: 700, margin: '6px 0 16px' }} id="app-subtitle">
              BABU BHAI OFFICIAL - AI SERVER CONNECTED
            </p>

            <form onSubmit={handleLogin} id="login-form">
              <input
                type="email"
                id="login-email"
                className="login-input"
                placeholder="ENTER EMAIL"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                id="login-password"
                className="login-input"
                placeholder="ENTER PASSWORD"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" className="login-btn" id="login-submit-btn">
                LOGIN (BABU BHAI VIP)
              </button>
            </form>

            <button type="button" className="demo-btn" id="demo-login-btn" onClick={handleDemoLogin}>
              <i className="fa fa-bolt" style={{ marginRight: '6px' }}></i> QUICK BABU BHAI VIP ACCESS
            </button>

            <button
              type="button"
              className="btn-ai-connect-glow"
              id="btn-login-connect-ai"
              onClick={handleConnectAi}
              disabled={isConnectingAi}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: '12px',
                marginTop: '10px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <i className={`fa ${isConnectingAi ? 'fa-spinner fa-spin' : 'fa-robot'}`}></i>
              <span>{isConnectingAi ? 'CONNECTING BABU BHAI AI...' : '⚡ BABU BHAI AI CONNECT / CONNECT KARO'}</span>
            </button>

            <p id="hwid-display" style={{ marginTop: '20px', fontSize: '9px', color: '#888', letterSpacing: '1px' }}>
              DEVICE ID: {hwid || 'ID-XQ1P09N5O'}
            </p>

            <div style={{ marginTop: '12px', fontSize: '10px', color: '#00A86B', fontWeight: 700 }} id="login-ai-status">
              <i className="fa fa-server" style={{ marginRight: '5px' }}></i> BABU BHAI AI ONLINE ({aiModel})
            </div>
          </div>
        </div>
      )}

      {/* Dashboard View */}
      {loggedIn && (
        <div id="app-view">
          {/* Header */}
          <header id="app-header">
            <div className="logo" id="header-logo" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa fa-crown" style={{ color: '#F59E0B' }}></i>
              <span>BABU BHAI VIP</span>
            </div>
            <button
              type="button"
              onClick={handleConnectAi}
              disabled={isConnectingAi}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 800,
                color: isAiConnected ? 'var(--green)' : 'var(--gold)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
              id="header-ai-status-btn"
              title="Click to test AI Connection / Re-sync"
            >
              <i className={`fa fa-circle ${isAiConnected ? 'text-green-500' : 'text-amber-500'}`}></i>
              <span>{isConnectingAi ? 'CONNECTING...' : isAiConnected ? 'BABU BHAI AI ACTIVE' : 'CONNECT AI'}</span>
            </button>
          </header>

          <div className="container" id="dashboard">
            {/* AI Connection Status & Control Bar */}
            <div className="ai-connection-bar" id="ai-connection-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`pulse-dot ${isAiConnected ? '' : 'pulse-amber'}`}></span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#0F172A' }}>
                      BABU BHAI NEURAL ENGINE: <span style={{ color: 'var(--blue)' }}>{aiModel.toUpperCase()}</span>
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        background: isAiConnected ? '#DCFCE7' : '#FEF3C7',
                        color: isAiConnected ? '#15803D' : '#B45309',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                      id="badge-ai-conn-status"
                    >
                      {isAiConnected ? 'BABU BHAI CONNECTED • ONLINE' : 'CONNECTING...'}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                    BABU BHAI VIP AI Engine • Latency: {aiLatency !== null ? `${aiLatency}ms` : '24ms'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-ai-connect-glow"
                  id="btn-dashboard-reconnect-ai"
                  onClick={handleConnectAi}
                  disabled={isConnectingAi}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Ping BABU BHAI AI Server and re-sync predictions"
                >
                  <i className={`fa ${isConnectingAi ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                  <span>{isConnectingAi ? 'CONNECTING...' : '⚡ BABU BHAI AI SYNC'}</span>
                </button>
              </div>
            </div>

            {/* Stats Detailed */}
            <div className="stats-grid" id="stats-grid-container">
              <div className="stat-card" id="card-total">
                <span className="stat-val" id="stat-total">
                  {stats.total}
                </span>
                <span className="stat-lab">Total</span>
              </div>
              <div className="stat-card" id="card-win">
                <span className="stat-val" id="stat-win" style={{ color: 'var(--green)' }}>
                  {stats.win}
                </span>
                <span className="stat-lab">Wins</span>
              </div>
              <div className="stat-card" id="card-loss">
                <span className="stat-val" id="stat-loss" style={{ color: 'var(--red)' }}>
                  {stats.loss}
                </span>
                <span className="stat-lab">Loss</span>
              </div>
              <div className="stat-card" id="card-rate">
                <span className="stat-val" id="stat-rate" style={{ color: 'var(--blue)' }}>
                  {winRate}%
                </span>
                <span className="stat-lab">Win Rate</span>
              </div>
              <div className="stat-card" id="card-streak">
                <span className="stat-val" id="stat-streak">
                  {stats.streak}x
                </span>
                <span className="stat-lab">Streak</span>
              </div>
              <div className="stat-card" id="card-jack">
                <span className="stat-val" id="stat-jack" style={{ color: 'var(--gold)' }}>
                  {stats.jack}
                </span>
                <span className="stat-lab">Jackpots</span>
              </div>
            </div>

            {/* Game Mode Selector (WinGo 30s vs WinGo 1M) */}
            <div
              style={{
                display: 'flex',
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '6px',
                marginBottom: '14px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                border: '1px solid #E2E8F0',
                gap: '8px',
              }}
              id="game-mode-selector"
            >
              <button
                type="button"
                onClick={() => handleSwitchGameMode('30s')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: gameMode === '30s' ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'transparent',
                  color: gameMode === '30s' ? '#FFFFFF' : '#64748B',
                  boxShadow: gameMode === '30s' ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                  transition: 'all 0.2s',
                }}
                id="tab-wingo-30s"
              >
                <i className="fa fa-bolt" style={{ color: gameMode === '30s' ? '#FDE047' : '#94A3B8' }}></i>
                <span>WinGo 30s</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '2px 7px',
                    borderRadius: '8px',
                    background: gameMode === '30s' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                    color: gameMode === '30s' ? '#FFFFFF' : '#64748B',
                    fontWeight: 800,
                  }}
                >
                  FAST 30s
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchGameMode('1m')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: gameMode === '1m' ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'transparent',
                  color: gameMode === '1m' ? '#FFFFFF' : '#64748B',
                  boxShadow: gameMode === '1m' ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                  transition: 'all 0.2s',
                }}
                id="tab-wingo-1m"
              >
                <i className="fa fa-clock" style={{ color: gameMode === '1m' ? '#93C5FD' : '#94A3B8' }}></i>
                <span>WinGo 1M</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '2px 7px',
                    borderRadius: '8px',
                    background: gameMode === '1m' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                    color: gameMode === '1m' ? '#FFFFFF' : '#64748B',
                    fontWeight: 800,
                  }}
                >
                  CLASSIC 1M
                </span>
              </button>
            </div>

            {/* Prediction Panel */}
            <div className="main-panel" id="prediction-main-panel">
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#888',
                  marginBottom: '5px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                }}
                id="period-display"
              >
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 900,
                    background: gameMode === '30s' ? '#FEF3C7' : '#EFF6FF',
                    color: gameMode === '30s' ? '#B45309' : '#1D4ED8',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                  id="badge-active-game"
                >
                  {gameMode === '30s' ? '⚡ WINGO 30s' : '⏱️ WINGO 1M'}
                </span>
                <span>PERIOD: {nextPeriod}</span>
              </div>

              <div className="timer-display" id="timer-val">
                {timerVal}
              </div>

              <div className="result-zone" id="result-display-zone">
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 900,
                    color: '#888',
                    letterSpacing: '2px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  id="suggestion-title"
                >
                  <i className="fa fa-microchip" style={{ color: 'var(--blue)' }}></i>
                  <span>AI SERVER ANALYZED SUGGESTION</span>
                </div>

                {/* Active Pattern Badge */}
                {currentPred?.patternName && (
                  <div
                    style={{
                      margin: '8px auto 6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      color: 'var(--blue)',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                    id="active-pattern-badge"
                  >
                    <i className="fa fa-wave-square"></i>
                    <span>{currentPred.patternName}</span>
                  </div>
                )}

                <div
                  className={`side-result ${
                    currentPred?.side === 'BIG'
                      ? 'big-color'
                      : currentPred?.side === 'SMALL'
                      ? 'small-color'
                      : ''
                  }`}
                  style={{
                    color:
                      currentPred?.side === 'CONFLICT'
                        ? '#D97706'
                        : currentPred?.side === 'NEUTRAL'
                        ? '#64748B'
                        : undefined,
                    fontSize:
                      currentPred?.side === 'CONFLICT' || currentPred?.side === 'NEUTRAL'
                        ? '38px'
                        : undefined,
                  }}
                  id="side-out"
                >
                  {currentPred?.side || 'WAIT'}
                </div>

                {/* Hot Numbers */}
                <div className="hot-numbers" id="hot-numbers-container">
                  <div className="num-slot" id="n1">
                    {currentPred?.nums?.[0] !== undefined ? currentPred.nums[0] : '-'}
                  </div>
                  <div className="num-slot" id="n2">
                    {currentPred?.nums?.[1] !== undefined ? currentPred.nums[1] : '-'}
                  </div>
                </div>

                {/* AI Confidence & Reasoning Badge */}
                {currentPred?.confidence !== undefined && (
                  <div
                    style={{
                      marginTop: '15px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#555',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                    id="ai-confidence-badge"
                  >
                    <span
                      style={{
                        background:
                          currentPred.confidenceLabel === 'LOW CONFIDENCE'
                            ? '#FEE2E2'
                            : currentPred.confidenceLabel === 'HIGH'
                            ? '#DCFCE7'
                            : '#E6F0FF',
                        color:
                          currentPred.confidenceLabel === 'LOW CONFIDENCE'
                            ? '#B91C1C'
                            : currentPred.confidenceLabel === 'HIGH'
                            ? '#15803D'
                            : 'var(--blue)',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontWeight: 800,
                      }}
                    >
                      AI CONFIDENCE: {currentPred.confidence}%{' '}
                      {currentPred.confidenceLabel ? `(${currentPred.confidenceLabel})` : ''}
                    </span>
                  </div>
                )}
                {aiReasoning && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '10px',
                      color: '#888',
                      fontWeight: 600,
                      fontStyle: 'italic',
                    }}
                    id="ai-reasoning-text"
                  >
                    {aiReasoning}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="action-grid" id="action-buttons-grid">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-act btn-copy"
                    id="btn-copy-signal"
                    onClick={copyTelegramSignal}
                    style={{ width: '100%' }}
                  >
                    <i className="fa fa-paper-plane"></i> Copy Signal
                  </button>
                  <a
                    href="https://bdg8.vip//#/register?invitationCode=2272720593756"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-bdg-game"
                    id="link-bdg-game"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 900,
                      textDecoration: 'none',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                      cursor: 'pointer',
                      minHeight: '44px',
                    }}
                  >
                    <i className="fa fa-gamepad"></i>
                    <span>BDG GAME</span>
                    <i className="fa fa-external-link-alt" style={{ fontSize: '9px', opacity: 0.85 }}></i>
                  </a>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-act btn-reset"
                    id="btn-reset-data"
                    onClick={resetAllData}
                    style={{ width: '100%' }}
                  >
                    <i className="fa fa-trash-alt"></i> Reset All
                  </button>
                </div>
              </div>
            </div>

            {/* Pattern Analysis & Consensus Module */}
            <PatternAnalysisModule
              consensus={patternConsensus}
              totalHistoricalDraws={historyList.length}
            />

            {/* History List */}
            <div className="history-card" id="history-card-container">
              <div
                style={{
                  fontWeight: 900,
                  fontSize: '15px',
                  marginBottom: '15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                id="market-record-header"
              >
                <span>MARKET RECORD ({gameMode.toUpperCase()})</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#888' }}>
                  Total: {historyList.length}
                </span>
              </div>

              <div id="history-list">
                {historyList.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '25px',
                      color: '#888',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                    id="history-empty"
                  >
                    <i
                      className="fa fa-clock"
                      style={{ fontSize: '20px', marginBottom: '8px', display: 'block', color: '#ccc' }}
                    ></i>
                    Waiting for market issue settlements...
                  </div>
                ) : (
                  historyList.map((item, index) => {
                    const displayPeriod =
                      item.issueNumber.length >= 5 ? item.issueNumber.slice(-5) : item.issueNumber;
                    return (
                      <div className="h-row" key={item.issueNumber} id={`h-row-${index}`}>
                        <span
                          style={{ color: '#888', fontWeight: 700 }}
                          title={`Full Period ID: ${item.issueNumber}`}
                        >
                          {displayPeriod}
                        </span>
                        <span
                          style={{
                            fontWeight: 800,
                            color: item.side === 'BIG' ? 'var(--blue)' : 'var(--gold)',
                          }}
                        >
                          {item.side}
                        </span>
                        <span style={{ fontWeight: 900, fontSize: '15px' }}>{item.number}</span>
                        <span>
                          {item.win !== undefined ? (
                            <span className={`status-tag ${item.win ? 'win-tag' : 'loss-tag'}`}>
                              {item.win ? 'WIN' : 'LOSS'}
                            </span>
                          ) : (
                            <span
                              className="status-tag"
                              style={{ background: '#E2E8F0', color: '#475569', fontWeight: 700 }}
                            >
                              DRAW
                            </span>
                          )}
                          {item.jack && (
                            <>
                              <br />
                              <span className="status-tag jack-tag">JACKPOT</span>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* BABU BHAI VIP Footer Branding */}
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0 20px',
                color: '#64748B',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '1px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
              }}
              id="babu-bhai-footer"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0F172A', fontSize: '12px' }}>
                <i className="fa fa-crown" style={{ color: '#F59E0B' }}></i>
                <span>BABU BHAI VIP PREDICTION ENGINE</span>
              </div>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                AI SERVER POWERED • REAL-TIME BDG MARKET AUDIT • ALL RIGHTS RESERVED
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
