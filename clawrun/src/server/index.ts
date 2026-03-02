import express from 'express';
import path from 'path';
import appsRouter from './routes/apps';
import openclawRouter from './routes/openclaw';
import ollamaRouter from './routes/ollama';
import statusRouter from './routes/status';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// API routes
app.use('/api/apps', appsRouter);
app.use('/api/openclaw', openclawRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/status', statusRouter);

// Serve frontend static files (built by Vite)
const clientDir = path.join(__dirname, '../../dist/client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ClawRun server listening on port ${PORT}`);
});
