/**
 * Pattern Analysis, Consensus Engine, and Historical Backtesting Module
 * Analyzes ONLY completed historical results from real draw history.
 * No hardcoded results, no fake results, no future peeking.
 */

export type PatternSignal = 'BIG' | 'SMALL' | 'NEUTRAL';
export type ConsensusSignal = 'BIG' | 'SMALL' | 'CONFLICT' | 'NEUTRAL';

export interface HistoricalIssue {
  issueNumber: string;
  number: number;
  side: 'BIG' | 'SMALL';
  colour?: string;
}

export interface DetectorResult {
  id: string;
  name: string;
  active: boolean;
  signal: PatternSignal;
  confidence: number;
  description: string;
  evidence: string;
}

export interface PatternBacktestResult {
  patternId: string;
  patternName: string;
  signals: number;
  wins: number;
  losses: number;
  accuracy: number; // percentage 0-100
  sampleSize: number;
}

export interface PatternConsensus {
  signal: ConsensusSignal;
  confidence: number;
  confidenceLabel: 'LOW CONFIDENCE' | 'MODERATE' | 'HIGH';
  activePatterns: DetectorResult[];
  supportingPatterns: DetectorResult[];
  conflictingPatterns: DetectorResult[];
  neutralPatterns: DetectorResult[];
  sampleSize: number;
  summary: string;
  hotNumbers: [number, number];
  detectors: DetectorResult[];
  backtestResults: PatternBacktestResult[];
}

// ----------------------------------------------------------------------
// 1. Dragon / 8-run Detector
// ----------------------------------------------------------------------
export function detectDragon(history: HistoricalIssue[]): DetectorResult {
  const id = 'dragon';
  const name = 'Dragon / 8-run';

  if (history.length < 4) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for Dragon detection (minimum 4 rounds needed).',
      evidence: `Sample size: ${history.length} rounds`,
    };
  }

  const currentSide = history[0].side;
  let streak = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].side === currentSide) {
      streak++;
    } else {
      break;
    }
  }

  if (streak >= 4) {
    const isEightRun = streak >= 8;
    const confidence = isEightRun ? 84 : Math.min(80, 60 + (streak - 3) * 4);
    return {
      id,
      name,
      active: true,
      signal: currentSide,
      confidence,
      description: isEightRun
        ? `Major 8-Run Dragon detected (${streak} consecutive ${currentSide}). Strong trend continuation bias.`
        : `Active Dragon streak (${streak} consecutive ${currentSide}). Momentum favors continuation.`,
      evidence: `${streak}x consecutive ${currentSide} in latest completed history`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 40,
    description: `No active dragon streak (current streak is ${streak}x ${currentSide}, threshold is 4x).`,
    evidence: `Latest run: ${streak}x ${currentSide}`,
  };
}

// ----------------------------------------------------------------------
// 2. Alternating B-S-B-S Detector
// ----------------------------------------------------------------------
export function detectAlternating(history: HistoricalIssue[]): DetectorResult {
  const id = 'alternating';
  const name = 'Alternating B-S-B-S';

  if (history.length < 3) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for alternation detection.',
      evidence: `Sample size: ${history.length} rounds`,
    };
  }

  let altSteps = 0;
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].side !== history[i + 1].side) {
      altSteps++;
    } else {
      break;
    }
  }

  // An alternation length of at least 3 rounds (2 alternating steps)
  if (altSteps >= 2) {
    const sequenceLength = altSteps + 1;
    const nextSide: PatternSignal = history[0].side === 'BIG' ? 'SMALL' : 'BIG';
    const confidence = Math.min(82, 58 + (altSteps - 2) * 7);
    return {
      id,
      name,
      active: true,
      signal: nextSide,
      confidence,
      description: `Active ${sequenceLength}-round B-S-B-S alternating chain. Signal expects opposite side (${nextSide}).`,
      evidence: `${sequenceLength} completed alternating rounds (latest: ${history[0].side})`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 40,
    description: 'No active alternating chain detected in latest settled rounds.',
    evidence: `No alternating pattern at round ${history[0].issueNumber.slice(-5)}`,
  };
}

