import { parentPort, workerData } from 'node:worker_threads';

const { buildMigrationPlan } = await import(workerData.module);
parentPort.postMessage(buildMigrationPlan(workerData.root));
