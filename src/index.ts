import app from './app';
import { startScheduler } from './lib/scheduler';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀  Omira API  →  http://localhost:${PORT}`);
  console.log(`❤️   Health     →  http://localhost:${PORT}/health`);
  console.log(`📦  Env         →  ${process.env.NODE_ENV}\n`);
  startScheduler();
});