// ----------------------------------------------------------------------
// 3. Block B-B-S-S / S-S-B-B Detector
// ----------------------------------------------------------------------
export function detectBlock(history: HistoricalIssue[]): DetectorResult {
  const id = 'block';
  const name = 'Block B-B-S-S / S-S-B-B';

  if (history.length < 4) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for Block detection (minimum 4 rounds needed).',
      evidence: `Sample size: ${history.length} rounds`,
    };
  }

  const s0 = history[0].side;
  const s1 = history[1].side;
  const s2 = history[2].side;
  const s3 = history[3].side;

  // Case A: 1 item into a new 2-block after a completed 2-block:
  // e.g. history: [B, S, S, B, B] -> H0=B, H1=S, H2=S. Needs another B to form BB-SS-BB block.
  if (s0 !== s1 && s1 === s2 && (history.length < 5 || (s2 !== s3 && history[4]?.side === s3))) {
    return {
      id,
      name,
      active: true,
      signal: s0,
      confidence: 72,
      description: `Block continuation: Single ${s0} following a confirmed 2-block of ${s1}. Second ${s0} expected to complete block.`,
      evidence: `Pattern sequence: [${s2}, ${s1}] -> [${s0}]`,
    };
  }

  // Case B: Exactly completed a 2-block following an opposite 2-block:
  // e.g. history: [B, B, S, S] -> H0=B, H1=B, H2=S, H3=S. Switch expected to start next block.
  if (s0 === s1 && s1 !== s2 && s2 === s3) {
    const nextSide: PatternSignal = s0 === 'BIG' ? 'SMALL' : 'BIG';
    return {
      id,
      name,
      active: true,
      signal: nextSide,
      confidence: 74,
      description: `Block transition: Completed 2x${s0} following 2x${s2}. Transition expected to start opposite block (${nextSide}).`,
      evidence: `Symmetrical 2-2 block: 2x${s2} then 2x${s0}`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 40,
    description: 'No active symmetrical 2-2 block pattern detected.',
    evidence: `Latest sequence: [${s3}, ${s2}, ${s1}, ${s0}]`,
  };
}

// ----------------------------------------------------------------------
// 4. Streak Momentum Detector
// ----------------------------------------------------------------------
export function detectStreak(history: HistoricalIssue[]): DetectorResult {
  const id = 'streak';
  const name = 'Streak Momentum';

  if (history.length < 2) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for streak momentum.',
      evidence: `Sample size: ${history.length}`,
    };
  }

  const currentSide = history[0].side;
  let streak = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].side === currentSide) {
      streak++;
    } else {
      break;
    }
  }

  // Analyze momentum at 2x or 3x
  if (streak === 2 || streak === 3) {
    return {
      id,
      name,
      active: true,
      signal: currentSide,
      confidence: streak === 2 ? 64 : 70,
      description: `${streak}x ${currentSide} momentum detected. Continuation favored by short-term momentum.`,
      evidence: `${streak} consecutive ${currentSide} draws`,
    };
  } else if (streak >= 4) {
    // Aligns with dragon
    return {
      id,
      name,
      active: true,
      signal: currentSide,
      confidence: Math.min(82, 70 + streak * 2),
      description: `Extended ${streak}x ${currentSide} streak momentum active.`,
      evidence: `${streak} consecutive ${currentSide} draws`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 45,
    description: `Single round result (${currentSide}). No active streak momentum established.`,
    evidence: `Current run length: 1`,
  };
}

