import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const { app, close } = createApp();
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => req.method === 'GET' ? res.sendFile(resolve(dist, 'index.html')) : next());
}
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Roamly API ready at http://localhost:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { close(); process.exit(0); }));
