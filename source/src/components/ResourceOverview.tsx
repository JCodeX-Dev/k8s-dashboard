import React, { useEffect, useState } from 'react';
import { listResources } from '../lib/k8s';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Activity, Cpu, MemoryStick } from 'lucide-react';

export default function ResourceOverview({ clusterName, resourceType, resourceData, onChildClick }: any) {
  const [children, setChildren] = useState<any[]>([]);
  const [podMetrics, setPodMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      if (!resourceData || !clusterName) return;
      
      setLoading(true);
      try {
        const ns = resourceData.metadata?.namespace;
        const uid = resourceData.metadata?.uid;
        const kind = resourceData.kind;

        let fetchedChildren: any[] = [];

        if (kind === 'Deployment') {
          const rsData = await listResources(clusterName, 'apps', 'v1', 'replicasets', ns);
          const rsList = rsData?.items || [];
          const ownedRs = rsList.filter((rs: any) => rs.metadata?.ownerReferences?.some((ref: any) => ref.uid === uid));
          
          const podsData = await listResources(clusterName, '', 'v1', 'pods', ns);
          const podsList = podsData?.items || [];
          const rsUids = ownedRs.map((rs: any) => rs.metadata.uid);
          const ownedPods = podsList.filter((pod: any) => pod.metadata?.ownerReferences?.some((ref: any) => rsUids.includes(ref.uid)));
          
          fetchedChildren = [...ownedRs, ...ownedPods];
        } else if (kind === 'ReplicaSet' || kind === 'StatefulSet' || kind === 'DaemonSet' || kind === 'Job') {
          const podsData = await listResources(clusterName, '', 'v1', 'pods', ns);
          const podsList = podsData?.items || [];
          fetchedChildren = podsList.filter((pod: any) => pod.metadata?.ownerReferences?.some((ref: any) => ref.uid === uid));
        } else if (kind === 'CronJob') {
          const jobsData = await listResources(clusterName, 'batch', 'v1', 'jobs', ns);
          const jobsList = jobsData?.items || [];
          const ownedJobs = jobsList.filter((job: any) => job.metadata?.ownerReferences?.some((ref: any) => ref.uid === uid));
          
          const podsData = await listResources(clusterName, '', 'v1', 'pods', ns);
          const podsList = podsData?.items || [];
          const jobUids = ownedJobs.map((job: any) => job.metadata.uid);
          const ownedPods = podsList.filter((pod: any) => pod.metadata?.ownerReferences?.some((ref: any) => jobUids.includes(ref.uid)));
          
          fetchedChildren = [...ownedJobs, ...ownedPods];
        } else if (kind === 'Node') {
          const podsData = await listResources(clusterName, '', 'v1', 'pods');
          const podsList = podsData?.items || [];
          fetchedChildren = podsList.filter((pod: any) => pod.spec?.nodeName === resourceData.metadata.name);
        }

        setChildren(fetchedChildren);

        // Fetch metrics for pods
        if (fetchedChildren.some(c => c.kind === 'Pod') || kind === 'Pod' || kind === 'Node') {
          try {
            const { getMetrics } = await import('../lib/k8s');
            // If it's a node, we might want to fetch all pod metrics and filter, or just fetch node metrics
            // For now, fetch pod metrics for the namespace
            const metricsData = await getMetrics(clusterName, 'pods', ns);
            setPodMetrics(metricsData?.items || []);
          } catch (e) {
            console.warn("Metrics server not available", e);
          }
        }
      } catch (err) {
        console.error("Failed to fetch children", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, [clusterName, resourceData]);

  if (!resourceData) return null;

  // Render CPU/Memory requests/limits if it's a pod or has pod template
  let cpuReq = 0, cpuLim = 0, memReq = 0, memLim = 0;
  let hasResources = false;

  const parseCpu = (cpuStr: string) => {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseInt(cpuStr) / 1000000000;
    if (cpuStr.endsWith('u')) return parseInt(cpuStr) / 1000000;
    if (cpuStr.endsWith('m')) return parseInt(cpuStr) / 1000;
    return parseInt(cpuStr);
  };

  const parseMemory = (memStr: string) => {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseInt(memStr) / (1024 * 1024);
    if (memStr.endsWith('Mi')) return parseInt(memStr) / 1024;
    if (memStr.endsWith('Gi')) return parseInt(memStr);
    if (memStr.endsWith('Ti')) return parseInt(memStr) * 1024;
    if (!isNaN(Number(memStr))) return parseInt(memStr) / (1024 * 1024 * 1024);
    return parseInt(memStr) / (1024 * 1024 * 1024);
  };

  const containers = resourceData.spec?.template?.spec?.containers || resourceData.spec?.containers || [];
  containers.forEach((c: any) => {
    if (c.resources?.requests) {
      hasResources = true;
      cpuReq += parseCpu(c.resources.requests.cpu);
      memReq += parseMemory(c.resources.requests.memory);
    }
    if (c.resources?.limits) {
      hasResources = true;
      cpuLim += parseCpu(c.resources.limits.cpu);
      memLim += parseMemory(c.resources.limits.memory);
    }
  });

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-slate-50">
      {hasResources && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 flex items-center gap-2 mb-4"><Cpu className="w-4 h-4"/> CPU Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Requests</p>
                <p className="text-2xl font-bold text-slate-800">{cpuReq > 0 ? cpuReq.toFixed(2) : 'N/A'} <span className="text-sm font-medium text-slate-500">Cores</span></p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Limits</p>
                <p className="text-2xl font-bold text-slate-800">{cpuLim > 0 ? cpuLim.toFixed(2) : 'N/A'} <span className="text-sm font-medium text-slate-500">Cores</span></p>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 flex items-center gap-2 mb-4"><MemoryStick className="w-4 h-4"/> Memory Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Requests</p>
                <p className="text-2xl font-bold text-slate-800">{memReq > 0 ? memReq.toFixed(2) : 'N/A'} <span className="text-sm font-medium text-slate-500">GiB</span></p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Limits</p>
                <p className="text-2xl font-bold text-slate-800">{memLim > 0 ? memLim.toFixed(2) : 'N/A'} <span className="text-sm font-medium text-slate-500">GiB</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-semibold text-slate-800">Child Resources</h3>
        </div>
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Activity className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Loading child resources...</span>
          </div>
        ) : children.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-medium">No child resources found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="font-semibold text-slate-600">Kind</TableHead>
                <TableHead className="font-semibold text-slate-600">Name</TableHead>
                <TableHead className="font-semibold text-slate-600">Status</TableHead>
                <TableHead className="font-semibold text-slate-600">CPU Usage</TableHead>
                <TableHead className="font-semibold text-slate-600">Memory Usage</TableHead>
                <TableHead className="font-semibold text-slate-600">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((child, i) => {
                let status = 'Unknown';
                if (child.kind === 'Pod') status = child.status?.phase || 'Unknown';
                else if (child.kind === 'ReplicaSet') status = `${child.status?.readyReplicas || 0}/${child.status?.replicas || 0} Ready`;
                else if (child.kind === 'Job') status = child.status?.succeeded ? 'Succeeded' : (child.status?.active ? 'Active' : 'Failed');

                const creationTime = new Date(child.metadata?.creationTimestamp).getTime();
                const ageMs = Date.now() - creationTime;
                const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
                const ageMins = Math.floor(ageMs / (1000 * 60));
                const age = ageDays > 0 ? `${ageDays}d` : ageHours > 0 ? `${ageHours}h` : `${ageMins}m`;

                let cpuUsage = 'N/A';
                let memUsage = 'N/A';

                if (child.kind === 'Pod') {
                  const metric = podMetrics.find(m => m.metadata.name === child.metadata.name && m.metadata.namespace === child.metadata.namespace);
                  if (metric) {
                    let cpuTotal = 0;
                    let memTotal = 0;
                    metric.containers.forEach((c: any) => {
                      cpuTotal += parseCpu(c.usage.cpu);
                      memTotal += parseMemory(c.usage.memory);
                    });
                    cpuUsage = `${(cpuTotal * 1000).toFixed(0)}m`;
                    memUsage = `${(memTotal * 1024).toFixed(0)}Mi`;
                  }
                }

                return (
                  <TableRow 
                    key={i}
                    className="cursor-pointer hover:bg-blue-50/50 transition-colors group"
                    onClick={() => onChildClick && onChildClick(child.kind, child.metadata.name, child.metadata.namespace)}
                  >
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                        {child.kind}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">{child.metadata.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          status.includes('Running') || status.includes('Ready') || status === 'Succeeded' ? 'bg-emerald-500' : 
                          status.includes('Pending') || status === 'Active' ? 'bg-amber-500' : 
                          'bg-slate-400'
                        }`} />
                        <span className="text-sm text-slate-600 font-medium">{status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium">{cpuUsage}</TableCell>
                    <TableCell className="text-slate-600 font-medium">{memUsage}</TableCell>
                    <TableCell className="text-slate-500 text-sm">{age}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
