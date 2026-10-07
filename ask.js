import fetch from 'node-fetch';
import readline from 'readline';

const RAG_URL = process.env.RAG_URL || 'http://localhost:3001/rag';

function questionAsync(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

(async () => {
  try {
    const fromArg = process.argv.slice(2).join(' ').trim();
    const question = (fromArg || (await questionAsync(rl, 'Ask your question: '))).trim();
    if (!question) {
      console.error('Please enter a question.');
      process.exit(1);
    }
    if (fromArg) console.log('Ask your question:', question);

    let response;
    try {
      response = await fetch(RAG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
    } catch (connErr) {
      console.error('\n==== ERROR: Server call failed ====');
      console.error(`Could not connect to ${RAG_URL}`);
      console.error('Error:', connErr.message);
      console.error('Start the server from the project root: node rag-server.js');
      process.exit(1);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.error('\n==== SERVER ERROR ====');
      console.error('Status:', response.status);
      console.error('Body:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n========================================');
    console.log('==== RETRIEVED CONTEXT');
    console.log('========================================');
    const context = Array.isArray(data.context) ? data.context : [];
    if (!context.length) {
      console.log('(No context chunks returned)');
    } else {
      context.forEach((chunk, i) => {
        const preview = String(chunk).slice(0, 280);
        console.log(`\n--- chunk ${i + 1} ---`);
        console.log(preview + (String(chunk).length > 280 ? '\n[truncated]' : ''));
      });
    }

    console.log('\n========================================');
    console.log('==== ANSWER');
    console.log('========================================');
    console.log(data.answer || '[No answer returned]');
  } catch (err) {
    console.error('\n==== ERROR ====');
    console.error(err.message || String(err));
    process.exit(1);
  } finally {
    rl.close();
  }
})();
