import React, { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { listResources } from '../lib/k8s';
import { Loader2 } from 'lucide-react';

interface ResourceGraphProps {
  cluster: string;
  resource: any;
}

export default function ResourceGraph({ cluster, resource }: ResourceGraphProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGraphData = async () => {
      setLoading(true);
      try {
        const namespace = resource.metadata.namespace;
        const kind = resource.kind;
        const name = resource.metadata.name;
        const uid = resource.metadata.uid;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Add root node
        newNodes.push({
          id: uid,
          position: { x: 250, y: 50 },
          data: { label: `${kind}: ${name}` },
          style: { background: '#eff6ff', color: '#1e3a8a', border: '2px solid #3b82f6', borderRadius: '8px', padding: '10px', fontWeight: 'bold' }
        });

        let yOffset = 150;

        if (kind === 'Deployment') {
          // Fetch ReplicaSets
          const rsData = await listResources(cluster, 'apps', 'v1', 'replicasets', namespace);
          const relatedRs = rsData.items?.filter((rs: any) => 
            rs.metadata.ownerReferences?.some((ref: any) => ref.uid === uid)
          ) || [];

          // Fetch Pods
          const podData = await listResources(cluster, '', 'v1', 'pods', namespace);

          relatedRs.forEach((rs: any, i: number) => {
            newNodes.push({
              id: rs.metadata.uid,
              position: { x: 100 + i * 200, y: yOffset },
              data: { label: `ReplicaSet: ${rs.metadata.name}` },
              style: { background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }
            });
            newEdges.push({
              id: `e-${uid}-${rs.metadata.uid}`,
              source: uid,
              target: rs.metadata.uid,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#94a3b8' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
            });

            const relatedPods = podData.items?.filter((pod: any) => 
              pod.metadata.ownerReferences?.some((ref: any) => ref.uid === rs.metadata.uid)
            ) || [];

            relatedPods.forEach((pod: any, j: number) => {
              newNodes.push({
                id: pod.metadata.uid,
                position: { x: 50 + i * 200 + j * 150, y: yOffset + 100 },
                data: { label: `Pod: ${pod.metadata.name}\n(${pod.status?.phase})` },
                style: { background: pod.status?.phase === 'Running' ? '#ecfdf5' : '#fef2f2', color: pod.status?.phase === 'Running' ? '#065f46' : '#991b1b', border: pod.status?.phase === 'Running' ? '1px solid #10b981' : '1px solid #ef4444', borderRadius: '8px', padding: '10px' }
              });
              newEdges.push({
                id: `e-${rs.metadata.uid}-${pod.metadata.uid}`,
                source: rs.metadata.uid,
                target: pod.metadata.uid,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#94a3b8' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
              });
            });
          });
        } else if (kind === 'Service') {
          const selector = resource.spec?.selector;
          if (selector) {
            const podData = await listResources(cluster, '', 'v1', 'pods', namespace);
            const relatedPods = podData.items?.filter((pod: any) => {
              const labels = pod.metadata.labels || {};
              return Object.entries(selector).every(([k, v]) => labels[k] === v);
            }) || [];

            relatedPods.forEach((pod: any, i: number) => {
              newNodes.push({
                id: pod.metadata.uid,
                position: { x: 100 + i * 200, y: yOffset },
                data: { label: `Pod: ${pod.metadata.name}\n(${pod.status?.phase})` },
                style: { background: pod.status?.phase === 'Running' ? '#ecfdf5' : '#fef2f2', color: pod.status?.phase === 'Running' ? '#065f46' : '#991b1b', border: pod.status?.phase === 'Running' ? '1px solid #10b981' : '1px solid #ef4444', borderRadius: '8px', padding: '10px' }
              });
              newEdges.push({
                id: `e-${uid}-${pod.metadata.uid}`,
                source: uid,
                target: pod.metadata.uid,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#94a3b8' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
              });
            });
          }
        } else if (kind === 'Pod') {
          // Show owner
          const owners = resource.metadata.ownerReferences || [];
          owners.forEach((owner: any, i: number) => {
            newNodes.push({
              id: owner.uid,
              position: { x: 250, y: yOffset - 200 },
              data: { label: `${owner.kind}: ${owner.name}` },
              style: { background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }
            });
            newEdges.push({
              id: `e-${owner.uid}-${uid}`,
              source: owner.uid,
              target: uid,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#94a3b8' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
            });
          });
        }

        setNodes(newNodes);
        setEdges(newEdges);
      } catch (err) {
        console.error("Failed to fetch graph data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();
  }, [cluster, resource]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (nodes.length <= 1 && resource.kind !== 'Pod') {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        No relationships found for this resource.
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-50">
      <ReactFlow nodes={nodes} edges={edges} fitView colorMode="light">
        <Background color="#cbd5e1" />
        <Controls className="bg-white border-slate-200 fill-slate-600" />
        <MiniMap nodeColor="#3b82f6" maskColor="rgba(248, 250, 252, 0.7)" className="bg-white" />
      </ReactFlow>
    </div>
  );
}
