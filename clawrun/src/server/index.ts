import express from 'express';
import http from 'http';
import path from 'path';
import appsRouter from './routes/apps';
import openclawRouter from './routes/openclaw';
import ollamaRouter from './routes/ollama';
import statusRouter from './routes/status';

const app = express();
const PORT = process.env.PORT ?? 3000;
const CHART_PORT = 3001;

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

// Dedicated chart server on port 3001 with authLevel:public (no Envoy JWT check)
// app-service downloads chart tarballs from this endpoint during install
const chartsDir = path.join(__dirname, '../../charts');
const chartApp = express();
chartApp.use((req, _res, next) => {
  console.log(`[chart-server] ${req.method} ${req.url}`);
  next();
});
chartApp.use(express.static(chartsDir));
chartApp.use('/charts', express.static(chartsDir));
http.createServer(chartApp).listen(CHART_PORT, () => {
  console.log(`ClawRun chart server listening on port ${CHART_PORT}`);
});
