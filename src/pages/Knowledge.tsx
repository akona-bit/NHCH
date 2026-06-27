import React, { useState, useEffect } from 'react';
import { Plus, Filter, Save, AlertCircle, Trash2, Link2Off, Database, GitBranch, Edit2, MoveRight, ChevronRight, Folder, Network, Layers, LayoutGrid } from 'lucide-react';
import { MathRenderer } from '../components/MathRenderer';
import { supabase } from '../supabaseClient';
import { useSettings } from '../contexts/SettingsContext';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { DeleteModal } from '../components/DeleteModal';
import { KnowledgeTree } from '../components/KnowledgeTree';
import { cn } from '../lib/utils';

import { syncKnowledgeTree, flattenKnowledgeTree, KnowledgeTreeNode, KnowledgeNode } from '../services/knowledgeService';

export const Knowledge = () => {
  const [treeNodes, setTreeNodes] = useState<KnowledgeTreeNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = flatNodes.find(n => n.ma_kien_thuc === selectedNodeId) || null;

  // View States: 'view', 'edit', 'create'
  const [viewState, setViewState] = useState<'view' | 'edit' | 'create'>('view');
  
  // Form State
  const [nodeName, setNodeName] = useState('');
  const [nodeCode, setNodeCode] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { language } = useSettings();

  // Statistics State
  const [stats, setStats] = useState({ questions: 0, exams: 0, subNodes: 0 });
  const [recentQuestions, setRecentQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchNodes();
  }, []);

  useEffect(() => {
    if (selectedNode && viewState === 'view') {
      // Fetch stats when node selected
      fetchNodeStats(selectedNode.ma_kien_thuc);
    }
  }, [selectedNode, viewState]);

  const fetchNodes = async () => {
    try {
      const data = await syncKnowledgeTree();
      setTreeNodes(data);
      setFlatNodes(flattenKnowledgeTree(data));
    } catch (err: any) {
      console.error('Error fetching nodes:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNodeStats = async (nodeId: string) => {
    const subNodesCount = flatNodes.filter(n => n.ma_kt_parent === nodeId).length;
    
    // Fetch count of questions linked to this node
    const { count: questionsCount } = await supabase
      .from('kien_thuc_cau_hoi')
      .select('*', { count: 'exact', head: true })
      .eq('ma_kien_thuc', nodeId);

    // Fetch recent questions
    const { data: recentQs } = await supabase
      .from('kien_thuc_cau_hoi')
      .select(`
        cau_hoi (
          ma_cau_hoi,
          noi_dung,
          tinh_trang
        )
      `)
      .eq('ma_kien_thuc', nodeId)
      .limit(5);

    setStats({
      questions: questionsCount || 0,
      exams: 0, // Mock for now, would need a complex join through ky_thi_cau_hoi
      subNodes: subNodesCount
    });

    setRecentQuestions(recentQs?.map(r => r.cau_hoi) || []);
  };

  const handleStartCreate = () => {
    setViewState('create');
    setNodeCode('');
    setNodeName('');
    setDescription('');
    // If a node is selected, default to making it the parent
    setParentId(selectedNodeId);
    setError(null);
  };

  const handleStartEdit = () => {
    if (!selectedNode) return;
    setViewState('edit');
    setNodeCode(selectedNode.ma_kien_thuc);
    setNodeName(selectedNode.ten_kien_thuc);
    setDescription(selectedNode.mo_ta || '');
    setParentId(selectedNode.ma_kt_parent);
    setError(null);
  };

  const handleCancelForm = () => {
    setViewState('view');
    setError(null);
  };

  const handleSave = async () => {
    if (!nodeName || !nodeCode) {
      setError("Name and Code are required");
      return;
    }
    setSaving(true);
    setError(null);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;

      if (viewState === 'create') {
        const { error } = await supabase.from('kien_thuc').insert({
          ma_kien_thuc: nodeCode,
          ten_kien_thuc: nodeName,
          mo_ta: description,
          ma_kt_parent: parentId,
          nguoi_tao: userId
        });
        if (error) throw error;
      } else if (viewState === 'edit') {
        const { error } = await supabase.from('kien_thuc')
          .update({
            ten_kien_thuc: nodeName,
            mo_ta: description,
            ma_kt_parent: parentId
          })
          .eq('ma_kien_thuc', nodeCode);
        if (error) throw error;
      }
      
      await fetchNodes();
      setViewState('view');
      setSelectedNodeId(nodeCode); // Select the newly created or edited node
    } catch (err: any) {
      setError(err.message || 'An error occurred saving the node.');
    } finally {
      setSaving(false);
    }
  };

  const [itemToDelete, setItemToDelete] = useState<KnowledgeNode | null>(null);
  const [deleteStats, setDeleteStats] = useState({ questions: 0, loading: false });

  useEffect(() => {
    if (itemToDelete) {
      const fetchDelStats = async () => {
        setDeleteStats({ questions: 0, loading: true });
        const { count } = await supabase
          .from("kien_thuc_cau_hoi")
          .select("*", { count: "exact", head: true })
          .eq("ma_kien_thuc", itemToDelete.ma_kien_thuc);
        setDeleteStats({ questions: count || 0, loading: false });
      };
      fetchDelStats();
    }
  }, [itemToDelete]);

  const deleteRecursive = async (nodeId: string) => {
    const { data: children } = await supabase
      .from('kien_thuc')
      .select('ma_kien_thuc')
      .eq('ma_kt_parent', nodeId);
      
    if (children && children.length > 0) {
      for (const child of children) {
        await deleteRecursive(child.ma_kien_thuc);
      }
    }
    
    await supabase.from('kien_thuc_cau_hoi').delete().eq('ma_kien_thuc', nodeId);
    const { error } = await supabase.from('kien_thuc').delete().eq('ma_kien_thuc', nodeId);
    if (error) throw error;
  };

  const handleDeleteNode = async (ma_kien_thuc: string) => {
    setDeleting(true);
    try {
      await deleteRecursive(ma_kien_thuc);
      if (selectedNodeId === ma_kien_thuc) setSelectedNodeId(null);
      await fetchNodes();
      setViewState('view');
    } catch (err: any) {
      setError(err.message || 'An error occurred deleting the node.');
    } finally {
      setDeleting(false);
      setItemToDelete(null);
    }
  };

  const getBreadcrumbs = (nodeId: string): KnowledgeNode[] => {
    const path: KnowledgeNode[] = [];
    let current = flatNodes.find(n => n.ma_kien_thuc === nodeId);
    while (current) {
      path.unshift(current);
      current = flatNodes.find(n => n.ma_kien_thuc === current?.ma_kt_parent);
    }
    return path;
  };

  return (
    <div className="flex flex-col h-full -m-8 bg-background relative">
      <LoadingOverlay 
        isLoading={saving || deleting} 
        message={
          saving ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') :
          deleting ? (language === 'vi' ? 'Đang xóa...' : 'Deleting...') :
          (language === 'vi' ? 'Đang tải...' : 'Loading...')
        }
      />
      
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-surface px-8 py-8 border-b border-outline-variant shrink-0 z-20 shadow-sm">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex justify-between items-center relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-inner">
              <Network className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-on-surface tracking-tight mb-1">
                {language === 'vi' ? 'Quản lý Miền Tri Thức' : 'Knowledge Taxonomy'}
              </h1>
              <p className="text-sm text-on-surface-variant font-medium">
                {language === 'vi' ? 'Tổ chức phân cấp các miền tri thức và gắn thẻ câu hỏi cho ngân hàng.' : 'Hierarchical organization of curriculum domains and question tags.'}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleStartCreate}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4 mr-2" />
              {language === 'vi' ? 'Thêm Nút Mới' : 'Add New Node'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Tree */}
        <div className="w-80 border-r border-outline-variant bg-surface flex flex-col shrink-0 relative z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          {loading ? (
             <div className="p-8 text-center text-outline text-sm font-mono">Loading tree...</div>
          ) : (
            <KnowledgeTree 
              nodes={treeNodes} 
              selectedNodeId={selectedNodeId} 
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (viewState !== 'view') setViewState('view');
              }} 
            />
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto bg-background p-8">
          {viewState === 'view' ? (
            selectedNode ? (
              <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Breadcrumbs */}
                <div className="flex items-center text-sm text-outline font-medium mb-6">
                  {getBreadcrumbs(selectedNode.ma_kien_thuc).map((crumb, idx, arr) => (
                    <React.Fragment key={crumb.ma_kien_thuc}>
                      <span className={cn("transition-colors", idx === arr.length - 1 ? "text-primary" : "text-on-surface-variant hover:text-on-surface cursor-pointer")}
                            onClick={() => setSelectedNodeId(crumb.ma_kien_thuc)}>
                        {crumb.ten_kien_thuc}
                      </span>
                      {idx < arr.length - 1 && <ChevronRight className="w-4 h-4 mx-2" />}
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-4xl font-display font-bold text-on-surface tracking-tight mb-4">{selectedNode.ten_kien_thuc}</h2>
                    <div className="flex gap-3 text-xs font-mono font-bold uppercase tracking-widest">
                      <span className="bg-surface border border-outline-variant px-3 py-1.5 rounded flex items-center text-outline">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant mr-2" />
                        ID: {selectedNode.ma_kien_thuc}
                      </span>
                      {/* Can add tags or other metadata here */}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleStartEdit}
                      className="p-2.5 text-outline hover:text-primary hover:bg-primary/10 rounded-lg border border-outline-variant hover:border-primary/50 transition-all bg-surface"
                      title={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setItemToDelete(selectedNode)}
                      className="p-2.5 text-outline hover:text-error hover:bg-error/10 rounded-lg border border-outline-variant hover:border-error/50 transition-all bg-surface"
                      title={language === 'vi' ? 'Xóa' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description Box */}
                <div className="mb-10">
                  <h3 className="text-lg font-bold text-on-surface mb-4 border-b border-outline-variant/50 pb-2">{language === 'vi' ? 'Mô tả' : 'Description'}</h3>
                  <div className="text-on-surface-variant leading-relaxed text-sm">
                    {selectedNode.mo_ta ? (
                      <MathRenderer content={selectedNode.mo_ta} />
                    ) : (
                      <span className="italic text-outline">{language === 'vi' ? 'Không có mô tả.' : 'No description provided.'}</span>
                    )}
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="mb-10">
                  <h3 className="text-lg font-bold text-on-surface mb-4 border-b border-outline-variant/50 pb-2">{language === 'vi' ? 'Thống kê Nút' : 'Node Statistics'}</h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-surface/50 border border-outline-variant rounded-2xl p-6 relative overflow-hidden group hover:border-primary/50 transition-colors">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                      <div className="text-xs font-mono text-outline uppercase tracking-widest mb-3 flex items-center">
                        <Database className="w-3.5 h-3.5 mr-2 text-primary" />
                        {language === 'vi' ? 'Tổng Câu Hỏi' : 'Total Questions'}
                      </div>
                      <div className="text-4xl font-display font-bold text-on-surface">{stats.questions.toLocaleString()}</div>
                    </div>
                    <div className="bg-surface/50 border border-outline-variant rounded-2xl p-6 relative overflow-hidden group hover:border-secondary/50 transition-colors">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-secondary/5 rounded-full blur-2xl group-hover:bg-secondary/10 transition-colors" />
                      <div className="text-xs font-mono text-outline uppercase tracking-widest mb-3 flex items-center">
                        <Layers className="w-3.5 h-3.5 mr-2 text-secondary" />
                        {language === 'vi' ? 'Kỳ Thi Tham Gia' : 'Active Exams'}
                      </div>
                      <div className="text-4xl font-display font-bold text-on-surface">{stats.exams.toLocaleString()}</div>
                    </div>
                    <div className="bg-surface/50 border border-outline-variant rounded-2xl p-6 relative overflow-hidden group hover:border-tertiary/50 transition-colors">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-tertiary/5 rounded-full blur-2xl group-hover:bg-tertiary/10 transition-colors" />
                      <div className="text-xs font-mono text-outline uppercase tracking-widest mb-3 flex items-center">
                        <LayoutGrid className="w-3.5 h-3.5 mr-2 text-tertiary" />
                        {language === 'vi' ? 'Nút Con' : 'Sub-nodes'}
                      </div>
                      <div className="text-4xl font-display font-bold text-on-surface">{stats.subNodes.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Recent Linked Questions */}
                <div>
                  <div className="flex justify-between items-end mb-4 border-b border-outline-variant/50 pb-2">
                    <h3 className="text-lg font-bold text-on-surface">{language === 'vi' ? 'Câu hỏi liên kết gần đây' : 'Recent Linked Questions'}</h3>
                    <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
                      {language === 'vi' ? 'Xem tất cả' : 'View All in Bank'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {recentQuestions.length > 0 ? (
                      recentQuestions.map((q: any) => (
                        <div key={q.ma_cau_hoi} className="bg-surface border border-outline-variant rounded-xl p-4 flex justify-between items-center hover:border-primary/50 cursor-pointer transition-colors group">
                          <div>
                            <div className="text-sm font-medium text-on-surface mb-1 group-hover:text-primary transition-colors line-clamp-1">
                              <MathRenderer content={q.noi_dung || ''} />
                            </div>
                            <div className="text-xs font-mono text-outline uppercase tracking-wider">
                              ID: Q-{q.ma_cau_hoi?.toString().substring(0,4)} • {q.tinh_trang}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-outline group-hover:text-primary transition-colors" />
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-8 bg-surface rounded-xl border border-outline-variant border-dashed text-outline text-sm">
                        {language === 'vi' ? 'Chưa có câu hỏi nào được gắn thẻ nút này.' : 'No questions linked to this node yet.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-outline animate-in fade-in duration-500 max-w-md mx-auto text-center">
                <div className="w-24 h-24 mb-6 rounded-full bg-surface-bright flex items-center justify-center border border-outline-variant/30 shadow-inner relative">
                  <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse" />
                  <Network className="w-10 h-10 text-primary/40" />
                </div>
                <h3 className="text-2xl font-display font-bold text-on-surface mb-3 tracking-tight">
                  {language === 'vi' ? 'Chưa chọn Điểm Kiến Thức' : 'No Node Selected'}
                </h3>
                <p className="text-on-surface-variant leading-relaxed">
                  {language === 'vi' 
                    ? 'Hãy chọn một nút từ cây kiến thức bên trái để xem chi tiết, phân tích số liệu thống kê và quản lý các câu hỏi được liên kết.'
                    : 'Select a node from the knowledge tree on the left to view details, analyze statistics, and manage linked questions.'}
                </p>
              </div>
            )
          ) : (
            // Create / Edit Form
            <div className="max-w-3xl mx-auto bg-surface/80 backdrop-blur-xl shadow-2xl shadow-black/5 rounded-2xl border border-outline-variant/50 p-10 animate-in slide-in-from-bottom-8 fade-in duration-500 mt-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary" />
              
              <div className="mb-10 flex items-start gap-5 border-b border-outline-variant/30 pb-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  {viewState === 'create' ? <Plus className="w-6 h-6 text-primary" /> : <Edit2 className="w-6 h-6 text-primary" />}
                </div>
                <div>
                  <h2 className="font-display font-bold text-3xl text-on-surface mb-2 tracking-tight">
                    {viewState === 'create' 
                      ? (language === 'vi' ? 'Tạo mới Điểm Kiến thức' : 'Create Knowledge Node')
                      : (language === 'vi' ? 'Cập nhật Điểm Kiến thức' : 'Update Knowledge Node')}
                  </h2>
                  <p className="text-on-surface-variant font-medium">
                    {language === 'vi' ? 'Thiết lập siêu dữ liệu để hệ thống AI phân loại chính xác.' : 'Configure metadata for accurate AI classification.'}
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-8 flex items-start bg-error/10 border border-error/20 rounded-xl p-4 text-error text-sm font-mono shadow-sm">
                  <AlertCircle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="relative group">
                    <label className="block text-xs font-mono font-bold uppercase tracking-widest text-outline mb-2 group-focus-within:text-primary transition-colors">
                      {language === 'vi' ? 'Tên nút' : 'Node Name'} <span className="text-error">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={nodeName}
                      onChange={e => setNodeName(e.target.value)}
                      placeholder="e.g. Lượng tử học..." 
                      className="w-full bg-background border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-on-surface transition-all font-medium shadow-sm hover:border-outline-variant" 
                    />
                  </div>
                  <div className="relative group">
                    <label className="block text-xs font-mono font-bold uppercase tracking-widest text-outline mb-2 group-focus-within:text-primary transition-colors">
                      {language === 'vi' ? 'Mã định danh (ID)' : 'Knowledge Code (ID)'} <span className="text-error">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={nodeCode}
                      onChange={e => setNodeCode(e.target.value)}
                      disabled={viewState === 'edit'}
                      placeholder="e.g. DOM-PHYS-QM" 
                      className="w-full bg-background border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-primary font-mono font-bold transition-all disabled:opacity-50 disabled:bg-surface shadow-sm hover:border-outline-variant" 
                    />
                    {viewState === 'edit' && <p className="text-[10px] text-outline mt-2 font-mono uppercase tracking-widest absolute -bottom-5 right-0">ID is immutable</p>}
                  </div>
                </div>

                <div className="relative group">
                  <label className="block text-xs font-mono font-bold uppercase tracking-widest text-outline mb-2 group-focus-within:text-primary transition-colors">
                    {language === 'vi' ? 'Trực thuộc (Nút cha)' : 'Parent Node'}
                  </label>
                  <div className="relative">
                    <select
                      value={parentId || ''}
                      onChange={(e) => setParentId(e.target.value === '' ? null : e.target.value)}
                      className="w-full bg-background border border-outline-variant/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-on-surface transition-all appearance-none font-medium shadow-sm hover:border-outline-variant pr-10"
                    >
                      <option value="">{language === 'vi' ? '-- Cấp cao nhất (Gốc) --' : '-- Root Level (None) --'}</option>
                      {flatNodes.filter(n => n.ma_kien_thuc !== nodeCode).map(n => (
                        <option key={n.ma_kien_thuc} value={n.ma_kien_thuc}>{n.ten_kien_thuc} ({n.ma_kien_thuc})</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline pointer-events-none group-focus-within:text-primary transition-colors" />
                  </div>
                </div>

                <div className="relative group">
                  <label className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-widest text-outline mb-2 group-focus-within:text-primary transition-colors">
                    <span>{language === 'vi' ? 'Mô tả chi tiết' : 'Detailed Description'}</span>
                    <span className="text-[10px] bg-surface-bright px-2 py-0.5 rounded text-outline-variant normal-case tracking-normal">Markdown + LaTeX</span>
                  </label>
                  <textarea 
                    className="w-full min-h-[160px] bg-background border border-outline-variant/50 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-on-surface transition-all font-mono resize-y leading-relaxed shadow-sm hover:border-outline-variant"
                    placeholder="Provide a comprehensive description of the knowledge domain..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  ></textarea>
                </div>
              </div>

              <div className="mt-10 flex justify-end gap-4 pt-8 border-t border-outline-variant/30">
                <button 
                  onClick={handleCancelForm}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold border border-outline-variant hover:bg-surface-bright transition-all text-on-surface-variant hover:text-on-surface hover:shadow-sm"
                >
                  {language === 'vi' ? 'Hủy Bỏ' : 'Cancel'}
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-2.5 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center disabled:opacity-50 hover:-translate-y-0.5"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (language === 'vi' ? 'Lưu Thiết Lập' : 'Save Configuration')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {itemToDelete && (
        <DeleteModal
          isOpen={true}
          onClose={() => setItemToDelete(null)}
          onConfirm={() => handleDeleteNode(itemToDelete.ma_kien_thuc)}
          title={
            <span>
              {language === 'vi' ? 'Xóa Node ' : 'Delete Node '}
              <span className="text-error">{itemToDelete.ma_kien_thuc}</span>
            </span>
          }
          description={
            language === 'vi' 
              ? `Hành động này sẽ xóa vĩnh viễn "${itemToDelete.ten_kien_thuc}" và TẤT CẢ các nút con khỏi cấu trúc liên kết kiến thức.`
              : `This will permanently remove "${itemToDelete.ten_kien_thuc}" and ALL child nodes from the knowledge topology.`
          }
          stats={[
            { icon: <Link2Off className="w-5 h-5" />, value: deleteStats.loading ? "..." : deleteStats.questions.toString(), label: language === 'vi' ? "CÂU HỎI MỒ CÔI" : "ORPHANED QUESTIONS" },
            { icon: <GitBranch className="w-5 h-5" />, value: deleteStats.questions > 0 ? (language === 'vi' ? "Cao" : "High") : (language === 'vi' ? "Thấp" : "Low"), label: language === 'vi' ? "ẢNH HƯỞNG CẤU TRÚC" : "TOPOLOGY IMPACT" }
          ]}
          slideText={language === 'vi' ? "TRƯỢT ĐỂ XÓA" : "SLIDE TO EXECUTE PURGE"}
        />
      )}
    </div>
  );
};
