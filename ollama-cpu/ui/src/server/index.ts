import express from 'express';
import path from 'path';
import ollamaRouter from './routes/ollama';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// API routes
app.use('/api/ollama', ollamaRouter);

// Serve frontend static files (built by Vite)
const clientDir = path.join(__dirname, '../../dist/client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ollama CPU UI listening on port ${PORT}`);
});
