import React, { useState, useEffect } from 'react';
import { Search, Plus, Upload, ChevronRight, ChevronDown, Check, MoreVertical, Database, GitBranch, Folder, Trash2, CheckCircle2, LayoutList, FileText, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { KnowledgeTree } from '../components/KnowledgeTree';
import { syncKnowledgeTree, flattenKnowledgeTree, KnowledgeTreeNode, KnowledgeNode } from '../services/knowledgeService';
import { supabase } from '../supabaseClient';
import { cn } from '../lib/utils';
import { useSettings } from '../contexts/SettingsContext';
import { MathRenderer } from '../components/MathRenderer';
import { DeleteModal } from '../components/DeleteModal';

export const Questions = () => {
  const { language } = useSettings();
  const [questions, setQuestions] = useState<any[]>([]);
  const [treeNodes, setTreeNodes] = useState<KnowledgeTreeNode[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch knowledge nodes
      const nodesData = await syncKnowledgeTree();
      
      if (nodesData) {
        setTreeNodes(nodesData);
        setKnowledgeNodes(flattenKnowledgeTree(nodesData));
      }

      // Fetch questions
      const { data: qData } = await supabase
        .from('cau_hoi')
        .select(`
          ma_cau_hoi,
          noi_dung,
          tinh_trang,
          nguoi_tao,
          users:nguoi_tao ( ho_ten ),
          dap_an ( ma_dap_an, noi_dung, is_correct ),
          kien_thuc_cau_hoi (
            kien_thuc ( ten_kien_thuc )
          )
        `)
        .order('ma_cau_hoi', { ascending: false });

      if (qData) {
        setQuestions(qData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Approved':
      case 'approved':
      case 'Đã duyệt':
        return 'text-secondary';
      case 'Review':
      case 'review':
      case 'draft':
      case 'Chờ hiệu chuẩn':
        return 'text-outline-variant';
      default:
        return 'text-primary';
    }
  };

  const getDescendantIds = (nodeId: string): string[] => {
    const ids = new Set<string>();
    ids.add(nodeId);
    
    const startNode = knowledgeNodes.find(n => n.ma_kien_thuc === nodeId);
    if (!startNode) return Array.from(ids);
    
    const findChildren = (parentId: string) => {
      const children = knowledgeNodes.filter(n => n.ma_kt_parent === parentId);
      children.forEach(c => {
        ids.add(c.ma_kien_thuc);
        findChildren(c.ma_kien_thuc);
      });
    };
    
    findChildren(startNode.ma_kien_thuc);
    return Array.from(ids);
  };

  const getDescendantNamesById = (nodeId: string): string[] => {
    const ids = getDescendantIds(nodeId);
    return knowledgeNodes.filter(n => ids.includes(n.ma_kien_thuc)).map(n => n.ten_kien_thuc);
  };

  const getFullPath = (nodeName: string): string => {
    const node = knowledgeNodes.find(n => n.ten_kien_thuc === nodeName);
    if (!node) return nodeName;
    
    if (!node.ma_kt_parent) return node.ten_kien_thuc;
    
    const parent = knowledgeNodes.find(n => n.ma_kien_thuc === node.ma_kt_parent);
    if (!parent) return node.ten_kien_thuc;
    
    return `${getFullPath(parent.ten_kien_thuc)}/${node.ten_kien_thuc}`;
  };

  const handleBulkDelete = async () => {
    try {
      if (selectedItems.length === 0) return;
      
      const { data: dapAnData } = await supabase.from('dap_an').select('ma_dap_an').in('ma_cau_hoi', selectedItems);
      if (dapAnData && dapAnData.length > 0) {
        await supabase.from('dap_an').delete().in('ma_cau_hoi', selectedItems);
      }
      
      await supabase.from('kien_thuc_cau_hoi').delete().in('ma_cau_hoi', selectedItems);
      await supabase.from('ky_thi_cau_hoi').delete().in('ma_cau_hoi', selectedItems);

      const { error } = await supabase.from('cau_hoi').delete().in('ma_cau_hoi', selectedItems);
      if (error) throw error;
      
      setSelectedItems([]);
      setBulkDeleteConfirm(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Error bulk deleting: ' + err.message);
    }
  };

  const toggleSelection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredQuestions.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredQuestions.map(q => q.ma_cau_hoi));
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.noi_dung?.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesNode = true;
    if (selectedNodeId) {
      const descendantNames = getDescendantNamesById(selectedNodeId);
      matchesNode = q.kien_thuc_cau_hoi?.some((k: any) => descendantNames.includes(k.kien_thuc?.ten_kien_thuc));
    }
    return matchesSearch && matchesNode;
  });

  return (
    <div className="flex flex-col h-full -m-8 bg-background">
      {/* Top Search Bar */}
      <div className="flex items-center px-6 py-3 border-b border-outline-variant/30 shrink-0 bg-surface">
        <div className="flex items-center w-[600px] bg-background border border-outline-variant/30 rounded-md px-3 py-1.5 focus-within:border-primary transition-colors">
          <span className="text-primary font-mono mr-2">{'>'}</span>
          <input 
            type="text" 
            placeholder={language === 'vi' ? "grep tìm kiếm trong ngân hàng..." : "grep search knowledge base..."}
            className="flex-1 bg-transparent border-none text-on-surface focus:outline-none font-mono text-sm placeholder:text-outline-variant"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tree */}
        <div className="w-72 border-r border-outline-variant/30 bg-surface flex flex-col shrink-0">
          <KnowledgeTree 
            nodes={treeNodes} 
            selectedNodeId={selectedNodeId} 
            onSelectNode={setSelectedNodeId}
            showSearch={false}
            renderExtra={(node) => {
              const descendantNames = getDescendantNamesById(node.ma_kien_thuc);
              const count = questions.filter(q => q.kien_thuc_cau_hoi?.some((k: any) => descendantNames.includes(k.kien_thuc?.ten_kien_thuc))).length;
              return <span className="ml-auto text-outline-variant text-xs pl-2 shrink-0 font-mono">[{count}]</span>;
            }}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 shrink-0 bg-surface">
            <div className="flex items-center gap-3">
              <Link to="/questions/new" className="px-4 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Tạo Câu Hỏi' : 'New Question'}
              </Link>
              {selectedItems.length > 0 && (
                <button 
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2 bg-error/10 hover:bg-error/20 text-error border border-error/20 rounded-lg text-sm font-medium transition-colors flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Xóa' : 'Delete'} ({selectedItems.length})
                </button>
              )}
            </div>
            <div className="text-xs font-mono text-outline flex items-center">
              rows 1-{Math.min(10, filteredQuestions.length)} / {filteredQuestions.length}
              <div className="flex items-center ml-4 gap-1">
                <button className="p-1 hover:text-on-surface transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                <button className="p-1 hover:text-on-surface transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center text-outline font-mono text-sm">
                <Database className="w-8 h-8 mb-4 text-primary animate-pulse opacity-50" />
                Scanning knowledge matrix...
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-outline font-mono text-sm">
                No question nodes found in this sector.
              </div>
            ) : (
              <div className="p-6 space-y-4 max-w-5xl mx-auto">
              {filteredQuestions.map((q) => {
                const isExpanded = expandedId === q.ma_cau_hoi;
                const pathName = q.kien_thuc_cau_hoi?.[0]?.kien_thuc?.ten_kien_thuc 
                  ? getFullPath(q.kien_thuc_cau_hoi[0].kien_thuc.ten_kien_thuc) 
                  : "Uncategorized Node";
                const shortId = q.ma_cau_hoi ? `Q-${q.ma_cau_hoi.toString().substring(0,4).toUpperCase()}` : "Q-NEW";
                const answers = q.dap_an || [];
                const creatorName = q.users?.ho_ten || q.nguoi_tao?.substring(0, 8) || "System Core";
                
                return (
                  <div key={q.ma_cau_hoi} className={cn(
                    "rounded-xl border transition-all duration-300 flex flex-col overflow-hidden bg-surface",
                    isExpanded ? "border-primary/50 shadow-lg shadow-primary/5" : "border-outline-variant/20 hover:border-outline-variant/50 hover:bg-surface-bright",
                    selectedItems.includes(q.ma_cau_hoi) && "border-primary bg-primary/5"
                  )}>
                    {/* Compact Card Header */}
                    <div 
                      className="p-5 flex items-center cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : q.ma_cau_hoi)}
                    >
                      <div className="flex items-center mr-6 shrink-0">
                        <input 
                          type="checkbox" 
                          className="mr-4 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer bg-background"
                          checked={selectedItems.includes(q.ma_cau_hoi)}
                          onChange={(e) => toggleSelection(q.ma_cau_hoi, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className={cn("flex flex-col", isExpanded ? "text-primary" : "text-on-surface")}>
                           <span className="font-mono font-bold tracking-wider">{shortId}</span>
                           <span className="text-[10px] font-mono text-outline-variant uppercase">{creatorName}</span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col min-w-0 pr-6">
                        <div className="text-sm font-medium text-on-surface line-clamp-1 mb-1 font-sans">
                           <MathRenderer content={q.noi_dung || "No content"} />
                        </div>
                        <div className="flex items-center gap-2">
                           <Folder className="w-3 h-3 text-outline" />
                           <span className="font-mono text-xs text-outline truncate">{pathName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0">
                        <div className="font-mono text-xs">
                          {q.tinh_trang === 'draft' || q.tinh_trang === 'Review' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-surface border border-outline-variant/30 text-outline-variant">
                              <MoreVertical className="w-3 h-3 mr-1" /> Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-secondary/10 border border-secondary/20 text-secondary">
                              <Check className="w-3 h-3 mr-1" /> Approved
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 border-l border-outline-variant/20 pl-6">
                          <Link to={`/questions/edit/${q.ma_cau_hoi}`} onClick={(e) => e.stopPropagation()} className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                          </Link>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete(q);
                            }}
                            className="p-2 text-outline hover:text-error hover:bg-error/10 rounded transition-colors" title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className={cn("w-5 h-5 ml-2 text-outline transition-transform", isExpanded && "rotate-90 text-primary")} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detailed View */}
                    {isExpanded && (
                      <div className="p-6 bg-background border-t border-outline-variant/10">
                        <div className="grid grid-cols-12 gap-8">
                          {/* Left: Question & Answers */}
                          <div className="col-span-8">
                            <h4 className="text-xs font-mono font-bold text-outline uppercase tracking-widest mb-4 flex items-center">
                              <FileText className="w-4 h-4 mr-2" />
                              Content Node
                            </h4>
                            <div className="font-sans text-sm text-on-surface-variant leading-relaxed mb-6 bg-surface p-5 rounded-lg border border-outline-variant/20">
                              <MathRenderer content={q.noi_dung || ""} />
                            </div>
                            
                            <h4 className="text-xs font-mono font-bold text-outline uppercase tracking-widest mb-4 flex items-center">
                              <LayoutList className="w-4 h-4 mr-2" />
                              Solution Vectors
                            </h4>
                            <div className="space-y-2">
                              {answers.map((ans: any, idx: number) => {
                                const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                                return (
                                  <div 
                                    key={ans.ma_dap_an} 
                                    className={cn(
                                      "flex items-center px-4 py-3 rounded-lg font-sans text-sm transition-all border",
                                      ans.is_correct 
                                        ? "bg-secondary/5 border-secondary/30 text-secondary font-medium" 
                                        : "bg-surface border-outline-variant/20 text-on-surface hover:bg-surface-bright hover:border-outline-variant/40"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold shrink-0 mr-4",
                                      ans.is_correct ? "bg-secondary text-on-secondary" : "bg-outline-variant/20 text-outline"
                                    )}>
                                      {letters[idx] || '?'}
                                    </div>
                                    <span><MathRenderer content={ans.noi_dung || ""} /></span>
                                    {ans.is_correct && <CheckCircle2 className="w-5 h-5 ml-auto text-secondary shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Right: Metadata */}
                          <div className="col-span-4 space-y-6">
                            <div>
                              <h4 className="text-xs font-mono font-bold text-outline uppercase tracking-widest mb-3">Classification</h4>
                              <div className="space-y-2 font-mono text-xs">
                                <div className="flex justify-between items-center py-1 border-b border-outline-variant/10">
                                  <span className="text-outline">Type</span>
                                  <span className="text-on-surface">{q.loai_cau_hoi || 'Multiple Choice'}</span>
                                </div>
                                <div className="flex justify-between items-center py-1 border-b border-outline-variant/10">
                                  <span className="text-outline">Cognitive Lvl</span>
                                  <span className="text-primary font-bold">Lvl {q.muc_do || 1}</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                  <span className="text-outline">Created</span>
                                  <span className="text-on-surface">{q.ngay_tao ? new Date(q.ngay_tao).toLocaleDateString() : 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-mono font-bold text-outline uppercase tracking-widest mb-3 flex items-center">
                                <Network className="w-4 h-4 mr-2" />
                                IRT Metrics (Simulation)
                              </h4>
                              <div className="space-y-3 font-mono text-xs">
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-outline">Difficulty (b)</span>
                                    <span className="text-on-surface">{q.b_diff?.toFixed(2) || '0.00'}</span>
                                  </div>
                                  <div className="h-1 w-full bg-background rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (q.b_diff + 3) / 6 * 100))}%` }}></div>
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-outline">Discrimination (a)</span>
                                    <span className="text-on-surface">{q.a_discr?.toFixed(2) || '1.00'}</span>
                                  </div>
                                  <div className="h-1 w-full bg-background rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, Math.max(0, q.a_discr / 3 * 100))}%` }}></div>
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-outline">Guessing (c)</span>
                                    <span className="text-on-surface">{q.c_guess?.toFixed(2) || '0.20'}</span>
                                  </div>
                                  <div className="h-1 w-full bg-background rounded-full overflow-hidden">
                                    <div className="h-full bg-secondary" style={{ width: `${Math.min(100, Math.max(0, q.c_guess * 100))}%` }}></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {itemToDelete && (
        <DeleteModal
          isOpen={true}
          onClose={() => setItemToDelete(null)}
          onConfirm={async () => {
            try {
              await supabase.from('kien_thuc_cau_hoi').delete().eq('ma_cau_hoi', itemToDelete.ma_cau_hoi);
              await supabase.from('ky_thi_cau_hoi').delete().eq('ma_cau_hoi', itemToDelete.ma_cau_hoi);
              const { data: dapAnData } = await supabase.from('dap_an').select('ma_dap_an').eq('ma_cau_hoi', itemToDelete.ma_cau_hoi);
              if (dapAnData && dapAnData.length > 0) {
                await supabase.from('dap_an').delete().eq('ma_cau_hoi', itemToDelete.ma_cau_hoi);
              }
              
              const { error } = await supabase.from('cau_hoi').delete().eq('ma_cau_hoi', itemToDelete.ma_cau_hoi);
              if (error) throw error;
              
              setSelectedItems(prev => prev.filter(id => id !== itemToDelete.ma_cau_hoi));
              fetchData();
              setItemToDelete(null);
            } catch(err) {
              console.error(err);
              alert('Error deleting question');
            }
          }}
          title={
            <span>
              {language === 'vi' ? 'Xóa Câu Hỏi ' : 'Delete Question '}
              <span className="text-error">{itemToDelete.ma_cau_hoi}</span>
            </span>
          }
          description={
            language === 'vi' 
              ? `Hành động này sẽ xóa vĩnh viễn câu hỏi này khỏi ngân hàng câu hỏi. Các đề thi đang sử dụng câu hỏi này có thể bị ảnh hưởng.`
              : `This will permanently remove this question from the question bank. Exams using this question may be affected.`
          }
          stats={[
            { icon: <Database className="w-5 h-5" />, value: "100%", label: language === 'vi' ? "XÓA DỮ LIỆU IRT" : "IRT DATA PURGED" },
            { icon: <GitBranch className="w-5 h-5" />, value: itemToDelete.tinh_trang === 'duyet' ? (language === 'vi' ? "Cao" : "High") : (language === 'vi' ? "Thấp" : "Low"), label: language === 'vi' ? "ẢNH HƯỞNG MA TRẬN" : "MATRIX IMPACT" }
          ]}
          slideText={language === 'vi' ? "KÉO ĐỂ THỰC THI XÓA" : "SLIDE TO EXECUTE PURGE"}
        />
      )}

      {bulkDeleteConfirm && (
        <DeleteModal
          isOpen={true}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title={language === 'vi' ? 'Xóa Nhiều Câu Hỏi' : 'Bulk Delete Questions'}
          description={
            language === 'vi' 
              ? `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedItems.length} câu hỏi đã chọn? Dữ liệu các đề thi liên quan có thể bị ảnh hưởng.`
              : `Are you sure you want to permanently delete ${selectedItems.length} selected questions? Exam data may be affected.`
          }
          stats={[
            { icon: <Database className="w-5 h-5" />, value: selectedItems.length.toString(), label: language === 'vi' ? "SỐ CÂU HỎI" : "QUESTION COUNT" }
          ]}
          slideText={language === 'vi' ? "KÉO ĐỂ THỰC THI XÓA" : "SLIDE TO EXECUTE PURGE"}
        />
      )}
    </div>
  );
};
