import React, { useEffect, useState } from 'react';
import { listResources } from '../lib/k8s';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Server, Box, Layers, Activity, Cpu, MemoryStick, HardDrive, Network } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface ClusterOverviewProps {
  clusterName: string;
}

export default function ClusterOverview({ clusterName }: ClusterOverviewProps) {
  const [stats, setStats] = useState({
    nodes: 0,
    pods: 0,
    deployments: 0,
    statefulsets: 0,
    daemonsets: 0,
    jobs: 0,
    cronjobs: 0,
  });
  const [nodes, setNodes] = useState<any[]>([]);
  const [pods, setPods] = useState<any[]>([]);
  const [nodeMetrics, setNodeMetrics] = useState<any[]>([]);
  const [podMetrics, setPodMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverviewData = async () => {
      setLoading(true);
      try {
        const [
          nodesData,
          podsData,
          deployData,
          stsData,
          dsData,
          jobsData,
          cjData
        ] = await Promise.all([
          listResources(clusterName, '', 'v1', 'nodes'),
          listResources(clusterName, '', 'v1', 'pods'),
          listResources(clusterName, 'apps', 'v1', 'deployments'),
          listResources(clusterName, 'apps', 'v1', 'statefulsets'),
          listResources(clusterName, 'apps', 'v1', 'daemonsets'),
          listResources(clusterName, 'batch', 'v1', 'jobs'),
          listResources(clusterName, 'batch', 'v1', 'cronjobs'),
        ]);

        let nodeMetricsData = null;
        let podMetricsData = null;
        try {
          const { getMetrics } = await import('../lib/k8s');
          nodeMetricsData = await getMetrics(clusterName, 'nodes');
          podMetricsData = await getMetrics(clusterName, 'pods');
        } catch (e) {
          console.warn("Metrics server not available", e);
        }

        setNodes(nodesData?.items || []);
        setPods(podsData?.items || []);
        setNodeMetrics(nodeMetricsData?.items || []);
        setPodMetrics(podMetricsData?.items || []);
        
        setStats({
          nodes: nodesData?.items?.length || 0,
          pods: podsData?.items?.length || 0,
          deployments: deployData?.items?.length || 0,
          statefulsets: stsData?.items?.length || 0,
          daemonsets: dsData?.items?.length || 0,
          jobs: jobsData?.items?.length || 0,
          cronjobs: cjData?.items?.length || 0,
        });
      } catch (err) {
        console.error("Failed to fetch overview data", err);
      } finally {
        setLoading(false);
      }
    };

    if (clusterName) {
      fetchOverviewData();
    }
  }, [clusterName]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50">
        <Activity className="w-8 h-8 animate-pulse text-blue-500 mb-4" />
        <p className="text-slate-500 font-medium">Gathering cluster telemetry...</p>
      </div>
    );
  }

  const workloadData = [
    { name: 'Deployments', value: stats.deployments, color: '#3b82f6' },
    { name: 'StatefulSets', value: stats.statefulsets, color: '#8b5cf6' },
    { name: 'DaemonSets', value: stats.daemonsets, color: '#ec4899' },
    { name: 'Jobs', value: stats.jobs, color: '#f59e0b' },
    { name: 'CronJobs', value: stats.cronjobs, color: '#10b981' },
  ].filter(d => d.value > 0);

  // Parse node capacity
  const parseCpu = (cpuStr: string) => {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseInt(cpuStr) / 1000000000;
    if (cpuStr.endsWith('u')) return parseInt(cpuStr) / 1000000;
    if (cpuStr.endsWith('m')) return parseInt(cpuStr) / 1000;
    return parseInt(cpuStr);
  };

  const parseMemory = (memStr: string) => {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseInt(memStr) / (1024 * 1024); // to Gi
    if (memStr.endsWith('Mi')) return parseInt(memStr) / 1024; // to Gi
    if (memStr.endsWith('Gi')) return parseInt(memStr);
    if (memStr.endsWith('Ti')) return parseInt(memStr) * 1024;
    // Handle bytes
    if (!isNaN(Number(memStr))) return parseInt(memStr) / (1024 * 1024 * 1024);
    return parseInt(memStr) / (1024 * 1024 * 1024);
  };

  let totalCpu = 0;
  let totalMemory = 0;
  let cpuRequests = 0;
  let memoryRequests = 0;
  let cpuUsage = 0;
  let memoryUsage = 0;
  
  nodes.forEach(node => {
    totalCpu += parseCpu(node.status?.capacity?.cpu);
    totalMemory += parseMemory(node.status?.capacity?.memory);
  });

  pods.forEach(pod => {
    if (pod.status?.phase === 'Running') {
      pod.spec?.containers?.forEach((c: any) => {
        cpuRequests += parseCpu(c.resources?.requests?.cpu);
        memoryRequests += parseMemory(c.resources?.requests?.memory);
      });
    }
  });

  nodeMetrics.forEach(metric => {
    cpuUsage += parseCpu(metric.usage?.cpu);
    memoryUsage += parseMemory(metric.usage?.memory);
  });

  const cpuUtil = totalCpu > 0 ? (cpuRequests / totalCpu) * 100 : 0;
  const memUtil = totalMemory > 0 ? (memoryRequests / totalMemory) * 100 : 0;
  const cpuUsageUtil = totalCpu > 0 ? (cpuUsage / totalCpu) * 100 : 0;
  const memUsageUtil = totalMemory > 0 ? (memoryUsage / totalMemory) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
      <div className="h-20 border-b border-slate-200 flex items-center px-8 shrink-0 justify-between bg-white">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cluster Overview</h2>
          <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
            <Activity className="w-3.5 h-3.5" /> Live telemetry and statistics
          </p>
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Nodes</p>
                <p className="text-3xl font-bold text-slate-900">{stats.nodes}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Box className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Pods</p>
                <p className="text-3xl font-bold text-slate-900">{stats.pods}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total CPU (Req)</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-slate-900">{cpuRequests.toFixed(1)} <span className="text-lg text-slate-500 font-medium">/ {totalCpu.toFixed(1)}</span></p>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.min(cpuUtil, 100)}%` }}></div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <MemoryStick className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Memory (Req)</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-slate-900">{memoryRequests.toFixed(1)} <span className="text-lg text-slate-500 font-medium">/ {totalMemory.toFixed(1)} GiB</span></p>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(memUtil, 100)}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Workload Distribution</h3>
            </div>
            <div className="p-6 h-80">
              {workloadData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={workloadData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {workloadData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ fontWeight: 500 }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">No workloads found</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Node Roles & Components</h3>
            </div>
            <div className="p-0 flex-1">
              <ScrollArea className="h-80">
                <div className="divide-y divide-slate-100">
                  {nodes.map((node, i) => {
                    const isMaster = Object.keys(node.metadata?.labels || {}).some(l => l.includes('node-role.kubernetes.io/control-plane') || l.includes('node-role.kubernetes.io/master'));
                    
                    // Find core components running on this node
                    const nodePods = pods.filter(p => p.spec?.nodeName === node.metadata?.name && p.metadata?.namespace === 'kube-system');
                    const components = nodePods.map(p => {
                      const name = p.metadata?.name || '';
                      if (name.includes('kube-apiserver')) return 'API Server';
                      if (name.includes('etcd')) return 'etcd';
                      if (name.includes('kube-controller-manager')) return 'Controller Manager';
                      if (name.includes('kube-scheduler')) return 'Scheduler';
                      if (name.includes('coredns')) return 'CoreDNS';
                      if (name.includes('kube-proxy')) return 'kube-proxy';
                      return null;
                    }).filter(Boolean);
                    
                    const uniqueComponents = Array.from(new Set(components));

                    return (
                      <div key={i} className="p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Server className={`w-4 h-4 ${isMaster ? 'text-purple-500' : 'text-blue-500'}`} />
                            <span className="font-semibold text-slate-800">{node.metadata?.name}</span>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${isMaster ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isMaster ? 'Control Plane' : 'Worker'}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-500 mt-2 mb-3">
                          <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> {parseCpu(node.status?.capacity?.cpu)} Cores</span>
                          <span className="flex items-center gap-1"><MemoryStick className="w-3.5 h-3.5" /> {parseMemory(node.status?.capacity?.memory).toFixed(1)} GiB</span>
                          <span className="flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> {node.status?.nodeInfo?.osImage}</span>
                        </div>
                        {uniqueComponents.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {uniqueComponents.map((comp, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium border border-slate-200">
                                {comp}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
