import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, NodeType, InteractionType } from '../types';

interface NetworkGraphProps {
  data: GraphData;
  highlightedNodeIds: string[];
  studentRates?: Record<string, number>;
  selectedNode?: GraphNode | null;
  selectedResource?: string | null;
  onNodeClick: (node: GraphNode) => void;
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({ data, highlightedNodeIds, studentRates, selectedNode, selectedResource, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data.nodes.length || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    const rootG = svg.append("g");

    const color = (d: GraphNode) => {
      if (selectedNode && d.id === selectedNode.id && d.type === NodeType.STUDENT) {
        return "#475569";
      }
      switch (d.type) {
        case NodeType.TEACHER: return "#7c3aed";
        case NodeType.KNOWLEDGE: return "#059669";
        case NodeType.STUDENT: return "#94a3b8";
        default: return "#ccc";
      }
    };

    const linkColor = (type: InteractionType) => {
        return type === InteractionType.PHYSICAL ? "#64748b" : "#3b82f6";
    };

    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-60))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => (d.val || 8) + 4));

    const link = rootG.append("g")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke-width", (d) => Math.sqrt(d.value))
      .attr("stroke", (d) => linkColor(d.type))
      .attr("stroke-dasharray", (d) => (d.type === InteractionType.PLATFORM || d.type === 'SOCIAL') ? "4, 2" : null)
      .attr("class", (d) => (d.type === InteractionType.PLATFORM || d.type === 'SOCIAL') ? "platform-link" : "physical-link");

    const node = rootG.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", (d) => d.val || 8)
      .attr("fill", (d) => color(d))
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .call(drag(simulation) as any);

    const labels = rootG.append("g")
      .selectAll("text")
      .data(data.nodes.filter(n => n.type !== NodeType.STUDENT))
      .join("text")
      .text(d => d.name)
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("fill", "#334155")
      .attr("dx", 14)
      .attr("dy", 4)
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px rgba(255,255,255,0.8)"); 
      
    node.append("title")
      .text(d => d.name);

    const margin = 40;
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x = Math.max(margin, Math.min(width - margin, d.x)))
        .attr("cy", (d: any) => d.y = Math.max(margin, Math.min(height - margin, d.y)));

      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
            rootG.attr("transform", event.transform);
        });
        
    svg.call(zoom);

    simulation.on("end", () => {
      const bounds = rootG.node()?.getBBox();
      if (!bounds || bounds.width === 0 || bounds.height === 0) return;
      const scale = 0.85 / Math.max(bounds.width / width, bounds.height / height);
      const clampedScale = Math.max(0.3, Math.min(4, scale));
      const midX = bounds.x + bounds.width / 2;
      const midY = bounds.y + bounds.height / 2;
      const translate: [number, number] = [width / 2 - clampedScale * midX, height / 2 - clampedScale * midY];
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(clampedScale));
    });

    // Drag behavior helper
    function drag(sim: any) {
      function dragstarted(event: any) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) sim.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    // Clean up
    return () => {
      simulation.stop();
    };
  }, [data]);

  // Effect for highlighting
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    const getColor = (d: any) => {
        if (selectedNode && d.id === selectedNode.id && d.type === NodeType.STUDENT) {
            return "#475569";
        }
        if (d.type === NodeType.STUDENT && studentRates?.[d.id] !== undefined) {
            const rate = studentRates[d.id];
            return rate >= 4 ? '#22c55e' : '#ef4444';
        }
        switch (d.type) {
            case NodeType.TEACHER: return "#7c3aed";
            case NodeType.KNOWLEDGE: return "#059669";
            case NodeType.STUDENT: return "#94a3b8";
            default: return "#ccc";
        }
    };
    
    // Dim everyone first if something is highlighted
    if (highlightedNodeIds.length > 0) {
        svg.selectAll("circle")
           .transition().duration(300)
           .attr("opacity", 0.1)
           .attr("stroke-width", 0);
           
        svg.selectAll("line")
           .transition().duration(300)
           .attr("opacity", 0.05);

        const shouldHighlightNode = (d: any) => {
            if (selectedNode && d.id === selectedNode.id) return true;
            if (selectedResource && d.type === NodeType.STUDENT) {
                if (studentRates?.[d.id] !== undefined) return true;
            }
            if (!highlightedNodeIds.includes(d.id)) return false;
            return true;
        };

        // Highlight specific nodes
        svg.selectAll("circle")
           .filter((d: any) => shouldHighlightNode(d))
           .transition().duration(300)
           .attr("opacity", 1)
           .attr("r", (d: any) => d.val * 1.3) // Pulse effect
           .attr("stroke", "#fff")
           .attr("stroke-width", 2)
           .attr("filter", "drop-shadow(0px 4px 4px rgba(0,0,0,0.2))")
           .attr("fill", (d: any) => getColor(d));
    } else {
        // Reset
        svg.selectAll("circle")
           .transition().duration(300)
           .attr("opacity", 1)
           .attr("r", (d: any) => d.val)
           .attr("stroke", "#fff")
           .attr("stroke-width", 2)
           .attr("filter", null)
           .attr("fill", (d: any) => getColor(d));
           
        svg.selectAll("line")
           .transition().duration(300)
           .attr("opacity", 0.6);
    }
    
  }, [highlightedNodeIds, data, studentRates, selectedNode, selectedResource]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden relative">
        <svg ref={svgRef} className="w-full h-full"></svg>
        
        {/* Glassmorphism Legend */}
        <div className="absolute bottom-5 right-5 bg-white/80 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/50 text-xs space-y-3 z-10 ring-1 ring-slate-900/5 select-none">
            <div>
                <div className="font-bold text-slate-500 mb-2 uppercase tracking-wider text-[10px]">节点类型</div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-violet-600 shadow-sm"></span> 
                        <span className="text-slate-600 font-medium">教师 (Teacher)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-600 shadow-sm"></span> 
                        <span className="text-slate-600 font-medium">知识点 (Knowledge)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-slate-400 shadow-sm"></span> 
                        <span className="text-slate-600 font-medium">学生 (Student)</span>
                    </div>
                </div>
            </div>
            
            <div className="pt-2 border-t border-slate-200/60">
                <div className="font-bold text-slate-500 mb-2 uppercase tracking-wider text-[10px]">交互类型</div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-0.5 bg-slate-500 rounded-full"></span> 
                        <span className="text-slate-600 font-medium">物理空间采集</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                            <span className="w-2 h-0.5 bg-blue-500 rounded-full"></span>
                            <span className="w-2 h-0.5 bg-blue-500 rounded-full"></span>
                            <span className="w-2 h-0.5 bg-blue-500 rounded-full"></span>
                        </div>
                        <span className="text-slate-600 font-medium">平台采集</span>
                    </div>
                </div>
            </div>

            {studentRates && Object.keys(studentRates).length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 animate-in fade-in">
                    <div className="font-bold text-slate-500 mb-2 uppercase tracking-wider text-[10px]">资源反馈</div>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] ring-2 ring-green-100"></span>
                            <span className="text-slate-700 font-bold">高接受度 (rate ≥ 4)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] ring-2 ring-red-100"></span>
                            <span className="text-slate-700 font-bold">低接受度 (rate ≤ 3)</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default NetworkGraph;