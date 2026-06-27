import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, Search, BookOpen, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSettings } from '../contexts/SettingsContext';
import { KnowledgeTreeNode } from '../services/knowledgeService';

interface KnowledgeTreeProps {
  nodes: KnowledgeTreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  renderExtra?: (node: KnowledgeTreeNode) => React.ReactNode;
  showSearch?: boolean;
}

export const KnowledgeTree: React.FC<KnowledgeTreeProps> = ({ 
  nodes, 
  selectedNodeId, 
  onSelectNode, 
  renderExtra,
  showSearch = true 
}) => {
  const { language } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Auto-expand root nodes when data is loaded
  React.useEffect(() => {
    if (nodes.length > 0 && Object.keys(expandedNodes).length === 0) {
      const initial: Record<string, boolean> = {};
      nodes.forEach(n => initial[n.ma_kien_thuc] = true);
      setExpandedNodes(initial);
    }
  }, [nodes]);

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderTree = (currentNodes: KnowledgeTreeNode[], depth = 0) => {
    let displayNodes = currentNodes;
    
    if (searchTerm && depth === 0) {
      const lowerSearch = searchTerm.toLowerCase();
      const hasMatchingDescendant = (node: KnowledgeTreeNode): boolean => {
        if (node.ten_kien_thuc.toLowerCase().includes(lowerSearch) || node.ma_kien_thuc.toLowerCase().includes(lowerSearch)) return true;
        return node.children.some(hasMatchingDescendant);
      };
      displayNodes = displayNodes.filter(hasMatchingDescendant);
    }

    if (displayNodes.length === 0) return null;
    
    return (
      <div className={cn("space-y-0.5", depth > 0 && "border-l border-outline-variant/30 pl-3 ml-2 mt-0.5")}>
        {displayNodes.map(node => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = expandedNodes[node.ma_kien_thuc] || (searchTerm !== '');
          const isSelected = selectedNodeId === node.ma_kien_thuc;

          if (searchTerm) {
             const lowerSearch = searchTerm.toLowerCase();
             const matches = node.ten_kien_thuc.toLowerCase().includes(lowerSearch) || node.ma_kien_thuc.toLowerCase().includes(lowerSearch);
             const hasMatchingDescendant = (n: KnowledgeTreeNode): boolean => {
                return n.children.some(c => c.ten_kien_thuc.toLowerCase().includes(lowerSearch) || c.ma_kien_thuc.toLowerCase().includes(lowerSearch) || hasMatchingDescendant(c));
             };
             if (!matches && !hasMatchingDescendant(node)) return null;
          }

          return (
            <div key={node.ma_kien_thuc} className="relative">
              {depth > 0 && (
                <div className="absolute top-4 -left-3 w-3 border-t border-outline-variant/30" />
              )}
              <div 
                className={cn(
                  "flex items-center justify-between py-2 rounded-r-lg px-2 cursor-pointer transition-all border-l-2",
                  depth === 0 
                    ? "mb-2 mt-4 first:mt-0 hover:bg-surface-bright/50 border-transparent" 
                    : (isSelected ? "bg-primary/5 border-primary text-primary" : "border-transparent hover:bg-surface-bright text-on-surface-variant")
                )}
                onClick={() => {
                  if (depth === 0) {
                    if (hasChildren) toggleNode(node.ma_kien_thuc);
                  } else {
                    onSelectNode(node.ma_kien_thuc);
                  }
                }}
              >
                <div className="flex items-center flex-1 overflow-hidden">
                  <div 
                    className="w-6 h-6 flex items-center justify-center shrink-0 mr-1 rounded-md hover:bg-surface-dim cursor-pointer transition-colors"
                    onClick={(e) => {
                      if (hasChildren) {
                        e.stopPropagation();
                        toggleNode(node.ma_kien_thuc);
                      }
                    }}
                  >
                    {hasChildren ? (
                      isExpanded ? <ChevronDown className="w-4 h-4 text-outline" /> : <ChevronRight className="w-4 h-4 text-outline" />
                    ) : (
                      <span className="w-4 h-4" />
                    )}
                  </div>
                  {depth === 0 ? (
                    <BookOpen className="w-5 h-5 mr-3 shrink-0 text-primary" />
                  ) : hasChildren ? (
                    <Folder className={cn("w-4 h-4 mr-2 shrink-0", isSelected ? 'text-primary' : 'text-primary/70')} />
                  ) : (
                    <FileText className={cn("w-4 h-4 mr-2 shrink-0", isSelected ? 'text-primary' : 'text-outline/70')} />
                  )}
                  <span className={cn("truncate text-sm", depth === 0 ? 'font-display font-bold text-on-surface text-base uppercase tracking-wide' : (isSelected ? 'font-bold text-primary' : 'text-on-surface'))}>{node.ten_kien_thuc}</span>
                </div>
                {renderExtra && renderExtra(node)}
              </div>
              {hasChildren && isExpanded && renderTree(node.children, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {showSearch && (
        <div className="p-4 border-b border-outline-variant/30 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input 
              type="text" 
              placeholder={language === 'vi' ? 'Tìm kiếm...' : 'Filter nodes...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-outline-variant rounded-md pl-9 pr-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
         <div 
            className={cn(
              "group flex items-center justify-between py-1.5 rounded-md px-2 cursor-pointer transition-all mb-2",
              selectedNodeId === null ? "bg-primary/10 text-primary" : "hover:bg-surface-bright text-on-surface"
            )}
            onClick={() => onSelectNode(null)}
          >
            <div className="flex items-center flex-1 overflow-hidden">
              <div className="w-5 h-5 flex items-center justify-center shrink-0 mr-1">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
              <Folder className={cn("w-4 h-4 mr-2 shrink-0", selectedNodeId === null ? 'text-primary' : 'text-primary/70')} />
              <span className={cn("truncate font-bold", selectedNodeId === null ? 'text-primary' : 'text-on-surface')}>
                {language === 'vi' ? "Tất cả kiến thức" : "All Knowledge"}
              </span>
            </div>
          </div>
          <div className="ml-5">
            {renderTree(nodes, 0)}
          </div>
      </div>
    </div>
  );
};
