import React, { useState, useEffect } from 'react';
import { Search, Plus, Upload, ChevronRight, ChevronDown, Check, MoreVertical, Database, GitBranch, Folder, Trash2, CheckCircle2, LayoutList, FileText, Network, XCircle, Library, SearchCode, PackageOpen } from 'lucide-react';
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
      const { data: qData, error: fetchError } = await supabase
        .from('cau_hoi')
        .select(`
          ma_cau_hoi,
          noi_dung,
          tinh_trang,
          nguoi_tao,
          users!fk_ch_user_tao ( ho_ten ),
          dap_an ( ma_dap_an, noi_dung, is_correct ),
          kien_thuc_cau_hoi (
            kien_thuc ( ten_kien_thuc )
          ),
          ngu_lieu:ma_ngu_lieu (ma_ngu_lieu, noi_dung)
        `)
        .order('ma_cau_hoi', { ascending: false });

      if (fetchError) {
        console.error("Supabase Query Error:", fetchError);
        setQuestions([{ ma_cau_hoi: -1, noi_dung: 'ERROR: ' + JSON.stringify(fetchError), tinh_trang: 'draft' }]);
      }

      if (qData) {
        setQuestions(qData);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      setQuestions([{ ma_cau_hoi: -2, noi_dung: 'CATCH ERROR: ' + error.message, tinh_trang: 'draft' }]);
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
    const contentStr = q.noi_dung || "";
    const matchesSearch = contentStr.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesNode = true;
    if (selectedNodeId) {
      const descendantNames = getDescendantNamesById(selectedNodeId);
      matchesNode = q.kien_thuc_cau_hoi?.some((k: any) => descendantNames.includes(k.kien_thuc?.ten_kien_thuc));
    }
    return matchesSearch && matchesNode;
  });

  return (
    <div className="flex flex-col h-full -m-8 bg-background">
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-surface px-8 py-8 border-b border-outline-variant shrink-0 z-20 shadow-sm">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary via-primary to-secondary opacity-50" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center border border-secondary/20 shadow-inner">
              <Library className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-on-surface tracking-tight mb-1">
                {language === 'vi' ? 'Ngân hàng Câu hỏi' : 'Question Bank'}
              </h1>
              <p className="text-sm text-on-surface-variant font-medium">
                {language === 'vi' ? 'Quản lý, tìm kiếm và kiểm duyệt các câu hỏi trong hệ thống.' : 'Manage, search, and moderate questions in the system.'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center w-[400px] bg-background border border-outline-variant/50 rounded-xl px-4 py-2 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/10 transition-all shadow-sm">
              <SearchCode className="w-4 h-4 text-secondary mr-3" />
              <input 
                type="text" 
                placeholder={language === 'vi' ? "Tìm kiếm câu hỏi..." : "Search question bank..."}
                className="flex-1 bg-transparent border-none text-on-surface focus:outline-none font-medium text-sm placeholder:text-outline-variant"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Link to="/questions/new" className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center hover:-translate-y-0.5">
              <Plus className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Tạo Câu Hỏi' : 'New Question'}
            </Link>
          </div>
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
          <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 shrink-0 bg-surface/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer bg-background"
                  checked={selectedItems.length === filteredQuestions.length && filteredQuestions.length > 0}
                  onChange={toggleSelectAll}
                />
                <span className="text-sm font-medium text-outline group-hover:text-on-surface transition-colors">
                  {language === 'vi' ? 'Chọn tất cả' : 'Select All'}
                </span>
              </label>
              
              {selectedItems.length > 0 && (
                <button 
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2 bg-error text-on-primary rounded-lg text-sm font-bold shadow-lg shadow-error/20 hover:bg-error/90 transition-all flex items-center hover:-translate-y-0.5 ml-4"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Xóa' : 'Delete'} ({selectedItems.length})
                </button>
              )}
            </div>
            <div className="text-xs font-mono text-outline flex items-center">
              ROWS 1-{Math.min(10, filteredQuestions.length)} / {filteredQuestions.length}
              <div className="flex items-center ml-4 gap-1">
                <button className="p-1 hover:text-on-surface transition-colors disabled:opacity-30"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                <button className="p-1 hover:text-on-surface transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-background">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-outline animate-in fade-in duration-500">
                <div className="w-16 h-16 mb-4 rounded-full bg-surface-bright flex items-center justify-center border border-outline-variant/30 shadow-inner relative">
                  <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse" />
                  <Database className="w-6 h-6 text-primary/40 animate-pulse" />
                </div>
                <h3 className="text-xl font-display text-on-surface mb-2">{language === 'vi' ? 'Đang tải Ngân hàng...' : 'Loading Bank...'}</h3>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-outline animate-in fade-in duration-500 max-w-md mx-auto text-center">
                <div className="w-24 h-24 mb-6 rounded-full bg-surface-bright flex items-center justify-center border border-outline-variant/30 shadow-inner relative">
                  <PackageOpen className="w-10 h-10 text-outline-variant" />
                </div>
                <h3 className="text-2xl font-display font-bold text-on-surface mb-3 tracking-tight">
                  {language === 'vi' ? 'Trống' : 'Empty'}
                </h3>
                <p className="text-on-surface-variant leading-relaxed">
                  {language === 'vi' 
                    ? 'Không có câu hỏi nào trong phân mục này. Hãy thay đổi từ khóa hoặc tạo mới.'
                    : 'No question nodes found in this sector. Try a different search or create one.'}
                </p>
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
                    "rounded-2xl border transition-all duration-300 flex flex-col overflow-hidden bg-surface shadow-sm",
                    isExpanded ? "border-secondary/50 shadow-xl shadow-secondary/5 ring-1 ring-secondary/10 z-10 relative" : "border-outline-variant/30 hover:border-outline-variant/80 hover:shadow-md",
                    selectedItems.includes(q.ma_cau_hoi) && "border-secondary bg-secondary/5"
                  )}>
                    {/* Compact Card Header */}
                    <div 
                      className="p-5 flex items-center cursor-pointer relative overflow-hidden"
                      onClick={() => setExpandedId(isExpanded ? null : q.ma_cau_hoi)}
                    >
                      {/* Left Status Glow if Expanded */}
                      {isExpanded && <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary" />}

                      <div className="flex items-center mr-6 shrink-0 relative z-10">
                        {q.tinh_trang !== 'published' ? (
                          <div className="mr-4 relative flex items-center justify-center">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 rounded-md border-outline-variant text-secondary focus:ring-secondary cursor-pointer bg-background"
                              checked={selectedItems.includes(q.ma_cau_hoi)}
                              onChange={(e) => toggleSelection(q.ma_cau_hoi, e as unknown as React.MouseEvent)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        ) : (
                          <div className="mr-4 w-5 h-5" />
                        )}
                        <div className={cn("flex flex-col", isExpanded ? "text-secondary" : "text-on-surface")}>
                           <span className="font-mono font-bold tracking-wider text-[13px]">{shortId}</span>
                           <span className="text-[9px] font-mono font-bold tracking-widest text-outline-variant uppercase">{creatorName}</span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col min-w-0 pr-6 relative z-10">
                        <div className={cn("text-sm font-medium line-clamp-1 mb-1.5 font-sans transition-colors", isExpanded ? "text-secondary" : "text-on-surface group-hover:text-primary")}>
                           <MathRenderer content={q.noi_dung || "No content"} />
                        </div>
                        <div className="flex items-center gap-2">
                           <Folder className="w-3.5 h-3.5 text-outline" />
                           <span className="font-mono text-xs font-medium text-outline-variant truncate">{pathName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0 relative z-10">
                        <div className="font-mono text-xs font-bold uppercase tracking-wider">
                          {q.tinh_trang === 'draft' || q.tinh_trang === 'Review' ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-surface-bright border border-outline-variant/50 text-outline-variant shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-outline mr-2 animate-pulse" /> PENDING
                            </span>
                          ) : q.tinh_trang === 'rejected' ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-error/10 border border-error/20 text-error shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-error mr-2" /> REJECTED
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary mr-2" /> APPROVED
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 border-l border-outline-variant/30 pl-6">
                          {q.tinh_trang !== 'published' ? (
                            <>
                              <Link to={`/questions/edit/${q.ma_cau_hoi}`} onClick={(e) => e.stopPropagation()} className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-all hover:shadow-sm" title="Edit">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                              </Link>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToDelete(q);
                                }}
                                className="p-2 text-outline hover:text-error hover:bg-error/10 rounded-lg transition-all hover:shadow-sm" title="Delete"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </>
                          ) : (
                            <div className="p-2 text-outline/50 bg-surface-bright rounded-lg border border-outline-variant/20" title="View Only (Approved)">
                              <FileText className="w-4.5 h-4.5" />
                            </div>
                          )}
                          <div className={cn("p-2 rounded-lg transition-all ml-2", isExpanded ? "bg-secondary/10 text-secondary" : "text-outline hover:bg-surface-bright")}>
                            <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", isExpanded && "rotate-90")} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detailed View */}
                    {isExpanded && (
                      <div className="p-8 bg-surface-bright border-t border-outline-variant/10 shadow-inner relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="grid grid-cols-12 gap-10 relative z-10">
                          {/* Left: Question & Answers */}
                          <div className="col-span-8">
                            {q.ngu_lieu && q.ngu_lieu.noi_dung && (
                              <div className="mb-8 relative">
                                <h4 className="text-xs font-mono font-bold text-secondary uppercase tracking-widest mb-3 flex items-center">
                                  <FileText className="w-4 h-4 mr-2" />
                                  STIMULUS / ASSET
                                </h4>
                                <div className="font-sans text-sm text-on-surface leading-relaxed bg-secondary/5 p-6 rounded-xl border border-secondary/20 shadow-sm">
                                  <MathRenderer content={q.ngu_lieu.noi_dung} />
                                </div>
                              </div>
                            )}

                            <h4 className="text-xs font-mono font-bold text-outline-variant uppercase tracking-widest mb-3 flex items-center">
                              <FileText className="w-4 h-4 mr-2" />
                              Content Node
                            </h4>
                            <div className="font-sans text-sm text-on-surface leading-relaxed mb-8 bg-surface p-6 rounded-xl border border-outline-variant/30 shadow-sm hover:border-outline-variant/50 transition-colors">
                              <MathRenderer content={q.noi_dung || ""} />
                            </div>
                            
                            <h4 className="text-xs font-mono font-bold text-outline-variant uppercase tracking-widest mb-3 flex items-center">
                              <LayoutList className="w-4 h-4 mr-2" />
                              Solution Vectors
                            </h4>
                            <div className="space-y-3">
                              {answers.map((ans: any, idx: number) => {
                                const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                                return (
                                  <div 
                                    key={ans.ma_dap_an} 
                                    className={cn(
                                      "flex items-center px-5 py-4 rounded-xl font-sans text-sm transition-all border shadow-sm",
                                      ans.is_correct 
                                        ? "bg-secondary/10 border-secondary/30 text-on-surface font-medium ring-1 ring-secondary/20" 
                                        : "bg-surface border-outline-variant/20 text-on-surface-variant hover:bg-surface-bright hover:border-outline-variant/50"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold shrink-0 mr-4 shadow-sm",
                                      ans.is_correct ? "bg-secondary text-on-secondary" : "bg-surface-bright border border-outline-variant/30 text-outline"
                                    )}>
                                      {letters[idx] || '?'}
                                    </div>
                                    <span className="flex-1 leading-relaxed"><MathRenderer content={ans.noi_dung || ""} /></span>
                                    {ans.is_correct && (
                                      <div className="ml-4 bg-secondary/20 p-1.5 rounded-full">
                                        <CheckCircle2 className="w-5 h-5 text-secondary shrink-0" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Right: Metadata */}
                          <div className="col-span-4 space-y-8 bg-surface p-6 rounded-xl border border-outline-variant/30 shadow-sm h-fit sticky top-6">
                            <div>
                              <h4 className="text-[10px] font-mono font-bold text-outline-variant uppercase tracking-widest mb-4 flex items-center">
                                <Database className="w-3.5 h-3.5 mr-2" />
                                Classification
                              </h4>
                              <div className="space-y-3 font-mono text-xs">
                                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                                  <span className="text-outline">Type</span>
                                  <span className="text-on-surface font-medium">{q.loai_cau_hoi || 'Multiple Choice'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
                                  <span className="text-outline">Cognitive Lvl</span>
                                  <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">Lvl {q.muc_do || 1}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                  <span className="text-outline">Created</span>
                                  <span className="text-on-surface">{q.ngay_tao ? new Date(q.ngay_tao).toLocaleDateString() : 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-[10px] font-mono font-bold text-outline-variant uppercase tracking-widest mb-4 flex items-center">
                                <Network className="w-3.5 h-3.5 mr-2" />
                                IRT Metrics (Simulation)
                              </h4>
                              <div className="space-y-4 font-mono text-xs">
                                <div>
                                  <div className="flex justify-between mb-1.5">
                                    <span className="text-outline">Difficulty (b)</span>
                                    <span className="text-on-surface font-bold">{q.b_diff?.toFixed(2) || '0.00'}</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-background rounded-full overflow-hidden shadow-inner">
                                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (q.b_diff + 3) / 6 * 100))}%` }}></div>
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1.5">
                                    <span className="text-outline">Discrimination (a)</span>
                                    <span className="text-on-surface font-bold">{q.a_discr?.toFixed(2) || '1.00'}</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-background rounded-full overflow-hidden shadow-inner">
                                    <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, Math.max(0, q.a_discr / 3 * 100))}%` }}></div>
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1.5">
                                    <span className="text-outline">Guessing (c)</span>
                                    <span className="text-on-surface font-bold">{q.c_guess?.toFixed(2) || '0.20'}</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-background rounded-full overflow-hidden shadow-inner">
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
