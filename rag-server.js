import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';

import { cleanLlmAnswer } from './lib/clean-llm-answer.js';
import { formatRetrievalResults } from './lib/rag-retrieval.js';
import nairobiRouter from './lib/nairobi-routes.js';
import { loadPortfolio, computePortfolioSummary, computeLossCurve } from './lib/nairobi-flood-cat.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

app.use(helmet());
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api/nairobi', nairobiRouter);

let vectorStore;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGreetingMessage(text) {
  const normalized = normalize(text);
  return /^(hi|hello|hey|how are you|good morning|good afternoon|good evening|who are you|who are you\?)/.test(
    normalized
  );
}

function buildSystemPrompt(question) {
  const greetingInstruction = isGreetingMessage(question)
    ? 'The user is greeting you. Respond warmly and briefly as ReAgent AI, then offer help with Nairobi flood claims, treaty referral, or underwriting questions. Do not sound rigid or say you cannot help with greetings.'
    : '';

  return `You are ReAgent AI, a claims and underwriting decision-support assistant for Kenya Reinsurance Corporation (Kenya Re).
Your knowledge base covers Nairobi urban flood (pluvial) insurance: policy wording, the flood surplus reinsurance treaty, claim forms, and flood investigation reports for the Kariobangi / Eastlands flood scenario.
Support claims assessment by checking coverage and exclusions, flagging missing documentation, applying treaty referral rules (especially Article 6), and recommending next steps with cited evidence.
Always defer final decisions to a human reviewer — never auto-approve or auto-deny claims.
Use a concise, professional tone. ${greetingInstruction}
If the question is unrelated to reinsurance claims, flood underwriting, or this knowledge base, politely redirect.
Never identify yourself as an AI model or mention model providers.

Guidelines:
1. Base answers ONLY on the retrieved context provided.
2. Use the retrieved context as your primary source of truth.
3. If the context contains relevant information, answer from it directly before saying you lack information.
4. Cite specific documents or sources from the context (policy sections, treaty articles, claim form fields, investigation findings).
5. If the context truly lacks relevant information, say "I don't have enough information about that in my knowledge base" and recommend that a human reviewer obtain missing documentation or confirm with Kenya Re underwriting/claims.
6. Avoid speculation; when uncertain, escalate to human review.
7. Keep answers concise and practical.`;
}

