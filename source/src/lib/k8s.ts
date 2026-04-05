export interface Cluster {
  name: string;
  status: string;
  lastHeartbeat: number;
}

export const getClusters = async (): Promise<Cluster[]> => {
  const res = await fetch('/api/clusters');
  if (!res.ok) throw new Error('Failed to fetch clusters');
  return res.json();
};

const sendAgentRequest = async (cluster: string, action: string, payload: any = {}) => {
  const res = await fetch(`/api/clusters/${encodeURIComponent(cluster)}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data.data;
};

export const getDiscovery = async (cluster: string) => {
  return sendAgentRequest(cluster, 'discovery');
};

export const listResources = async (cluster: string, group: string, version: string, resource: string, namespace?: string) => {
  return sendAgentRequest(cluster, 'list', { group, version, resource, namespace });
};

export const getResource = async (cluster: string, group: string, version: string, resource: string, name: string, namespace?: string) => {
  return sendAgentRequest(cluster, 'get', { group, version, resource, name, namespace });
};
