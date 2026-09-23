/**
 * bridge/metrics.mjs
 *
 * Lightweight latency/throughput instrumentation for the bridge.
 *
 * Design goals:
 *   - Cheap enough for the real-time audio hot path (nanosecond clock + a
 *     fixed-size ring buffer; no string building per chunk).
 *   - Low log volume: per-call aggregates are emitted on an interval and at
 *     call end, not per audio frame. Slow DB queries are warned individually.
 *   - Optional verbose per-chunk logging behind VERBOSE_AUDIO_LOG=1 for deep
 *     debugging / benchmarking only.
 *   - No sensitive data is ever recorded (no phone numbers, transcripts, audio,
 *     or SQL params).
 *
 * Env:
 *   LATENCY_LOG=0              Disable all [perf] logging (default on).
 *   LATENCY_LOG_INTERVAL_MS    Per-call summary interval (default 30000; 0 = off).
 *   VERBOSE_AUDIO_LOG=1        Log every audio chunk (very noisy; default off).
 *   SLOW_DB_MS                 Warn for queries slower than this (default 250).
 *   METRICS_ENABLED=0          Disable the /metrics endpoint (default on).
 *   METRICS_TOKEN              If set, /metrics requires ?token= or x-metrics-token.
 */

export const latencyLogEnabled = process.env.LATENCY_LOG !== '0';
export const verboseAudio = process.env.VERBOSE_AUDIO_LOG === '1';
export const SLOW_DB_MS = Number(process.env.SLOW_DB_MS ?? 250);
export const LATENCY_LOG_INTERVAL_MS = Number(process.env.LATENCY_LOG_INTERVAL_MS ?? 30_000);

/** High-resolution clock (nanoseconds). */
export function hrNow() {
  return process.hrtime.bigint();
}

/** Milliseconds elapsed since a `hrNow()` value. */
export function msSince(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1e6;
}