// ----------------------------------------------------------------------
// 5. Frequency Distribution Detector
// ----------------------------------------------------------------------
export function detectFrequency(history: HistoricalIssue[]): DetectorResult {
  const id = 'frequency';
  const name = 'Frequency Distribution';

  if (history.length < 5) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for frequency analysis.',
      evidence: `Sample size: ${history.length}`,
    };
  }

  // Analyze recent window (up to 15 completed rounds)
  const windowSlice = history.slice(0, Math.min(15, history.length));
  const bigCount = windowSlice.filter((h) => h.side === 'BIG').length;
  const smallCount = windowSlice.length - bigCount;
  const bigRatio = bigCount / windowSlice.length;

  if (bigRatio >= 0.67) {
    // Heavy Big skew -> Mean-reversion pressure towards Small
    const confidence = Math.min(78, Math.round(52 + bigRatio * 30));
    return {
      id,
      name,
      active: true,
      signal: 'SMALL',
      confidence,
      description: `Frequency skew: BIG appeared in ${bigCount}/${windowSlice.length} (${Math.round(
        bigRatio * 100
      )}%) rounds. Statistical mean-reversion pressure favors SMALL.`,
      evidence: `${bigCount} BIG vs ${smallCount} SMALL in last ${windowSlice.length} rounds`,
    };
  } else if (bigRatio <= 0.33) {
    // Heavy Small skew -> Mean-reversion pressure towards Big
    const smallRatio = smallCount / windowSlice.length;
    const confidence = Math.min(78, Math.round(52 + smallRatio * 30));
    return {
      id,
      name,
      active: true,
      signal: 'BIG',
      confidence,
      description: `Frequency skew: SMALL appeared in ${smallCount}/${windowSlice.length} (${Math.round(
        smallRatio * 100
      )}%) rounds. Statistical mean-reversion pressure favors BIG.`,
      evidence: `${smallCount} SMALL vs ${bigCount} BIG in last ${windowSlice.length} rounds`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 45,
    description: `Balanced distribution across completed window (${bigCount} BIG / ${smallCount} SMALL). No statistical frequency skew.`,
    evidence: `${Math.round(bigRatio * 100)}% BIG / ${Math.round((1 - bigRatio) * 100)}% SMALL`,
  };
}

// ----------------------------------------------------------------------
// 6. Ping-Pong Oscillation Detector
// ----------------------------------------------------------------------
export function detectPingPong(history: HistoricalIssue[]): DetectorResult {
  const id = 'pingpong';
  const name = 'Ping-Pong Oscillation';

  if (history.length < 4) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for Ping-Pong analysis.',
      evidence: `Sample size: ${history.length}`,
    };
  }

  const windowSlice = history.slice(0, Math.min(8, history.length));
  let flips = 0;
  for (let i = 0; i < windowSlice.length - 1; i++) {
    if (windowSlice[i].side !== windowSlice[i + 1].side) {
      flips++;
    }
  }

  const flipRate = flips / (windowSlice.length - 1);

  if (flipRate >= 0.7) {
    const nextSide: PatternSignal = history[0].side === 'BIG' ? 'SMALL' : 'BIG';
    const confidence = Math.min(80, Math.round(55 + flipRate * 28));
    return {
      id,
      name,
      active: true,
      signal: nextSide,
      confidence,
      description: `High oscillation volatility: ${flips}/${windowSlice.length - 1} (${Math.round(
        flipRate * 100
      )}%) recent rounds flipped. Favors continuing 1-1 flip to ${nextSide}.`,
      evidence: `${Math.round(flipRate * 100)}% flip rate across last ${windowSlice.length} completed rounds`,
    };
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 40,
    description: `Low oscillation volatility (${Math.round(flipRate * 100)}% flip rate). Ping-Pong inactive.`,
    evidence: `${flips} flips in last ${windowSlice.length} draws`,
  };
}

