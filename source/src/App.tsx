import React, { useState, useEffect } from 'react';
import { Cluster, getClusters, getDiscovery, listResources, getResource, createResource, updateResource, deleteResource } from './lib/k8s';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { ScrollArea } from './components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Label } from './components/ui/label';
import { Server, ShieldAlert, Loader2, Box, Layers, RefreshCw, Eye, Activity, Globe, Database, Cpu, Puzzle, Terminal, Search, Filter, ChevronRight, Network, Plus, Trash2, Edit, ChevronDown, CheckCircle2 } from 'lucide-react';
import yaml from 'js-yaml';
import ResourceGraph from './components/ResourceGraph';
import ClusterOverview from './components/ClusterOverview';
import ResourceOverview from './components/ResourceOverview';

const getGroupIcon = (groupName: string) => {
  switch (groupName) {
    case 'Workloads': return <Layers className="w-4 h-4" />;
    case 'Network': return <Globe className="w-4 h-4" />;
    case 'Config & Storage': return <Database className="w-4 h-4" />;
    case 'Cluster': return <Cpu className="w-4 h-4" />;
    default: return <Puzzle className="w-4 h-4" />;
  }
};

export default function App() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string>('');
  
  // Discovery State
  const [discovery, setDiscovery] = useState<any[]>([]);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);

  // Selection State
  const [selectedGroupVersion, setSelectedGroupVersion] = useState<string>('v1');
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  
  // Resource List State
  const [resources, setResources] = useState<any[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState('');

  // Resource Detail State
  const [detailResource, setDetailResource] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // CRUD State
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [createEditMode, setCreateEditMode] = useState<'create' | 'edit'>('create');
  const [createEditYaml, setCreateEditYaml] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<{title: string, type: 'success' | 'error'} | null>(null);
  const [expandedCrdGroups, setExpandedCrdGroups] = useState<Record<string, boolean>>({});

  // Polling clusters
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const data = await getClusters();
        setClusters(data);
        if (data.length > 0 && !selectedCluster) {
          setSelectedCluster(data[0].name);
        }
      } catch (e) {
        console.error("Failed to fetch clusters", e);
      }
    };
    fetchClusters();
    const interval = setInterval(fetchClusters, 5000);
    return () => clearInterval(interval);
  }, [selectedCluster]);

  useEffect(() => {
    if (selectedCluster) {
      fetchDiscovery(selectedCluster);
      fetchNamespaces(selectedCluster);
    } else {
      setDiscovery([]);
      setSelectedResource(null);
      setNamespaces([]);
    }
  }, [selectedCluster]);

  const fetchNamespaces = async (clusterName: string) => {
    try {
      const data = await listResources(clusterName, '', 'v1', 'namespaces');
      if (data && data.items) {
        setNamespaces(data.items.map((ns: any) => ns.metadata.name));
      }
    } catch (err) {
      console.error("Failed to fetch namespaces", err);
    }
  };

  const fetchDiscovery = async (clusterName: string) => {
    setIsLoadingDiscovery(true);
    try {
      const data = await getDiscovery(clusterName);
      setDiscovery(data || []);
      
      // Default selection to Overview (null resource)
      if (data && data.length > 0) {
        setSelectedResource(null);
      }
    } catch (err) {
      console.error("Failed to fetch discovery", err);
    } finally {
      setIsLoadingDiscovery(false);
    }
  };

  const parseGroupVersion = (gv: string) => {
    const parts = gv.split('/');
    if (parts.length === 1) return { group: '', version: parts[0] };
    return { group: parts[0], version: parts[1] };
  };

  const fetchResources = async (showLoading = true) => {
    if (!selectedCluster || !selectedResource) return;
    if (showLoading) setIsLoadingResources(true);
    setResourceError('');
    try {
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      const data = await listResources(selectedCluster, group, version, selectedResource.name, selectedResource.namespaced ? selectedNamespace : undefined);
      setResources(data.items || []);
    } catch (err: any) {
      setResourceError(err.message);
      if (showLoading) setResources([]);
    } finally {
      if (showLoading) setIsLoadingResources(false);
    }
  };

  useEffect(() => {
    if (selectedCluster && selectedResource) {
      fetchResources(true);
      // Real-time updates via polling every 3 seconds
      const interval = setInterval(() => fetchResources(false), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedCluster, selectedResource, selectedNamespace]);

  const handleViewDetail = async (item: any) => {
    if (!selectedCluster || !selectedResource) return;
    try {
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      const data = await getResource(selectedCluster, group, version, selectedResource.name, item.metadata.name, item.metadata.namespace);
      setDetailResource(data);
      setIsDetailOpen(true);
    } catch (err: any) {
      alert(`Failed to load details: ${err.message}`);
    }
  };

  const handleCreateClick = () => {
    setCreateEditMode('create');
    setCreateEditYaml(`apiVersion: ${selectedGroupVersion}\nkind: ${selectedResource.kind}\nmetadata:\n  name: new-resource\n  namespace: ${selectedNamespace !== 'all' ? selectedNamespace : 'default'}\n`);
    setIsCreateEditOpen(true);
  };

  const handleEditClick = async (item: any) => {
    if (!selectedCluster || !selectedResource) return;
    try {
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      const data = await getResource(selectedCluster, group, version, selectedResource.name, item.metadata.name, item.metadata.namespace);
      setCreateEditMode('edit');
      const cleanItem = { ...data };
      if (cleanItem.metadata?.managedFields) delete cleanItem.metadata.managedFields;
      setCreateEditYaml(yaml.dump(cleanItem));
      setIsCreateEditOpen(true);
    } catch (err: any) {
      alert(`Failed to load resource for editing: ${err.message}`);
    }
  };

  const handleDeleteClick = (item: any) => {
    setResourceToDelete(item);
    setIsDeleteOpen(true);
  };

  const showToast = (title: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const submitCreateEdit = async () => {
    try {
      const parsed = yaml.load(createEditYaml) as any;
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      
      if (createEditMode === 'create') {
        await createResource(selectedCluster, group, version, selectedResource.name, parsed, parsed.metadata?.namespace);
        showToast('Resource created successfully');
      } else {
        await updateResource(selectedCluster, group, version, selectedResource.name, parsed.metadata.name, parsed, parsed.metadata?.namespace);
        showToast('Resource updated successfully');
      }
      setIsCreateEditOpen(false);
      fetchResources(false);
    } catch (err: any) {
      alert(`Failed to ${createEditMode} resource: ${err.message}`);
    }
  };

  const submitDelete = async () => {
    if (!resourceToDelete) return;
    try {
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      await deleteResource(selectedCluster, group, version, selectedResource.name, resourceToDelete.metadata.name, resourceToDelete.metadata.namespace);
      showToast('Resource deleted successfully');
      setIsDeleteOpen(false);
      setResourceToDelete(null);
      if (isDetailOpen && detailResource?.metadata?.name === resourceToDelete.metadata.name) {
        setIsDetailOpen(false);
      }
      fetchResources(false);
    } catch (err: any) {
      alert(`Failed to delete resource: ${err.message}`);
    }
  };

  // Group resources for sidebar
  const groupedResources = React.useMemo(() => {
    const groups: Record<string, any> = {
      'Workloads': [],
      'Network': [],
      'Config & Storage': [],
      'Cluster': [],
      'Custom Resources': {}
    };

    if (!discovery || !Array.isArray(discovery)) return groups;

    discovery.forEach(gv => {
      if (!gv.resources) return;
      gv.resources.forEach((r: any) => {
        if (r.name.includes('/')) return; // Skip subresources
        
        const item = { ...r, groupVersion: gv.groupVersion };
        
        if (['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'replicasets'].includes(r.name)) {
          groups['Workloads'].push(item);
        } else if (['services', 'ingresses', 'networkpolicies', 'endpoints'].includes(r.name)) {
          groups['Network'].push(item);
        } else if (['configmaps', 'secrets', 'persistentvolumes', 'persistentvolumeclaims', 'storageclasses'].includes(r.name)) {
          groups['Config & Storage'].push(item);
        } else if (['nodes', 'namespaces', 'events', 'serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings'].includes(r.name)) {
          groups['Cluster'].push(item);
        } else {
          if (!groups['Custom Resources'][gv.groupVersion]) {
            groups['Custom Resources'][gv.groupVersion] = [];
          }
          groups['Custom Resources'][gv.groupVersion].push(item);
        }
      });
    });

    // Sort within groups
    Object.keys(groups).forEach(k => {
      if (k === 'Custom Resources') {
        Object.keys(groups[k]).forEach(gv => {
          groups[k][gv].sort((a: any, b: any) => a.name.localeCompare(b.name));
        });
      } else {
        groups[k].sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    });

    return groups;
  }, [discovery]);

  const filteredResources = resources.filter(r => {
    let matches = true;
    if (searchQuery) {
      matches = matches && r.metadata?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (labelFilter) {
      const labels = r.metadata?.labels || {};
      const filterParts = labelFilter.split(',').map(s => s.trim()).filter(Boolean);
      for (const part of filterParts) {
        if (part.includes('=')) {
          const [k, v] = part.split('=');
          if (labels[k] !== v) matches = false;
        } else {
          if (!(part in labels)) matches = false;
        }
      }
    }
    return matches;
  });

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 flex items-center px-6 bg-white shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600 p-1.5 rounded-md">
            <Box className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-slate-900">KubeFabric</h1>
        </div>
        
        <div className="ml-auto flex items-center gap-4 text-sm">
          {clusters.length > 0 ? (
            <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Server className="w-4 h-4 text-slate-500" />
              <select 
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer outline-none"
                value={selectedCluster}
                onChange={(e) => setSelectedCluster(e.target.value)}
              >
                {clusters.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.status})</option>
                ))}
              </select>
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 bg-slate-100 px-4 py-1.5 rounded-lg border border-slate-200">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-medium">Waiting for agents...</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {clusters.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <Server className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">No Clusters Connected</h2>
            <p className="max-w-md text-center text-slate-500 leading-relaxed">
              Deploy the KubeFabric agent to your Kubernetes clusters to see them appear here automatically. The connection is secure and real-time.
            </p>
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-0">
              <div className="p-5 border-b border-slate-100">
                <Label className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mb-2.5 block">Namespace Filter</Label>
                <div className="relative">
                  <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select 
                    className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1 text-sm font-medium text-slate-700 shadow-sm transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                    value={selectedNamespace}
                    onChange={(e) => setSelectedNamespace(e.target.value)}
                  >
                    <option value="all">All Namespaces</option>
                    {namespaces.map(ns => (
                      <option key={ns} value={ns}>{ns}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-3 space-y-6">
                  <div className="px-2">
                    <button
                      onClick={() => setSelectedResource(null)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center justify-between group ${
                        selectedResource === null
                          ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                          : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${selectedResource === null ? 'text-blue-600' : 'text-slate-400'}`} />
                        Cluster Overview
                      </div>
                      {selectedResource === null && <ChevronRight className="w-4 h-4 text-blue-500" />}
                    </button>
                  </div>
                  {isLoadingDiscovery ? (
                    <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> 
                      <span className="text-sm font-medium">Discovering API...</span>
                    </div>
                  ) : (
                    Object.entries(groupedResources).map(([groupName, groupData]) => {
                      if (groupName === 'Custom Resources') {
                        const crdGroups = Object.entries(groupData as Record<string, any[]>);
                        if (crdGroups.length === 0) return null;
                        return (
                          <div key={groupName} className="px-2">
                            <div className="flex items-center gap-2 px-2 mb-2">
                              <span className="text-slate-400">{getGroupIcon(groupName)}</span>
                              <h3 className="text-[11px] font-bold tracking-wider uppercase text-slate-500">{groupName}</h3>
                            </div>
                            <div className="space-y-2">
                              {crdGroups.map(([gv, items]) => (
                                <div key={gv} className="space-y-0.5">
                                  <button
                                    onClick={() => setExpandedCrdGroups(prev => ({ ...prev, [gv]: !prev[gv] }))}
                                    className="w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors flex items-center justify-between text-slate-500 hover:bg-slate-100 font-semibold"
                                  >
                                    {gv}
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedCrdGroups[gv] ? 'rotate-180' : ''}`} />
                                  </button>
                                  {expandedCrdGroups[gv] && (
                                    <div className="pl-2 border-l-2 border-slate-100 ml-3 space-y-0.5 mt-1">
                                      {items.map(item => {
                                        const isSelected = selectedResource?.name === item.name && selectedGroupVersion === item.groupVersion;
                                        return (
                                          <button
                                            key={`${item.groupVersion}-${item.name}`}
                                            onClick={() => {
                                              setSelectedGroupVersion(item.groupVersion);
                                              setSelectedResource(item);
                                            }}
                                            className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-200 flex items-center justify-between group ${
                                              isSelected
                                                ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-medium'
                                            }`}
                                          >
                                            {item.kind}
                                            {isSelected && <ChevronRight className="w-4 h-4 text-blue-500" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      const items = groupData as any[];
                      if (items.length === 0) return null;
                      return (
                        <div key={groupName} className="px-2">
                          <div className="flex items-center gap-2 px-2 mb-2">
                            <span className="text-slate-400">{getGroupIcon(groupName)}</span>
                            <h3 className="text-[11px] font-bold tracking-wider uppercase text-slate-500">{groupName}</h3>
                          </div>
                          <div className="space-y-0.5">
                            {items.map(item => {
                              const isSelected = selectedResource?.name === item.name && selectedGroupVersion === item.groupVersion;
                              return (
                                <button
                                  key={`${item.groupVersion}-${item.name}`}
                                  onClick={() => {
                                    setSelectedGroupVersion(item.groupVersion);
                                    setSelectedResource(item);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all duration-200 flex items-center justify-between group ${
                                    isSelected
                                      ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                      : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-medium'
                                  }`}
                                >
                                  {item.kind}
                                  {isSelected && <ChevronRight className="w-4 h-4 text-blue-500" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Content Area */}
            {selectedResource === null ? (
              <ClusterOverview clusterName={selectedCluster} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                <div className="h-20 border-b border-slate-200 flex items-center px-8 shrink-0 justify-between bg-white">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-slate-900">{selectedResource.kind}s</h2>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                        {selectedGroupVersion}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5">
                      {selectedResource.namespaced ? (
                        <><Layers className="w-3.5 h-3.5" /> Namespaced Resource</>
                      ) : (
                        <><Globe className="w-3.5 h-3.5" /> Cluster-scoped Resource</>
                      )}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button variant="default" size="sm" onClick={handleCreateClick} className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                      <Plus className="w-4 h-4 mr-1.5" /> Create
                    </Button>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search by name..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-9 w-48 pl-9 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="relative">
                      <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Labels (e.g. app=web, env=prod)" 
                        value={labelFilter}
                        onChange={(e) => setLabelFilter(e.target.value)}
                        className="h-9 w-64 pl-9 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchResources(true)} disabled={isLoadingResources} className="h-9 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900">
                      <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingResources ? 'animate-spin text-blue-500' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto p-8">
                  {resourceError ? (
                    <div className="p-5 bg-red-50 text-red-900 rounded-xl border border-red-100 flex items-start shadow-sm">
                      <ShieldAlert className="w-5 h-5 mr-3 shrink-0 mt-0.5 text-red-500" />
                      <div>
                        <h4 className="font-bold text-red-900">Error loading resources</h4>
                        <p className="text-sm mt-1.5 text-red-700/90 leading-relaxed">{resourceError}</p>
                      </div>
                    </div>
                  ) : isLoadingResources ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-sm font-medium">Fetching {selectedResource.kind}s...</p>
                    </div>
                  ) : filteredResources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 text-slate-500 bg-white border border-slate-200 border-dashed rounded-2xl shadow-sm">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">No resources found</h3>
                      <p className="text-sm text-slate-500">
                        {searchQuery 
                          ? `No ${selectedResource.kind}s matching "${searchQuery}"` 
                          : `No ${selectedResource.kind}s found in ${selectedNamespace === 'all' ? 'any namespace' : `namespace ${selectedNamespace}`}.`}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-semibold text-slate-700 h-11">Name</TableHead>
                            {selectedResource.namespaced && <TableHead className="font-semibold text-slate-700 h-11">Namespace</TableHead>}
                            <TableHead className="font-semibold text-slate-700 h-11">Age</TableHead>
                            <TableHead className="text-right font-semibold text-slate-700 h-11">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredResources.map((item, i) => {
                            // Calculate age
                            let age = '-';
                            if (item.metadata?.creationTimestamp) {
                              const created = new Date(item.metadata.creationTimestamp);
                              const diffMs = Date.now() - created.getTime();
                              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                              const diffMins = Math.floor(diffMs / (1000 * 60));
                              
                              if (diffDays > 0) age = `${diffDays}d`;
                              else if (diffHours > 0) age = `${diffHours}h`;
                              else age = `${diffMins}m`;
                            }

                            return (
                              <TableRow 
                                key={item.metadata?.uid || i}
                                className="cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 group"
                                onClick={() => handleViewDetail(item)}
                              >
                                <TableCell className="font-semibold text-slate-900 py-3">{item.metadata?.name}</TableCell>
                                {selectedResource.namespaced && (
                                  <TableCell className="text-slate-600 py-3">
                                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-medium">
                                      {item.metadata?.namespace}
                                    </span>
                                  </TableCell>
                                )}
                                <TableCell className="text-slate-500 py-3 font-medium">{age}</TableCell>
                                <TableCell className="text-right py-3">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                                      onClick={(e) => { e.stopPropagation(); handleViewDetail(item); }}
                                      title="View YAML"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-slate-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                                      onClick={(e) => { e.stopPropagation(); handleEditClick(item); }}
                                      title="Edit Resource"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
                                      title="Delete Resource"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Resource Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
          <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle className="flex items-center gap-2.5 text-xl font-bold text-slate-900">
                  <Terminal className="w-5 h-5 text-blue-600" />
                  {detailResource?.metadata?.name}
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm font-medium text-slate-500 flex items-center gap-2">
                  <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded text-xs">{detailResource?.kind}</span>
                  {detailResource?.metadata?.namespace && (
                    <>
                      <span>in</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{detailResource.metadata.namespace}</span>
                    </>
                  )}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                  onClick={() => handleEditClick(detailResource)}
                >
                  <Edit className="w-4 h-4 mr-1.5" /> Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-red-200 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700"
                  onClick={() => handleDeleteClick(detailResource)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-950">
            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
              <div className="bg-slate-900 border-b border-slate-800 px-4 pt-2">
                <TabsList className="w-full justify-start rounded-none bg-transparent p-0 h-auto">
                  <TabsTrigger 
                    value="overview" 
                    className="rounded-t-lg rounded-b-none border-b-2 border-transparent px-6 py-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:bg-slate-950 data-[state=active]:text-slate-100 data-[state=active]:shadow-none transition-all"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger 
                    value="yaml" 
                    className="rounded-t-lg rounded-b-none border-b-2 border-transparent px-6 py-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:bg-slate-950 data-[state=active]:text-slate-100 data-[state=active]:shadow-none transition-all"
                  >
                    YAML
                  </TabsTrigger>
                  <TabsTrigger 
                    value="json" 
                    className="rounded-t-lg rounded-b-none border-b-2 border-transparent px-6 py-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:bg-slate-950 data-[state=active]:text-slate-100 data-[state=active]:shadow-none transition-all"
                  >
                    JSON
                  </TabsTrigger>
                  <TabsTrigger 
                    value="graph" 
                    className="rounded-t-lg rounded-b-none border-b-2 border-transparent px-6 py-2.5 text-sm font-medium text-slate-400 data-[state=active]:border-blue-500 data-[state=active]:bg-slate-950 data-[state=active]:text-slate-100 data-[state=active]:shadow-none transition-all flex items-center gap-2"
                  >
                    <Network className="w-4 h-4" /> Graph
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="overview" className="flex-1 overflow-hidden m-0 data-[state=active]:flex bg-slate-50">
                <ResourceOverview clusterName={selectedCluster} resourceType={selectedResource} resourceData={detailResource} />
              </TabsContent>
              <TabsContent value="yaml" className="flex-1 overflow-hidden m-0 data-[state=active]:flex bg-slate-950">
                <ScrollArea className="flex-1 w-full">
                  <pre className="p-6 text-[13px] font-mono text-slate-300 leading-relaxed selection:bg-blue-500/30">
                    {detailResource ? yaml.dump(detailResource) : ''}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="json" className="flex-1 overflow-hidden m-0 data-[state=active]:flex bg-slate-950">
                <ScrollArea className="flex-1 w-full">
                  <pre className="p-6 text-[13px] font-mono text-slate-300 leading-relaxed selection:bg-blue-500/30">
                    {detailResource ? JSON.stringify(detailResource, null, 2) : ''}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="graph" className="flex-1 overflow-hidden m-0 data-[state=active]:flex bg-slate-950">
                {detailResource && <ResourceGraph cluster={selectedCluster} resource={detailResource} />}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateEditOpen} onOpenChange={setIsCreateEditOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col bg-slate-900 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md shrink-0">
            <DialogTitle className="text-xl font-bold flex items-center gap-3 text-white">
              {createEditMode === 'create' ? <Plus className="w-5 h-5 text-blue-400" /> : <Edit className="w-5 h-5 text-blue-400" />}
              {createEditMode === 'create' ? `Create ${selectedResource?.kind}` : `Edit ${selectedResource?.kind}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-4 bg-[#1e1e1e]">
            <textarea
              className="w-full h-full bg-transparent text-slate-300 font-mono text-sm outline-none resize-none"
              value={createEditYaml}
              onChange={(e) => setCreateEditYaml(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={() => setIsCreateEditOpen(false)} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
              Cancel
            </Button>
            <Button onClick={submitCreateEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
              {createEditMode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="pt-4 text-slate-600">
              Are you sure you want to delete the {selectedResource?.kind} <strong>{resourceToDelete?.metadata?.name}</strong>
              {resourceToDelete?.metadata?.namespace ? ` in namespace ${resourceToDelete.metadata.namespace}` : ''}?
              <br/><br/>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5 ${toastMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <ShieldAlert className="w-5 h-5 text-red-500" />}
          <span className="font-medium">{toastMessage.title}</span>
        </div>
      )}
    </div>
  );
}