/** Fixed-size rolling stats with count/avg/min/max/p50/p95. */
export class RollingStat {
  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.buf = new Float64Array(capacity);
    this.filled = 0;
    this.idx = 0;
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = 0;
  }

  record(value) {
    if (!Number.isFinite(value)) return;
    this.count++;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
    this.buf[this.idx] = value;
    this.idx = (this.idx + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  snapshot() {
    if (this.count === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
    }
    const arr = Array.from(this.buf.subarray(0, this.filled)).sort((a, b) => a - b);
    const pick = (p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    return {
      count: this.count,
      avg: Number((this.sum / this.count).toFixed(2)),
      min: Number(this.min.toFixed(2)),
      max: Number(this.max.toFixed(2)),
      p50: Number(pick(0.5).toFixed(2)),
      p95: Number(pick(0.95).toFixed(2)),
    };
  }
}

// ─── Process-wide counters ────────────────────────────────────────────────────
export const processMetrics = {
  startedAt: Date.now(),
  activeCalls: 0,
  totalCalls: 0,
  inboundChunks: 0,
  inboundBytes: 0,
  outboundFrames: 0,
  outboundBytes: 0,
  backgroundTasks: 0,
  backgroundFailures: 0,
  toolCalls: 0,
  toolFailures: 0,
  dbQueries: 0,
  dbErrors: 0,
  dbSlow: 0,
  crmSyncs: 0,
  crmFailures: 0,
  geminiConnect: new RollingStat(256),
  dbLatency: new RollingStat(2048),
  crmLatency: new RollingStat(1024),
  inboundProc: new RollingStat(2048),
  outboundProc: new RollingStat(2048),
  turnLatency: new RollingStat(1024),
};

/** Structured, single-line perf log. */
export function logPerf(scope, fields) {
  if (!latencyLogEnabled) return;
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[bridge][perf] ${scope} ${body}`);
}

/**
 * Emit a compact aggregate latency/throughput line from a CallMetrics snapshot.
 * Shared by the phone bridge and the browser relay.
 */
export function logCallStats(kind, snapshot, extra = {}) {
  if (!latencyLogEnabled) return;
  const tools =
    Object.entries(snapshot.tools)
      .map(([name, t]) => `${name}:n=${t.count},avg=${t.avg},p95=${t.p95}${t.failed ? `,fail=${t.failed}` : ''}`)
      .join('|') || '-';
  logPerf('call', {
    call: snapshot.callSid,
    kind,
    ...extra,
    dur_s: snapshot.durationSec,
    gem_connect_ms: snapshot.geminiConnectMs ?? '-',
    in_chunks: snapshot.inChunks,
    in_kb: snapshot.inKb,
    in_avg_ms: snapshot.inProcMs.avg,
    in_p95_ms: snapshot.inProcMs.p95,
    out_frames: snapshot.outFrames,
    out_kb: snapshot.outKb,
    out_avg_ms: snapshot.outProcMs.avg,
    out_p95_ms: snapshot.outProcMs.p95,
    turn_n: snapshot.turns.count,
    turn_avg_ms: snapshot.turns.avg,
    turn_p95_ms: snapshot.turns.p95,
    interrupts: snapshot.interrupts,
    tools,
  });
}

/** JSON snapshot for the /metrics endpoint. */
export function snapshotProcess() {
  return {
    ok: true,
    uptimeSec: Math.round((Date.now() - processMetrics.startedAt) / 1000),
    calls: { active: processMetrics.activeCalls, total: processMetrics.totalCalls },
    audio: {
      inChunks: processMetrics.inboundChunks,
      inKb: Number((processMetrics.inboundBytes / 1024).toFixed(1)),
      outFrames: processMetrics.outboundFrames,
      outKb: Number((processMetrics.outboundBytes / 1024).toFixed(1)),
    },
    gemini: { connectMs: processMetrics.geminiConnect.snapshot() },
    db: {
      queries: processMetrics.dbQueries,
      errors: processMetrics.dbErrors,
      slow: processMetrics.dbSlow,
      latencyMs: processMetrics.dbLatency.snapshot(),
    },
    crm: {
      ok: processMetrics.crmSyncs,
      failed: processMetrics.crmFailures,
      latencyMs: processMetrics.crmLatency.snapshot(),
    },
    background: {
      started: processMetrics.backgroundTasks,
      failed: processMetrics.backgroundFailures,
    },
    tools: { calls: processMetrics.toolCalls, failed: processMetrics.toolFailures },
    audioProcMs: {
      inbound: processMetrics.inboundProc.snapshot(),
      outbound: processMetrics.outboundProc.snapshot(),
    },
    turnLatencyMs: processMetrics.turnLatency.snapshot(),
  };
}

// ─── Per-call aggregates ──────────────────────────────────────────────────────
export class CallMetrics {
  constructor(callSid) {
    this.callSid = callSid;
    this.startedNs = hrNow();
    this.geminiConnectMs = null;
    this.inbound = new RollingStat(2048);
    this.outbound = new RollingStat(2048);
    this.turns = new RollingStat(1024);
    this.inChunks = 0;
    this.inBytes = 0;
    this.outFrames = 0;
    this.outBytes = 0;
    this.interrupts = 0;
    this.pendingTurnNs = null;
    this.toolStats = new Map();
  }

  /** Caller audio forwarded to Gemini (per 100 ms chunk). */
  noteInbound(procMs, bytes) {
    this.inbound.record(procMs);
    this.inChunks++;
    this.inBytes += bytes;
    processMetrics.inboundChunks++;
    processMetrics.inboundBytes += bytes;
    processMetrics.inboundProc.record(procMs);
    // Remember the latest caller activity to measure model response latency.
    this.pendingTurnNs = hrNow();
  }

  /** Model audio sent to Exotel (per 320-byte-multiple frame). */
  noteOutbound(procMs, bytes, frames = 1) {
    this.outbound.record(procMs);
    this.outFrames += frames;
    this.outBytes += bytes;
    processMetrics.outboundFrames += frames;
    processMetrics.outboundBytes += bytes;
    processMetrics.outboundProc.record(procMs);
    if (this.pendingTurnNs !== null) {
      const turnMs = msSince(this.pendingTurnNs);
      this.turns.record(turnMs);
      processMetrics.turnLatency.record(turnMs);
      this.pendingTurnNs = null;
    }
  }

  noteInterrupt() {
    this.interrupts++;
  }

  setGeminiConnect(ms) {
    this.geminiConnectMs = ms;
    processMetrics.geminiConnect.record(ms);
  }

  recordTool(name, ms, ok) {
    let entry = this.toolStats.get(name);
    if (!entry) {
      entry = { stat: new RollingStat(256), failures: 0 };
      this.toolStats.set(name, entry);
    }
    entry.stat.record(ms);
    if (!ok) entry.failures++;
    processMetrics.toolCalls++;
    if (!ok) processMetrics.toolFailures++;
  }

  snapshot() {
    const tools = {};
    for (const [name, entry] of this.toolStats) {
      tools[name] = { ...entry.stat.snapshot(), failed: entry.failures };
    }
    return {
      callSid: this.callSid,
      durationSec: Number((msSince(this.startedNs) / 1000).toFixed(1)),
      geminiConnectMs: this.geminiConnectMs === null ? null : Number(this.geminiConnectMs.toFixed(0)),
      inChunks: this.inChunks,
      inBytes: this.inBytes,
      inKb: Number((this.inBytes / 1024).toFixed(1)),
      inProcMs: this.inbound.snapshot(),
      outFrames: this.outFrames,
      outBytes: this.outBytes,
      outKb: Number((this.outBytes / 1024).toFixed(1)),
      outProcMs: this.outbound.snapshot(),
      turns: this.turns.snapshot(),
      interrupts: this.interrupts,
      tools,
    };
  }
}