// ----------------------------------------------------------------------
// 7. Number Analysis Detector
// ----------------------------------------------------------------------
export function detectNumberAnalysis(history: HistoricalIssue[]): DetectorResult {
  const id = 'number';
  const name = 'Number Analysis';

  if (history.length < 3) {
    return {
      id,
      name,
      active: false,
      signal: 'NEUTRAL',
      confidence: 45,
      description: 'Insufficient completed history for number analysis.',
      evidence: `Sample size: ${history.length}`,
    };
  }

  const lastNum = Number(history[0].number);
  // Transition analysis: look for completed occurrences of lastNum in history
  const transitions: number[] = [];
  for (let i = 1; i < history.length; i++) {
    if (Number(history[i].number) === lastNum && i > 0) {
      transitions.push(Number(history[i - 1].number));
    }
  }

  // Parity analysis: even vs odd
  const recentEven = history.slice(0, 8).filter((h) => Number(h.number) % 2 === 0).length;
  const recentOdd = Math.min(8, history.length) - recentEven;

  if (transitions.length >= 2) {
    const bigTransitions = transitions.filter((n) => n >= 5).length;
    const smallTransitions = transitions.length - bigTransitions;
    const bigProb = bigTransitions / transitions.length;

    if (bigProb >= 0.65) {
      return {
        id,
        name,
        active: true,
        signal: 'BIG',
        confidence: Math.round(55 + bigProb * 25),
        description: `Historical digit transition: After digit ${lastNum}, historical draws produced BIG in ${bigTransitions}/${transitions.length} (${Math.round(
          bigProb * 100
        )}%) occurrences.`,
        evidence: `Digit ${lastNum} conditional transition bias: ${bigTransitions} BIG / ${smallTransitions} SMALL`,
      };
    } else if (bigProb <= 0.35) {
      return {
        id,
        name,
        active: true,
        signal: 'SMALL',
        confidence: Math.round(55 + (1 - bigProb) * 25),
        description: `Historical digit transition: After digit ${lastNum}, historical draws produced SMALL in ${smallTransitions}/${transitions.length} (${Math.round(
          (1 - bigProb) * 100
        )}%) occurrences.`,
        evidence: `Digit ${lastNum} conditional transition bias: ${smallTransitions} SMALL / ${bigTransitions} BIG`,
      };
    }
  }

  // Step difference analysis (momentum of digit distance)
  if (history.length >= 2) {
    const prevNum = Number(history[1].number);
    const stepDiff = lastNum - prevNum;
    if (Math.abs(stepDiff) >= 4) {
      const returnSide: PatternSignal = lastNum >= 5 ? 'SMALL' : 'BIG';
      return {
        id,
        name,
        active: true,
        signal: returnSide,
        confidence: 62,
        description: `Extreme numerical leap (${prevNum} -> ${lastNum}, step ${stepDiff > 0 ? '+' : ''}${stepDiff}). Historical mean reversion favors return to ${returnSide}.`,
        evidence: `Digit leap: ${prevNum} to ${lastNum} (gap of ${Math.abs(stepDiff)})`,
      };
    }
  }

  return {
    id,
    name,
    active: false,
    signal: 'NEUTRAL',
    confidence: 45,
    description: `Digit ${lastNum} shows no significant historical transition asymmetry. Parity: ${recentEven} Even / ${recentOdd} Odd.`,
    evidence: `Last digit: ${lastNum}, historical matches: ${transitions.length}`,
  };
}

