import React, { useState } from 'react';
import { PatternConsensus } from '../patternEngine';

interface PatternAnalysisModuleProps {
  consensus: PatternConsensus;
  totalHistoricalDraws: number;
}

export const PatternAnalysisModule: React.FC<PatternAnalysisModuleProps> = ({
  consensus,
  totalHistoricalDraws,
}) => {
  const [activeTab, setActiveTab] = useState<'consensus' | 'detectors' | 'backtest'>('consensus');

  const signalClass =
    consensus.signal === 'BIG'
      ? 'signal-big'
      : consensus.signal === 'SMALL'
      ? 'signal-small'
      : consensus.signal === 'CONFLICT'
      ? 'signal-conflict'
      : 'signal-neutral';

  const confBadgeClass =
    consensus.confidenceLabel === 'HIGH'
      ? 'conf-high'
      : consensus.confidenceLabel === 'MODERATE'
      ? 'conf-mod'
      : 'conf-low';

  return (
    <div className="pattern-module-card" id="pattern-analysis-module">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa fa-project-diagram" style={{ color: 'var(--blue)', fontSize: '15px' }}></i>
          <span style={{ fontWeight: 900, fontSize: '14px', letterSpacing: '-0.3px' }}>
            PATTERN ANALYSIS & CONSENSUS
          </span>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            background: '#F1F5F9',
            color: '#475569',
            padding: '3px 8px',
            borderRadius: '12px',
          }}
          title="Analyzes only already completed historical rounds"
        >
          Sample: {totalHistoricalDraws} draws
        </span>
      </div>

      {/* Module Navigation Tabs */}
      <div className="pattern-header-tabs" id="pattern-tabs-container">
        <button
          type="button"
          className={`pattern-tab-btn ${activeTab === 'consensus' ? 'active' : ''}`}
          id="tab-btn-consensus"
          onClick={() => setActiveTab('consensus')}
        >
          <i className="fa fa-microchip"></i> Consensus
        </button>
        <button
          type="button"
          className={`pattern-tab-btn ${activeTab === 'detectors' ? 'active' : ''}`}
          id="tab-btn-detectors"
          onClick={() => setActiveTab('detectors')}
        >
          <i className="fa fa-cubes"></i> 7 Detectors ({consensus.activePatterns.length})
        </button>
        <button
          type="button"
          className={`pattern-tab-btn ${activeTab === 'backtest' ? 'active' : ''}`}
          id="tab-btn-backtest"
          onClick={() => setActiveTab('backtest')}
        >
          <i className="fa fa-chart-line"></i> Backtest
        </button>
      </div>

      {/* TAB 1: Consensus Engine */}
      {activeTab === 'consensus' && (
        <div id="pattern-consensus-tab-content">
          <div className="consensus-banner" id="consensus-summary-banner">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Consensus Signal
                </span>
                <span className={`consensus-signal-badge ${signalClass}`} id="consensus-signal-badge">
                  {consensus.signal === 'CONFLICT' && <i className="fa fa-exclamation-triangle"></i>}
                  {consensus.signal}
                </span>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Consensus Confidence
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 900 }}>{consensus.confidence}%</span>
                  <span className={`conf-pill ${confBadgeClass}`} id="consensus-conf-label">
                    {consensus.confidenceLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Summary description */}
            <div
              style={{
                fontSize: '11px',
                color: '#334155',
                lineHeight: 1.5,
                fontWeight: 600,
                background: '#FFFFFF',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
              }}
              id="consensus-summary-text"
            >
              {consensus.summary}
            </div>
          </div>

          {/* Active Patterns */}
          <div style={{ marginBottom: '14px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                color: '#475569',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              Active Patterns ({consensus.activePatterns.length}):
            </span>
            {consensus.activePatterns.length === 0 ? (
              <div
                style={{
                  fontSize: '11px',
                  color: '#94A3B8',
                  padding: '8px 12px',
                  background: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px dashed #CBD5E1',
                }}
              >
                No active pattern trigger detected in current history.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {consensus.activePatterns.map((pat) => (
                  <span
                    key={pat.id}
                    style={{
                      background: pat.signal === 'BIG' ? '#EBF3FF' : '#FFF8E6',
                      color: pat.signal === 'BIG' ? 'var(--blue)' : '#B37D00',
                      border: `1px solid ${pat.signal === 'BIG' ? '#B9D5FF' : '#FFE082'}`,
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{pat.name}</span>
                    <strong style={{ fontSize: '9px', opacity: 0.85 }}>({pat.signal})</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Supporting Patterns & Conflicting Patterns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 12px',
              }}
              id="supporting-patterns-box"
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  color: '#15803D',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa fa-check-circle"></i> Supporting ({consensus.supportingPatterns.length})
              </div>
              {consensus.supportingPatterns.length === 0 ? (
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>None</span>
              ) : (
                consensus.supportingPatterns.map((p) => (
                  <div
                    key={p.id}
                    style={{ fontSize: '10px', color: '#334155', fontWeight: 600, margin: '2px 0' }}
                  >
                    • {p.name}
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '10px 12px',
              }}
              id="conflicting-patterns-box"
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  color: consensus.conflictingPatterns.length > 0 ? '#B91C1C' : '#64748B',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa fa-times-circle"></i> Conflicting ({consensus.conflictingPatterns.length})
              </div>
              {consensus.conflictingPatterns.length === 0 ? (
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>None (Harmonic)</span>
              ) : (
                consensus.conflictingPatterns.map((p) => (
                  <div
                    key={p.id}
                    style={{ fontSize: '10px', color: '#991B1B', fontWeight: 600, margin: '2px 0' }}
                  >
                    • {p.name} ({p.signal})
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 7 Pattern Detectors Breakdown */}
      {activeTab === 'detectors' && (
        <div id="pattern-detectors-tab-content">
          <div style={{ marginBottom: '10px', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
            Real-time evaluation across 7 quantitative detectors on completed draws:
          </div>

          {consensus.detectors.map((detector, idx) => (
            <div
              key={detector.id}
              className={`detector-item ${detector.active ? 'active-detector' : ''}`}
              id={`detector-row-${detector.id}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      background: detector.active ? '#3B82F6' : '#94A3B8',
                      color: '#FFF',
                      fontSize: '9px',
                      fontWeight: 900,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>
                    {detector.name}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: detector.active ? '#DCFCE7' : '#F1F5F9',
                      color: detector.active ? '#15803D' : '#64748B',
                    }}
                  >
                    {detector.active ? 'ACTIVE' : 'IDLE'}
                  </span>

                  {detector.active && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 900,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: detector.signal === 'BIG' ? '#DBEAFE' : '#FEF3C7',
                        color: detector.signal === 'BIG' ? '#1D4ED8' : '#B45309',
                      }}
                    >
                      {detector.signal} ({detector.confidence}%)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.4, margin: '4px 0' }}>
                {detector.description}
              </div>

              <div
                style={{
                  fontSize: '10px',
                  color: '#64748B',
                  background: '#F1F5F9',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  marginTop: '6px',
                  fontFamily: 'monospace',
                }}
              >
                <strong>Evidence:</strong> {detector.evidence}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Historical Backtesting */}
      {activeTab === 'backtest' && (
        <div id="pattern-backtest-tab-content">
          <div style={{ marginBottom: '10px', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
            Historical walk-forward backtest evaluated strictly on completed past draws:
          </div>

          <div className="backtest-table-wrap">
            <table className="backtest-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Pattern Detector</th>
                  <th>Signals</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Accuracy</th>
                  <th>Sample</th>
                </tr>
              </thead>
              <tbody>
                {consensus.backtestResults.map((bt) => {
                  const accColor =
                    bt.signals === 0
                      ? '#64748B'
                      : bt.accuracy >= 65
                      ? '#16A34A'
                      : bt.accuracy >= 50
                      ? '#2563EB'
                      : '#DC2626';

                  return (
                    <tr key={bt.patternId}>
                      <td style={{ textAlign: 'left', fontWeight: 700, color: '#1E293B' }}>
                        {bt.patternName}
                      </td>
                      <td>{bt.signals}</td>
                      <td style={{ color: '#16A34A' }}>{bt.wins}</td>
                      <td style={{ color: '#DC2626' }}>{bt.losses}</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 800,
                            color: accColor,
                            background: '#F8FAFC',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {bt.signals > 0 ? `${bt.accuracy}%` : 'N/A'}
                        </span>
                      </td>
                      <td style={{ color: '#64748B' }}>{bt.sampleSize}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: '12px',
              fontSize: '10px',
              color: '#94A3B8',
              lineHeight: 1.4,
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            * All backtesting metrics derived strictly from completed historical issues. Indicators are
            probabilistic; no claims of guaranteed returns.
          </div>
        </div>
      )}
    </div>
  );
};