async function loadRAG() {
  const embeddings = new HuggingFaceTransformersEmbeddings({
    modelName: 'Xenova/all-MiniLM-L6-v2',
  });
  vectorStore = await HNSWLib.load('vector_store', embeddings);
  // Warm embeddings so the first /rag request is not racing model init
  await vectorStore.similaritySearch('flood treaty Article 6 referral', 1);
  console.log('RAG vector store and embeddings loaded.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const err = new Error('LLM API key not set. Set GROQ_API_KEY in .env');
    err.status = 500;
    throw err;
  }

  const payload = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.1,
    // Keep modest — free/on-demand OTPM limits reject large max_tokens bursts
    max_tokens: Number(process.env.GROQ_MAX_TOKENS) || 500,
  };

  const maxAttempts = 3;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(GROQ_API_URL, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });
      return (
        cleanLlmAnswer(response.data?.choices?.[0]?.message?.content) ||
        '[No answer returned]'
      );
    } catch (llmErr) {
      lastErr = llmErr;
      const status = llmErr.response?.status;
      const msg = String(llmErr.response?.data?.error?.message || llmErr.message || '');
      const retryMatch = msg.match(/try again in ([0-9.]+)s/i);
      if (status === 429 && attempt < maxAttempts) {
        const waitMs = retryMatch ? Math.ceil(Number(retryMatch[1]) * 1000) + 250 : 2000 * attempt;
        console.warn(`Groq rate limit; retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }
      break;
    }
  }

  const details = lastErr.response?.data || lastErr.message || String(lastErr);
  const status = lastErr.response?.status;
  const msg =
    lastErr.response?.data?.error?.message ||
    (typeof details === 'string' ? details : JSON.stringify(details));
  const err = new Error(
    status ? `LLM call failed (${status}): ${msg}` : `LLM call failed: ${msg}`
  );
  err.status = 500;
  err.details = details;
  throw err;
}

async function runRag(question) {
  if (!vectorStore) {
    const err = new Error('Vector store not loaded');
    err.status = 503;
    throw err;
  }

  const results = await vectorStore.similaritySearch(question, 6);
  const { context, sources } = formatRetrievalResults(results);

  const prompt = `Retrieved context:\n${context.join('\n\n')}\n\nUser question: ${question}\n\nAnswer:`;
  const messages = [
    { role: 'system', content: buildSystemPrompt(question) },
    { role: 'user', content: prompt },
  ];

  const answer = await callGroq(messages);
  return { context, sources, answer };
}

async function handleRag(req, res) {
  const question = req.body?.question;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  try {
    const { context, answer, sources } = await runRag(question.trim());
    res.json({ context, answer, sources: sources || [] });
  } catch (err) {
    console.error('RAG error:', err.details || err.message || err);
    res.status(err.status || 500).json({
      error: err.message || 'RAG retrieval failed',
      details: err.details,
    });
  }
}

// Primary RAG endpoint used by ask.js
app.post('/rag', handleRag);
// Alias used by Netlify / web clients
app.post('/ask', handleRag);

app.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    rag: Boolean(vectorStore),
    model: GROQ_MODEL,
    mode: 'rag',
  })
);

// ── Claims summary (from historical CSV) ─────────────────────────────────────
app.get('/api/claims/summary', async (_req, res) => {
  try {
    const raw = await fs.readFile('docs/05_historical_claims.csv', 'utf8');
    const records = parse(raw, { columns: true, skip_empty_lines: true });

    const total = records.length;
    const settled = records.filter(r => r.status === 'Settled').length;
    const open = records.filter(r => r.status === 'Open').length;
    const underReview = records.filter(r => r.status === 'Under Review').length;

    const totalClaimed = records.reduce((s, r) => {
      const n = Number(String(r.claimed_amount_kes).replace(/[^0-9.]/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);

    const totalSettled = records.reduce((s, r) => {
      const n = Number(String(r.settled_amount_kes).replace(/[^0-9.]/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);

    // Current claim HC-030
    const current = records.find(r => r.claim_id === 'HC-030');

    // Anomaly flags: no sprinkler + previous claims > 0 + unconfirmed cause
    const flagged = records.filter(r =>
      r.sprinkler_present === 'No' &&
      Number(r.previous_claims_count) > 0
    ).length;

    // By peril breakdown
    const byPeril = {};
    for (const r of records) {
      const p = r.peril || 'Unknown';
      byPeril[p] = (byPeril[p] || 0) + 1;
    }

    // Recent claims (last 5)
    const recent = records.slice(-5).reverse().map(r => ({
      claim_id: r.claim_id,
      insured: r.insured,
      peril: r.peril,
      status: r.status,
      claimed_amount_kes: Number(String(r.claimed_amount_kes).replace(/[^0-9.]/g, '')) || 0,
      days_to_notify: Number(r.days_to_notify) || 0,
    }));

    res.json({
      total_claims: total,
      settled,
      open,
      under_review: underReview,
      total_claimed_kes: totalClaimed,
      total_settled_kes: totalSettled,
      flagged_for_review: flagged,
      by_peril: byPeril,
      current_claim: current ? {
        claim_id: current.claim_id,
        insured: current.insured,
        status: current.status,
        claimed_amount_kes: Number(String(current.claimed_amount_kes).replace(/[^0-9.]/g, '')) || 0,
        peril: current.peril,
        cause_confirmed: current.cause_confirmed,
      } : null,
      recent_claims: recent,
    });
  } catch (err) {
    console.error('Claims summary error:', err);
    res.status(500).json({ error: 'Failed to load claims summary' });
  }
});

// ── Combined dashboard endpoint ───────────────────────────────────────────────
app.get('/api/dashboard', async (_req, res) => {
  try {
    // Load claims CSV directly (no internal HTTP call)
    const raw = await fs.readFile('docs/05_historical_claims.csv', 'utf8');
    const records = parse(raw, { columns: true, skip_empty_lines: true });

    const total = records.length;
    const settled = records.filter(r => r.status === 'Settled').length;
    const open = records.filter(r => r.status === 'Open').length;
    const underReview = records.filter(r => r.status === 'Under Review').length;

    const toNum = v => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

    const totalClaimed = records.reduce((s, r) => s + toNum(r.claimed_amount_kes), 0);
    const totalSettled = records.reduce((s, r) => s + toNum(r.settled_amount_kes), 0);

    const flagged = records.filter(r => r.sprinkler_present === 'No' && Number(r.previous_claims_count) > 0).length;

    const current = records.find(r => r.claim_id === 'HC-030');

    const recent = records.slice(-5).reverse().map(r => ({
      claim_id: r.claim_id,
      insured: r.insured,
      peril: r.peril,
      status: r.status,
      claimed_amount_kes: toNum(r.claimed_amount_kes),
    }));

    // Load flood portfolio
    const { exposure } = await loadPortfolio();
    const summary = computePortfolioSummary(exposure);
    const lossCurve = computeLossCurve(exposure);
    const moderateLoss = lossCurve.points.find(p => p.tier === 'moderate');
    const severeLoss = lossCurve.points.find(p => p.tier === 'severe');

    const { enrichRow } = await import('./lib/nairobi-flood-cat.js');
    const topRisk = exposure
      .map(row => enrichRow(row, 'moderate'))
      .sort((a, b) => b.hazard - a.hazard)
      .slice(0, 3)
      .map(r => ({
        loc_id: r.loc_id,
        housing_label: r.housing_label,
        hazard: r.hazard,
        loss_kes: r.loss_kes,
        tiv_kes: r.tiv_kes,
      }));

    res.json({
      claims: {
        total_claims: total,
        settled, open, under_review: underReview,
        total_claimed_kes: totalClaimed,
        total_settled_kes: totalSettled,
        flagged_for_review: flagged,
        current_claim: current ? {
          claim_id: current.claim_id,
          insured: current.insured,
          status: current.status,
          claimed_amount_kes: toNum(current.claimed_amount_kes),
          peril: current.peril,
          cause_confirmed: current.cause_confirmed,
        } : null,
        recent_claims: recent,
      },
      flood: {
        location_count: summary.location_count,
        total_tiv_kes: summary.total_tiv_kes,
        moderate_loss_kes: moderateLoss?.portfolio_loss_kes || 0,
        severe_loss_kes: severeLoss?.portfolio_loss_kes || 0,
        top_risk_locations: topRisk,
        by_housing: summary.by_housing,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data', details: err.message });
  }
});

Promise.all([loadPortfolio(), loadRAG()])
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`RAG server listening on 0.0.0.0:${PORT}`);
      console.log(`  POST /rag  — ask.js and CLI (pure RAG)`);
      console.log(`  POST /ask  — Netlify / web alias`);
      console.log(`  GET  /health`);
      console.log(`  GET  /api/nairobi/* — Nairobi flood CAT desk`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
