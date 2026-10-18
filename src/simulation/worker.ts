import { simulate } from './solver';
import type { SimulationRequest, WorkerResponse } from '../model/types';
self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { document, revision } = event.data;
  const send = (response: WorkerResponse) => self.postMessage(response);
  const result = simulate(document, revision, (progress) =>
    send({ type: 'progress', revision, progress }),
  );
  send({ type: 'result', result });
};
