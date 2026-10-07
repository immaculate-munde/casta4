# ReAgent AI

Agentic claims and underwriting decision-support for reinsurance, built for the Kenya Re AI4I Hackathon 2026 (theme: Redefining Reinsurance Business Processes with Agentic AI and Machine Learning). Uses Retrieval-Augmented Generation (RAG), vector search, and multi-channel support (web, WhatsApp, API).

## Features
- Decision-support chatbot for reinsurance claims assessment and underwriting
- Retrieval-Augmented Generation (RAG) over policy, treaty, claim, and investigation documents
- Web frontend (static HTML/CSS/JS)
- WhatsApp integration via webhook
- Secure, rate-limited Express server for RAG
- Environment variable support for secrets and API keys

## Project Structure
```
ReAgent-AI/
  public/           # Frontend (index.html, chat.js, style.css, SVGs)
  netlify/functions/ # Netlify serverless functions (askai.js, chat.js, whatsapp-webhook.js)
  rag-server.js     # Express RAG server
  rag.js, retrieve.js # RAG utilities and scripts
  vector_store/     # Vector DB files
  docs/             # Nairobi flood policy, treaty, claim form, flood investigation, historical claims
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Install dependencies
```sh
npm install
```

### Run the Web Frontend Locally
```sh
npx serve public
```
Then open http://localhost:3000 in your browser.

### Run the RAG Server
```sh
node rag-server.js
```

### Nairobi flood catastrophe desk (Team A)

**Data:** CSVs live in `data/team_a_nairobi/` (commit and push them with the repo — they are not gitignored).

**API:** `node rag-server.js` (port **3001**) — `/api/nairobi/meta`, `/summary`, `/hotspots`, `/exposure`, `/exposure/:locId`, `/loss-curve`.

**Next.js frontend (recommended):**
```sh
cd web
cp .env.example .env.local   # set NEXT_PUBLIC_RAG_API_URL=http://localhost:3001
npm install
npm run dev
```
Open **http://localhost:3000/catastrophe** (flood desk) or **/chat** (claims). Legacy static UI remains in `public/`.

### Deploying Netlify Functions
- Functions are in `netlify/functions/` and auto-deployed by Netlify.
- Set environment variables in Netlify dashboard for API keys and URLs.

### Environment Variables
- `RAG_SERVER_URL` (for RAG)
- `GROQ_API_KEY` (required; set to your Groq API key)
- `WHATSAPP_VERIFY_TOKEN` (for WhatsApp webhook)

## Security & Best Practices
- Do not commit secrets to version control.
- Restrict CORS in production.
- Add authentication for sensitive endpoints if needed.

## Author
Ireri Linus Mugendi

---
For more details, see the `DEPLOYMENT-GUIDE.md` or contact hello.linoai@gmail.com.
