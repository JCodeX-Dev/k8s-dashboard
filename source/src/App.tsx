import React, { useState, useEffect } from 'react';
import { Cluster, getClusters, getDiscovery, listResources, getResource } from './lib/k8s';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/ui/dialog';
import { ScrollArea } from './components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Label } from './components/ui/label';
import { Server, ShieldAlert, Loader2, Box, Layers, RefreshCw, Eye, Activity } from 'lucide-react';
import yaml from 'js-yaml';

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
  
  // Resource List State
  const [resources, setResources] = useState<any[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState('');

  // Resource Detail State
  const [detailResource, setDetailResource] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
    } else {
      setDiscovery([]);
      setSelectedResource(null);
    }
  }, [selectedCluster]);

  const fetchDiscovery = async (clusterName: string) => {
    setIsLoadingDiscovery(true);
    try {
      const data = await getDiscovery(clusterName);
      setDiscovery(data || []);
      
      // Default selection to Pods
      if (data && data.length > 0) {
        const v1 = data.find((r: any) => r.groupVersion === 'v1');
        if (v1) {
          const pods = v1.resources.find((r: any) => r.name === 'pods');
          if (pods) {
            setSelectedGroupVersion('v1');
            setSelectedResource(pods);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch discovery", err);
    } finally {
      setIsLoadingDiscovery(false);
    }
  };

  useEffect(() => {
    if (selectedCluster && selectedResource) {
      fetchResources();
    }
  }, [selectedCluster, selectedResource, selectedNamespace]);

  const parseGroupVersion = (gv: string) => {
    const parts = gv.split('/');
    if (parts.length === 1) return { group: '', version: parts[0] };
    return { group: parts[0], version: parts[1] };
  };

  const fetchResources = async () => {
    if (!selectedCluster || !selectedResource) return;
    setIsLoadingResources(true);
    setResourceError('');
    try {
      const { group, version } = parseGroupVersion(selectedGroupVersion);
      const data = await listResources(selectedCluster, group, version, selectedResource.name, selectedResource.namespaced ? selectedNamespace : undefined);
      setResources(data.items || []);
    } catch (err: any) {
      setResourceError(err.message);
      setResources([]);
    } finally {
      setIsLoadingResources(false);
    }
  };

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

  // Group resources for sidebar
  const groupedResources = React.useMemo(() => {
    const groups: Record<string, any[]> = {
      'Workloads': [],
      'Network': [],
      'Config & Storage': [],
      'Cluster': [],
      'Custom Resources': []
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
          groups['Custom Resources'].push(item);
        }
      });
    });

    // Sort within groups
    Object.keys(groups).forEach(k => {
      groups[k].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [discovery]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 border-b flex items-center px-4 bg-card text-card-foreground shrink-0">
        <Box className="w-6 h-6 mr-2 text-primary" />
        <h1 className="font-bold text-lg tracking-tight">KubeDash</h1>
        
        <div className="ml-auto flex items-center gap-4 text-sm">
          {clusters.length > 0 ? (
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <select 
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedCluster}
                onChange={(e) => setSelectedCluster(e.target.value)}
              >
                {clusters.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.status})</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="w-4 h-4" />
              Waiting for agents...
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {clusters.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Server className="w-16 h-16 mb-4 opacity-20" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Clusters Connected</h2>
            <p className="max-w-md text-center">
              Deploy the KubeDash agent to your Kubernetes clusters to see them appear here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <div className="w-64 border-r bg-muted/30 flex flex-col shrink-0">
              <div className="p-4 border-b">
                <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Namespace</Label>
                <select 
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedNamespace}
                  onChange={(e) => setSelectedNamespace(e.target.value)}
                >
                  <option value="all">All Namespaces</option>
                  <option value="default">default</option>
                  <option value="kube-system">kube-system</option>
                </select>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-4">
                  {isLoadingDiscovery ? (
                    <div className="flex items-center justify-center p-4 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
                    </div>
                  ) : (
                    Object.entries(groupedResources).map(([groupName, items]) => {
                      if (items.length === 0) return null;
                      return (
                        <div key={groupName}>
                          <h3 className="px-2 text-xs font-semibold uppercase text-muted-foreground mb-1">{groupName}</h3>
                          <div className="space-y-0.5">
                            {items.map(item => (
                              <button
                                key={`${item.groupVersion}-${item.name}`}
                                onClick={() => {
                                  setSelectedGroupVersion(item.groupVersion);
                                  setSelectedResource(item);
                                }}
                                className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                                  selectedResource?.name === item.name && selectedGroupVersion === item.groupVersion
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {item.kind}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Content Area */}
            {selectedResource && (
              <div className="flex-1 flex flex-col overflow-hidden bg-background">
                <div className="h-14 border-b flex items-center px-6 shrink-0 justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedResource.kind}s</h2>
                    <p className="text-xs text-muted-foreground">{selectedGroupVersion} • {selectedResource.namespaced ? 'Namespaced' : 'Cluster-scoped'}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchResources} disabled={isLoadingResources}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingResources ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                
                <div className="flex-1 overflow-auto p-6">
                  {resourceError ? (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/20 flex items-start">
                      <ShieldAlert className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold">Error loading resources</h4>
                        <p className="text-sm mt-1">{resourceError}</p>
                      </div>
                    </div>
                  ) : isLoadingResources ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : resources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                      <Layers className="w-12 h-12 mb-4 opacity-20" />
                      <p>No {selectedResource.kind}s found in {selectedNamespace === 'all' ? 'any namespace' : `namespace ${selectedNamespace}`}.</p>
                    </div>
                  ) : (
                    <div className="border rounded-md bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            {selectedResource.namespaced && <TableHead>Namespace</TableHead>}
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resources.map((item, i) => (
                            <TableRow key={item.metadata?.uid || i}>
                              <TableCell className="font-medium">{item.metadata?.name}</TableCell>
                              {selectedResource.namespaced && <TableCell>{item.metadata?.namespace}</TableCell>}
                              <TableCell className="text-muted-foreground">
                                {item.metadata?.creationTimestamp ? new Date(item.metadata.creationTimestamp).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => handleViewDetail(item)}>
                                  <Eye className="w-4 h-4 mr-2" /> View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
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
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Box className="w-5 h-5 text-primary" />
              {detailResource?.metadata?.name}
            </DialogTitle>
            <DialogDescription>
              {detailResource?.kind} • {detailResource?.metadata?.namespace || 'Cluster-scoped'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6">
            <Tabs defaultValue="yaml" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 mb-4">
                <TabsTrigger value="yaml" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">YAML</TabsTrigger>
                <TabsTrigger value="json" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="yaml" className="flex-1 overflow-hidden m-0 data-[state=active]:flex">
                <ScrollArea className="flex-1 w-full rounded-md border bg-muted/50">
                  <pre className="p-4 text-xs font-mono text-foreground">
                    {detailResource ? yaml.dump(detailResource) : ''}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="json" className="flex-1 overflow-hidden m-0 data-[state=active]:flex">
                <ScrollArea className="flex-1 w-full rounded-md border bg-muted/50">
                  <pre className="p-4 text-xs font-mono text-foreground">
                    {detailResource ? JSON.stringify(detailResource, null, 2) : ''}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