// ----------------------------------------------------------------------
// Dynamic Hot Numbers Generator based on Completed History
// ----------------------------------------------------------------------
export function calculateHotNumbers(
  targetSide: 'BIG' | 'SMALL' | 'NEUTRAL',
  history: HistoricalIssue[]
): [number, number] {
  const side = targetSide === 'SMALL' ? 'SMALL' : 'BIG';
  const candidates = side === 'BIG' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];

  if (history.length === 0) {
    return side === 'BIG' ? [7, 8] : [2, 3];
  }

  const lastNum = Number(history[0].number);
  const freqMap: Record<number, number> = {};
  candidates.forEach((c) => (freqMap[c] = 0));

  history.slice(0, 20).forEach((item) => {
    const num = Number(item.number);
    if (!isNaN(num) && freqMap[num] !== undefined) {
      freqMap[num]++;
    }
  });

  const scores = candidates.map((num) => {
    let score = (freqMap[num] || 0) * 15;
    // Conditional step proximity
    const diff = Math.abs(num - lastNum);
    if (diff === 1 || diff === 2) score += 25;
    if (diff === 0) score += 10;
    // Parity alternation score
    if ((num % 2) !== (lastNum % 2)) score += 12;
    return { num, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return [scores[0].num, scores[1].num];
}

// ----------------------------------------------------------------------
// Pattern Backtesting Engine
// Evaluates each detector strictly across completed historical rounds
// ----------------------------------------------------------------------
export function backtestPatterns(
  history: HistoricalIssue[],
  minLookback = 4
): PatternBacktestResult[] {
  const detectorsList = [
    { id: 'dragon', name: 'Dragon / 8-run', fn: detectDragon },
    { id: 'alternating', name: 'Alternating B-S-B-S', fn: detectAlternating },
    { id: 'block', name: 'Block B-B-S-S / S-S-B-B', fn: detectBlock },
    { id: 'streak', name: 'Streak Momentum', fn: detectStreak },
    { id: 'frequency', name: 'Frequency Distribution', fn: detectFrequency },
    { id: 'pingpong', name: 'Ping-Pong Oscillation', fn: detectPingPong },
    { id: 'number', name: 'Number Analysis', fn: detectNumberAnalysis },
  ];

  const results: PatternBacktestResult[] = detectorsList.map((d) => ({
    patternId: d.id,
    patternName: d.name,
    signals: 0,
    wins: 0,
    losses: 0,
    accuracy: 0,
    sampleSize: 0,
  }));

  if (history.length <= minLookback) {
    return results;
  }

  // Walk through history from oldest valid point down to the round just completed
  // i represents the index in history. history.slice(i) is past data known before round i - 1.
  // The actual outcome at round i - 1 is history[i - 1].side.
  const maxEval = Math.min(history.length - 1, 40);

  for (let i = maxEval; i >= 1; i--) {
    const historicalContext = history.slice(i);
    if (historicalContext.length < minLookback) continue;

    const actualOutcome = history[i - 1].side;

    detectorsList.forEach((d, idx) => {
      results[idx].sampleSize++;
      const detection = d.fn(historicalContext);
      if (detection.active && detection.signal !== 'NEUTRAL') {
        results[idx].signals++;
        if (detection.signal === actualOutcome) {
          results[idx].wins++;
        } else {
          results[idx].losses++;
        }
      }
    });
  }

  // Calculate final accuracy percentages
  results.forEach((res) => {
    res.accuracy = res.signals > 0 ? Math.round((res.wins / res.signals) * 100) : 0;
  });

  return results;
}

// ----------------------------------------------------------------------
// Pattern Consensus Engine
// Combines detector outputs, checks for conflicts and low confidence
// ----------------------------------------------------------------------
export function runPatternConsensus(history: HistoricalIssue[]): PatternConsensus {
  // Run all 7 detectors strictly on the completed history
  const detectors: DetectorResult[] = [
    detectDragon(history),
    detectAlternating(history),
    detectBlock(history),
    detectStreak(history),
    detectFrequency(history),
    detectPingPong(history),
    detectNumberAnalysis(history),
  ];

  const activePatterns = detectors.filter((d) => d.active && d.signal !== 'NEUTRAL');
  const neutralPatterns = detectors.filter((d) => !d.active || d.signal === 'NEUTRAL');

  const bigVotes = activePatterns.filter((d) => d.signal === 'BIG');
  const smallVotes = activePatterns.filter((d) => d.signal === 'SMALL');

  let consensusSignal: ConsensusSignal = 'NEUTRAL';
  let confidence = 45;
  let confidenceLabel: 'LOW CONFIDENCE' | 'MODERATE' | 'HIGH' = 'LOW CONFIDENCE';
  let supportingPatterns: DetectorResult[] = [];
  let conflictingPatterns: DetectorResult[] = [];
  let summary = '';

  const sampleSize = history.length;

  // Case 1: Weak evidence due to tiny historical sample
  if (sampleSize < 4) {
    consensusSignal = 'NEUTRAL';
    confidence = 35;
    confidenceLabel = 'LOW CONFIDENCE';
    summary = `Insufficient completed draw records (${sampleSize} draws). Waiting for more rounds.`;
  }
  // Case 2: Both BIG and SMALL active signals detected -> Check for conflict
  else if (bigVotes.length > 0 && smallVotes.length > 0) {
    const bigWeight = bigVotes.reduce((sum, v) => sum + v.confidence, 0);
    const smallWeight = smallVotes.reduce((sum, v) => sum + v.confidence, 0);
    const diff = Math.abs(bigWeight - smallWeight);

    // If active counts are balanced or difference is marginal -> Direct CONFLICT!
    if (bigVotes.length === smallVotes.length || diff < 35) {
      consensusSignal = 'CONFLICT';
      confidence = Math.max(35, Math.min(52, Math.round(diff / 2)));
      confidenceLabel = 'LOW CONFIDENCE';
      conflictingPatterns = [...bigVotes, ...smallVotes];
      supportingPatterns = [];
      summary = `Active pattern conflict: ${bigVotes.map((b) => b.name).join(', ')} (BIG) vs ${smallVotes
        .map((s) => s.name)
        .join(', ')} (SMALL). Market in transition.`;
    } else if (bigWeight > smallWeight) {
      consensusSignal = 'BIG';
      confidence = Math.max(48, Math.min(76, Math.round(bigWeight / bigVotes.length - 12))); // Conflict penalty
      confidenceLabel = confidence < 58 ? 'LOW CONFIDENCE' : 'MODERATE';
      supportingPatterns = bigVotes;
      conflictingPatterns = smallVotes;
      summary = `Consensus leans BIG (${bigVotes.length} patterns) with counter-signal from ${smallVotes
        .map((s) => s.name)
        .join(', ')}.`;
    } else {
      consensusSignal = 'SMALL';
      confidence = Math.max(48, Math.min(76, Math.round(smallWeight / smallVotes.length - 12))); // Conflict penalty
      confidenceLabel = confidence < 58 ? 'LOW CONFIDENCE' : 'MODERATE';
      supportingPatterns = smallVotes;
      conflictingPatterns = bigVotes;
      summary = `Consensus leans SMALL (${smallVotes.length} patterns) with counter-signal from ${bigVotes
        .map((b) => b.name)
        .join(', ')}.`;
    }
  }
  // Case 3: Only BIG votes
  else if (bigVotes.length > 0) {
    consensusSignal = 'BIG';
    const avgConf = Math.round(bigVotes.reduce((sum, v) => sum + v.confidence, 0) / bigVotes.length);
    // Scale confidence up with multiple supporting patterns, capped realistically
    confidence = Math.min(86, avgConf + (bigVotes.length > 1 ? (bigVotes.length - 1) * 3 : 0));
    confidenceLabel = confidence >= 72 ? 'HIGH' : confidence >= 58 ? 'MODERATE' : 'LOW CONFIDENCE';
    supportingPatterns = bigVotes;
    conflictingPatterns = [];
    summary = `Harmonic agreement for BIG across ${bigVotes.length} active detector${
      bigVotes.length > 1 ? 's' : ''
    } (${bigVotes.map((b) => b.name).join(', ')}).`;
  }
  // Case 4: Only SMALL votes
  else if (smallVotes.length > 0) {
    consensusSignal = 'SMALL';
    const avgConf = Math.round(smallVotes.reduce((sum, v) => sum + v.confidence, 0) / smallVotes.length);
    confidence = Math.min(86, avgConf + (smallVotes.length > 1 ? (smallVotes.length - 1) * 3 : 0));
    confidenceLabel = confidence >= 72 ? 'HIGH' : confidence >= 58 ? 'MODERATE' : 'LOW CONFIDENCE';
    supportingPatterns = smallVotes;
    conflictingPatterns = [];
    summary = `Harmonic agreement for SMALL across ${smallVotes.length} active detector${
      smallVotes.length > 1 ? 's' : ''
    } (${smallVotes.map((s) => s.name).join(', ')}).`;
  }
  // Case 5: No active patterns
  else {
    consensusSignal = 'NEUTRAL';
    confidence = 45;
    confidenceLabel = 'LOW CONFIDENCE';
    supportingPatterns = [];
    conflictingPatterns = [];
    summary = 'No decisive pattern active across completed draws. Neutral state.';
  }

  const hotNumbers = calculateHotNumbers(
    consensusSignal === 'CONFLICT' ? 'NEUTRAL' : consensusSignal,
    history
  );

  const backtestResults = backtestPatterns(history);

  return {
    signal: consensusSignal,
    confidence,
    confidenceLabel,
    activePatterns,
    supportingPatterns,
    conflictingPatterns,
    neutralPatterns,
    sampleSize,
    summary,
    hotNumbers,
    detectors,
    backtestResults,
  };
}
