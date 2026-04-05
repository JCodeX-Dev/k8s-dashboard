import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  interface ConnectedAgent {
    ws: WebSocket;
    clusterName: string;
    lastHeartbeat: number;
    status: string;
  }

  const agents = new Map<string, ConnectedAgent>();
  const pendingRequests = new Map<string, { resolve: (data: any) => void, reject: (err: any) => void }>();

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    console.log(`[WS] Upgrade request received for: ${request.url}`);
    try {
      const pathname = request.url ? request.url.split('?')[0] : '';
      if (pathname === '/api/agent/connect') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        // Let other handlers (like Vite HMR) deal with it, or destroy if we are sure
        // socket.destroy();
      }
    } catch (err) {
      console.error('[WS] Error handling upgrade:', err);
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request) => {
    const clusterName = request.headers['x-cluster-name'] as string;
    const auth = request.headers['authorization'];

    if (!clusterName) {
      ws.close(1008, 'Missing X-Cluster-Name');
      return;
    }
    
    // Simple auth check (in a real app, validate against a DB or config)
    if (!auth || !auth.startsWith('Bearer ')) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log(`Agent connected: ${clusterName}`);
    agents.set(clusterName, { ws, clusterName, lastHeartbeat: Date.now(), status: 'connected' });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'heartbeat') {
          const agent = agents.get(clusterName);
          if (agent) {
            agent.lastHeartbeat = Date.now();
            agent.status = data.status;
          }
          return;
        }

        // It's a response to a request
        if (data.id && pendingRequests.has(data.id)) {
          const { resolve, reject } = pendingRequests.get(data.id)!;
          pendingRequests.delete(data.id);
          if (data.success) {
            resolve(data.data);
          } else {
            reject(new Error(data.error || data.message || 'Unknown error'));
          }
        }
      } catch (e) {
        console.error('Error parsing message from agent', e);
      }
    });

    ws.on('close', () => {
      console.log(`Agent disconnected: ${clusterName}`);
      agents.delete(clusterName);
    });
  });

  // API Routes for Frontend
  app.get('/api/clusters', (req, res) => {
    const result = Array.from(agents.values()).map(a => ({
      name: a.clusterName,
      status: a.status,
      lastHeartbeat: a.lastHeartbeat
    }));
    res.json(result);
  });

  app.post('/api/clusters/:cluster/request', async (req, res) => {
    const clusterName = req.params.cluster;
    const agent = agents.get(clusterName);
    
    if (!agent) {
      return res.status(404).json({ error: 'Cluster not connected' });
    }

    const id = uuidv4();
    const payload = {
      id,
      ...req.body
    };

    const promise = new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timed out after 30s'));
        }
      }, 30000);
    });

    agent.ws.send(JSON.stringify(payload));

    try {
      const data = await promise;
      res.json({ data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
