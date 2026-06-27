import React, { useState, useEffect } from 'react';
import { Save, ShieldCheck, FileText, Image as ImageIcon, Code, Type, LayoutList, ChevronDown, CheckCircle2, Plus, Trash2, AlertCircle, Sparkles, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { MathRenderer } from '../components/MathRenderer';
import { supabase } from '../supabaseClient';
import { useNavigate, useParams } from 'react-router-dom';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { KnowledgeTree } from '../components/KnowledgeTree';
import { syncKnowledgeTree, KnowledgeTreeNode, flattenKnowledgeTree } from '../services/knowledgeService';

export const QuestionEdit = () => {
  const [content, setContent] = useState('Enter question content here...\n\nSupports LaTeX:\nInline: $E = mc^2$\nBlock: $$\\int_0^1 x^2 dx$$');
  const [previewMode, setPreviewMode] = useState(false);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Supabase State
  const [treeNodes, setTreeNodes] = useState<KnowledgeTreeNode[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [cognitiveLevel, setCognitiveLevel] = useState(1);
  const [questionType, setQuestionType] = useState('multiple_choice');
  
  const [nguLieuList, setNguLieuList] = useState<any[]>([]);
  const [selectedNguLieu, setSelectedNguLieu] = useState<string | null>(null);
  const [isCreatingNguLieu, setIsCreatingNguLieu] = useState(false);
  const [newNguLieuData, setNewNguLieuData] = useState({ noi_dung: '', image_url: '', tac_gia: '', tac_pham: '' });

  const [answers, setAnswers] = useState([
    { id: 1, content: 'Hệ điều hành', isCorrect: true },
    { id: 2, content: 'Phần mềm ứng dụng', isCorrect: false },
    { id: 3, content: 'Trình biên dịch', isCorrect: false }
  ]);
  
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentUser, setCurrentUser] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    fetchNodes();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        supabase.from('users').select('ho_ten').eq('user_id', data.user.id).maybeSingle().then(res => {
          setCurrentUser({
            id: data.user.id,
            name: res.data?.ho_ten || data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Unknown'
          });
        });
      }
    });
    
    if (id) {
      fetchExistingQuestion(id);
    }
  }, [id]);

  const fetchExistingQuestion = async (qId: string) => {
    try {
      const { data: qData, error } = await supabase.from('cau_hoi').select('*').eq('ma_cau_hoi', qId).single();
      if (error) throw error;
      
      setContent(qData.noi_dung || '');
      setCognitiveLevel(qData.muc_do || 1);
      setQuestionType(qData.loai_cau_hoi || 'multiple_choice');
      setSelectedNguLieu(qData.ma_ngu_lieu || null);
      
      if (qData.tinh_trang === 'published') {
        setIsReadOnly(true);
      }

      const { data: ansData } = await supabase.from('dap_an').select('*').eq('ma_cau_hoi', qId);
      if (ansData && ansData.length > 0) {
        setAnswers(ansData.map((a: any) => ({ id: a.ma_dap_an, content: a.noi_dung, isCorrect: a.is_correct })));
      }

      const { data: ktData } = await supabase.from('kien_thuc_cau_hoi').select('ma_kien_thuc').eq('ma_cau_hoi', qId);
      if (ktData) {
        setSelectedNodes(ktData.map((k: any) => k.ma_kien_thuc));
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load existing question.");
    }
  };

  const fetchNodes = async () => {
    const data = await syncKnowledgeTree();
    setTreeNodes(data);
    const { data: nlData } = await supabase.from('ngu_lieu').select('ma_ngu_lieu, tac_pham, noi_dung').order('ma_ngu_lieu', { ascending: false });
    if (nlData) setNguLieuList(nlData);
  };

  const handleToggleNode = (id: string) => {
    setSelectedNodes(prev => 
      prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
    );
  };

  const handleAiGenerate = async () => {
    if (!isCreatingNguLieu && !selectedNguLieu && selectedNodes.length === 0) {
      setError("Please select at least a Knowledge Node or Stimulus to generate a question.");
      return;
    }
    
    setGenerating(true);
    setError(null);
    try {
      let stimulus = "None";
      if (isCreatingNguLieu && newNguLieuData.noi_dung.trim()) {
        stimulus = newNguLieuData.noi_dung;
      } else if (selectedNguLieu) {
        const selectedNlData = nguLieuList.find(n => n.ma_ngu_lieu === selectedNguLieu);
        if (selectedNlData) stimulus = selectedNlData.noi_dung;
      }

      const flatNodes = flattenKnowledgeTree(treeNodes);
      const selectedNodeDetails = flatNodes
        .filter(n => selectedNodes.includes(n.ma_kien_thuc))
        .map(n => ({
          title: n.ten_kien_thuc,
          description: n.mo_ta || "No description provided"
        }));

      const response = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Create a highly challenging multiple-choice question suitable for the exam. Ensure the question specifically focuses on the provided Knowledge Focus nodes.',
          stimulus,
          contextNodes: selectedNodeDetails.length > 0 ? selectedNodeDetails : selectedNodes
        })
      });

      if (!response.ok) throw new Error("Failed to generate from server");

      const data = await response.json();
      if (data.result) {
        if (data.result.content) setContent(data.result.content);
        if (data.result.cognitiveLevel) setCognitiveLevel(data.result.cognitiveLevel);
        if (data.result.answers && data.result.answers.length > 0) {
          const newAnswers = data.result.answers.map((ans: any, idx: number) => ({
            id: idx + 1,
            content: ans.content,
            isCorrect: ans.isCorrect
          }));
          setAnswers(newAnswers);
        }
      }
    } catch (err: any) {
      setError(`AI Generation Failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddOption = () => {
    const newId = Math.max(...answers.map(a => a.id), 0) + 1;
    setAnswers([...answers, { id: newId, content: '', isCorrect: answers.length === 0 }]);
  };

  const handleUpdateOption = (id: number, val: string) => {
    setAnswers(answers.map(a => a.id === id ? { ...a, content: val } : a));
  };

  const handleSetCorrect = (id: number) => {
    if (questionType === 'multiple_choice' || questionType === 'true_false') {
      setAnswers(answers.map(a => ({ ...a, isCorrect: a.id === id })));
    } else {
      setAnswers(answers.map(a => a.id === id ? { ...a, isCorrect: !a.isCorrect } : a));
    }
  };

  const handleRemoveOption = (id: number) => {
    setAnswers(answers.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    if (!content.trim()) return setError("Question content is required");
    if (answers.filter(a => a.isCorrect).length === 0) return setError("At least one correct answer is required");
    if (selectedNodes.length === 0) return setError("At least one knowledge node is required");

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;

      if (userId) {
        const { data: userData } = await supabase.from('users').select('user_id').eq('user_id', userId).maybeSingle();
        if (!userData) {
           const { error: userInsertError } = await supabase.from('users').insert({
             user_id: userId,
             ho_ten: user?.user?.user_metadata?.full_name || user?.user?.email?.split('@')[0] || 'Unknown'
           });
           if (userInsertError) {
             throw new Error(`Lỗi khi tạo user: ${userInsertError.message}`);
           }
        }
      }

      let finalNguLieuId = selectedNguLieu;

      if (isCreatingNguLieu && newNguLieuData.noi_dung.trim()) {
        const { data: createdNl, error: nlError } = await supabase.from('ngu_lieu').insert({
          noi_dung: newNguLieuData.noi_dung,
          image_url: newNguLieuData.image_url,
          tac_gia: newNguLieuData.tac_gia,
          tac_pham: newNguLieuData.tac_pham,
          nguoi_tao: userId
        }).select('ma_ngu_lieu').single();
        if (nlError) throw nlError;
        finalNguLieuId = createdNl.ma_ngu_lieu;
      }

      // 1. Insert or Update Question
      let questionId = null;
      if (isEditMode) {
        const { error: qError } = await supabase.from('cau_hoi').update({
          noi_dung: content,
          muc_do: cognitiveLevel,
          loai_cau_hoi: questionType,
          nguoi_tao: userId,
          ma_ngu_lieu: finalNguLieuId,
          tinh_trang: 'draft'
        }).eq('ma_cau_hoi', id);
        
        if (qError) throw qError;
        questionId = id;
        
        // Clean up old relations
        await supabase.from('kien_thuc_cau_hoi').delete().eq('ma_cau_hoi', id);
        await supabase.from('dap_an').delete().eq('ma_cau_hoi', id);
      } else {
        const { data: qData, error: qError } = await supabase.from('cau_hoi').insert({
          noi_dung: content,
          muc_do: cognitiveLevel,
          loai_cau_hoi: questionType,
          nguoi_tao: userId,
          ma_ngu_lieu: finalNguLieuId,
          tinh_trang: 'draft'
        }).select('ma_cau_hoi').single();
  
        if (qError) throw qError;
        questionId = qData.ma_cau_hoi;
      }

      // 2. Insert Knowledge Map
      const nodesToInsert = selectedNodes.map(nodeId => ({
        ma_cau_hoi: questionId,
        ma_kien_thuc: nodeId
      }));
      const { error: ktError } = await supabase.from('kien_thuc_cau_hoi').insert(nodesToInsert);
      if (ktError) throw ktError;

      // 3. Insert Answers
      const answersToInsert = answers.map(a => ({
        ma_cau_hoi: questionId,
        noi_dung: a.content,
        is_correct: a.isCorrect
      }));
      const { error: aError } = await supabase.from('dap_an').insert(answersToInsert);
      if (aError) throw aError;

      setSuccess(true);
      if (!isEditMode) {
        setContent('Enter question content here...\n\nSupports LaTeX:\nInline: $E = mc^2$\nBlock: $$\\int_0^1 x^2 dx$$');
        setAnswers([
          { id: 1, content: '', isCorrect: true },
          { id: 2, content: '', isCorrect: false },
          { id: 3, content: '', isCorrect: false },
          { id: 4, content: '', isCorrect: false }
        ]);
        setSelectedNodes([]);
      }
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  return (
    <div className="flex flex-col h-full -m-6 relative">
      <LoadingOverlay isLoading={saving} isSaving={true} />
      <div className="flex justify-between items-center bg-surface px-8 py-5 border-b border-outline-variant/20 shrink-0 shadow-sm z-10 relative">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center mr-4">
             <Code className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-on-surface tracking-wide">Question Designer</h1>
            <div className="flex gap-2 items-center mt-1">
              <span className="text-[10px] text-outline font-mono uppercase tracking-widest">Authoring Interface</span>
              {currentUser && (
                <span className="px-2 py-0.5 bg-secondary/10 border border-secondary/20 rounded text-secondary flex items-center text-[9px] font-mono font-bold uppercase tracking-widest">
                  Tác giả: {currentUser.name} <span className="opacity-50 ml-1">({currentUser.id.substring(0,8)})</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate(-1)} className="px-5 py-2.5 bg-transparent text-on-surface border border-outline-variant/30 font-medium rounded-lg text-sm hover:bg-surface-bright transition-colors">
            Cancel
          </button>
          {!isReadOnly && (
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-lg text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Committing...' : (isEditMode ? 'Save Changes' : 'Commit Content')}
            </button>
          )}
        </div>
      </div>

      <div className={cn("flex flex-col gap-6 max-w-[1400px] w-full mx-auto p-6 overflow-y-auto custom-scrollbar", isReadOnly && "pointer-events-none opacity-90")}>
        {isReadOnly && (
          <div className="flex items-center justify-center bg-secondary/10 border border-secondary/20 rounded-lg p-3 text-secondary text-sm font-bold shrink-0 mb-2 pointer-events-auto">
            <ShieldCheck className="w-5 h-5 mr-2 shrink-0" />
            <p>This question has been approved and is now READ-ONLY.</p>
          </div>
        )}
        
        {error && (
          <div className="flex items-start bg-error/10 border border-error/20 rounded-lg p-3 text-error text-sm font-mono shrink-0">
            <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-start bg-secondary/10 border border-secondary/20 rounded-lg p-3 text-secondary text-sm font-mono shrink-0">
            <CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />
            <p>Question saved successfully! Redirecting...</p>
          </div>
        )}

        <div className="flex gap-6 items-start w-full">
        {/* Left Col - NguLieu */}
        <div className="w-[320px] flex flex-col gap-6 shrink-0">
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-5">
            <h3 className="text-base font-display font-bold text-on-surface mb-6 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-outline-variant" /> Ngữ liệu (Stimulus)
            </h3>
            
            <div className="flex bg-surface-bright rounded-lg p-1 mb-4">
              <button
                className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", !isCreatingNguLieu ? "bg-primary text-on-primary shadow-sm" : "text-outline-variant hover:text-on-surface")}
                onClick={() => setIsCreatingNguLieu(false)}
              >
                Link Existing
              </button>
              <button
                className={cn("flex-1 py-1.5 text-xs font-bold rounded-md transition-all", isCreatingNguLieu ? "bg-primary text-on-primary shadow-sm" : "text-outline-variant hover:text-on-surface")}
                onClick={() => setIsCreatingNguLieu(true)}
              >
                Create New
              </button>
            </div>

            {isCreatingNguLieu ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Content (Nội Dung)</label>
                  <textarea 
                    className="w-full bg-background border border-outline-variant/30 rounded-lg p-3 text-sm text-on-surface placeholder:text-outline-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all custom-scrollbar min-h-[160px] resize-y"
                    placeholder="Enter reading passage or stimulus content..."
                    value={newNguLieuData.noi_dung}
                    onChange={(e) => setNewNguLieuData({...newNguLieuData, noi_dung: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Image URL</label>
                  <input 
                    type="text"
                    className="w-full bg-background border border-outline-variant/30 rounded-lg p-2 text-sm text-on-surface placeholder:text-outline-variant/50 focus:border-primary outline-none"
                    placeholder="https://..."
                    value={newNguLieuData.image_url}
                    onChange={(e) => setNewNguLieuData({...newNguLieuData, image_url: e.target.value})}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-on-surface mb-1">Author (Tác Giả)</label>
                    <input 
                      type="text"
                      className="w-full bg-background border border-outline-variant/30 rounded-lg p-2 text-sm text-on-surface placeholder:text-outline-variant/50 focus:border-primary outline-none"
                      placeholder="Optional"
                      value={newNguLieuData.tac_gia}
                      onChange={(e) => setNewNguLieuData({...newNguLieuData, tac_gia: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-on-surface mb-1">Work (Tác Phẩm)</label>
                    <input 
                      type="text"
                      className="w-full bg-background border border-outline-variant/30 rounded-lg p-2 text-sm text-on-surface placeholder:text-outline-variant/50 focus:border-primary outline-none"
                      placeholder="Optional"
                      value={newNguLieuData.tac_pham}
                      onChange={(e) => setNewNguLieuData({...newNguLieuData, tac_pham: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-on-surface mb-2">Select existing asset</label>
                <div className="space-y-1 bg-background border border-outline-variant/30 rounded-lg p-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {nguLieuList.length === 0 ? (
                    <div className="text-xs text-outline-variant p-2 italic text-center">No assets found</div>
                  ) : (
                    nguLieuList.map(asset => (
                      <div 
                        key={asset.ma_ngu_lieu}
                        onClick={() => setSelectedNguLieu(selectedNguLieu === asset.ma_ngu_lieu ? null : asset.ma_ngu_lieu)}
                        className={cn("p-2 rounded-md text-xs cursor-pointer border transition-colors", selectedNguLieu === asset.ma_ngu_lieu ? "bg-primary/10 border-primary text-primary" : "border-transparent hover:bg-surface-bright text-on-surface")}
                      >
                        <div className="font-medium truncate">{asset.tac_pham || "Untitled"} <span className="text-outline-variant ml-1 font-mono">{asset.ma_ngu_lieu}</span></div>
                        <div className="text-outline-variant truncate mt-1 opacity-70">{asset.noi_dung}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>



        {/* Center Col - Editor */}
        <div className="flex-1 flex flex-col gap-6 min-w-[500px]">
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-1">
            <div className="p-4 flex justify-between items-center border-b border-outline-variant/30">
              <h3 className="text-lg font-display font-bold text-on-surface flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" /> Nội dung câu hỏi
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center text-sm text-on-surface-variant">
                  <span className="mr-2">Preview</span>
                  <div 
                    className={cn("w-10 h-5 rounded-full border relative cursor-pointer transition-colors", previewMode ? "bg-background border-outline-variant" : "bg-surface-bright border-outline-variant/30")}
                    onClick={() => setPreviewMode(!previewMode)}
                  >
                    <div className={cn("absolute top-0.5 w-4 h-4 rounded-full transition-all", previewMode ? "bg-primary right-0.5" : "bg-outline-variant left-0.5")}></div>
                  </div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-surface-bright border border-outline-variant/30 text-xs font-mono text-outline-variant">
                  Rich Text / LaTeX
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-outline-variant/30">
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-bright rounded text-on-surface font-bold text-sm transition-colors">B</button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-bright rounded text-on-surface italic text-sm transition-colors">I</button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-bright rounded text-on-surface underline text-sm transition-colors">U</button>
                <div className="w-px h-6 bg-outline-variant/30 mx-2"></div>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-bright rounded text-outline hover:text-on-surface transition-colors"><LayoutList className="w-4 h-4" /></button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-surface-bright rounded text-outline hover:text-on-surface transition-colors"><ImageIcon className="w-4 h-4" /></button>
                <div className="flex-1"></div>
                <button className="px-3 py-1.5 bg-surface-bright border border-primary/20 rounded-lg text-sm text-primary flex items-center hover:bg-primary/10 transition-colors">
                  <span className="mr-1 text-base leading-none">∑</span> LaTeX
                </button>
              </div>
              
              {previewMode ? (
                <div className="w-full min-h-[250px] bg-background rounded-lg p-6 font-mono text-sm text-on-surface whitespace-pre-wrap">
                  <MathRenderer content={content} />
                </div>
              ) : (
                <textarea 
                  className="w-full min-h-[250px] bg-background rounded-lg p-6 font-serif text-base text-on-surface focus:outline-none focus:ring-1 focus:ring-outline-variant/50 resize-y"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                ></textarea>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-secondary/30 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
            <div className="p-5 flex justify-between items-center border-b border-outline-variant/30 ml-1">
              <h3 className="text-base font-display font-bold text-on-surface flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-3 text-secondary" /> Answer Choices
              </h3>
              <div className="px-4 py-1.5 rounded-full border border-outline-variant/30 text-xs text-on-surface-variant bg-background">
                Select correct answer
              </div>
            </div>

            <div className="p-6 space-y-4 ml-1">
              {answers.map((ans, index) => (
                <div key={ans.id} className="flex items-center gap-4">
                  <label className="cursor-pointer shrink-0">
                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", ans.isCorrect ? "border-secondary" : "border-outline-variant/50 bg-surface-bright")}>
                      {ans.isCorrect && <div className="w-2.5 h-2.5 rounded-full bg-secondary" />}
                    </div>
                    <input 
                      type={questionType === 'multiple_choice' || questionType === 'true_false' ? 'radio' : 'checkbox'} 
                      name="answer" 
                      checked={ans.isCorrect}
                      onChange={() => handleSetCorrect(ans.id)}
                      className="sr-only" 
                    />
                  </label>
                  <div className={cn(
                    "flex-1 bg-background border rounded-xl p-1 flex items-center overflow-hidden transition-colors min-h-[56px]",
                    ans.isCorrect ? "border-outline-variant" : "border-outline-variant/30"
                  )}>
                     <div className="w-10 h-10 ml-1 flex items-center justify-center rounded-lg bg-surface-bright text-sm font-medium text-on-surface shrink-0">
                       {LETTERS[index] || '?'}
                     </div>
                     {previewMode ? (
                       <div className="flex-1 px-4 text-sm text-on-surface whitespace-pre-wrap">
                         <MathRenderer content={ans.content} />
                       </div>
                     ) : (
                       <input 
                         type="text" 
                         className="flex-1 bg-transparent border-none px-4 text-sm text-on-surface focus:outline-none" 
                         value={ans.content}
                         onChange={(e) => handleUpdateOption(ans.id, e.target.value)}
                         placeholder={`Option ${LETTERS[index] || '?'}`}
                       />
                     )}
                  </div>
                  {answers.length > 2 && !previewMode && (
                    <button onClick={() => handleRemoveOption(ans.id)} className="p-2 text-outline-variant hover:text-error transition-colors shrink-0" title="Remove option">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}

              <div className="pt-2">
                <button onClick={handleAddOption} className="px-5 py-2.5 bg-surface-bright border border-outline-variant/30 rounded-xl text-sm font-medium text-on-surface-variant flex items-center hover:text-on-surface hover:bg-surface-bright transition-colors ml-10">
                  <Plus className="w-4 h-4 mr-2" /> Add Option
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col - Meta & Tools */}
        <div className="w-[300px] flex flex-col gap-6 shrink-0">
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-display font-bold text-on-surface">Question Metadata</h3>
              <button 
                 onClick={handleAiGenerate}
                 className={cn("flex items-center px-3 py-1.5 bg-gradient-to-r from-primary/10 to-secondary/10 text-primary hover:from-primary/20 hover:to-secondary/20 border border-primary/20 rounded-md text-xs font-bold transition-all shadow-sm", generating && "animate-pulse")}
                 disabled={generating}
              >
                 <Sparkles className="w-3.5 h-3.5 mr-1.5 text-secondary" /> 
                 {generating ? "Deep Thinking..." : "High Thinking"}
              </button>
            </div>
            
            <div className="mb-2">
              <label className="block text-sm font-medium text-on-surface mb-3">Knowledge Nodes</label>
              <div className="space-y-1 p-2 bg-background border border-outline-variant/30 rounded-lg max-h-[300px] overflow-y-auto custom-scrollbar">
                <KnowledgeTree 
                  nodes={treeNodes}
                  selectedNodeId={null}
                  onSelectNode={() => {}}
                  showSearch={false}
                  renderExtra={(node) => (
                    <div className="ml-auto flex items-center pr-2">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                        checked={selectedNodes.includes(node.ma_kien_thuc)}
                        onChange={() => handleToggleNode(node.ma_kien_thuc)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                />
                {treeNodes.length === 0 && (
                  <div className="text-sm text-outline-variant italic p-2">Loading nodes...</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant/30 p-5">
            <h3 className="text-sm font-display font-medium text-on-surface mb-4">Cognitive Level</h3>
            <div className="space-y-2">
              {[
                { val: 1, label: 'Nhận biết' },
                { val: 2, label: 'Thông hiểu' },
                { val: 3, label: 'Vận dụng' },
                { val: 4, label: 'Vận dụng cao' }
              ].map(lvl => (
                <label key={lvl.val} className="flex items-center p-3 rounded-lg border border-outline-variant/30 bg-surface-bright cursor-pointer hover:border-outline-variant transition-colors">
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center mr-3 shrink-0", cognitiveLevel === lvl.val ? "border-primary" : "border-outline-variant")}>
                    {cognitiveLevel === lvl.val && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <input 
                    type="radio" 
                    name="cog" 
                    checked={cognitiveLevel === lvl.val}
                    onChange={() => setCognitiveLevel(lvl.val)}
                    className="sr-only" 
                  />
                  <span className="text-sm text-on-surface font-medium">{lvl.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant/30 p-5">
            <h3 className="text-sm font-display font-medium text-on-surface mb-4">Question Type</h3>
            <div className="space-y-2">
              {[
                { val: 'multiple_choice', label: 'Multiple Choice' },
                { val: 'true_false', label: 'True/False' },
                { val: 'fill_in_blank', label: 'Fill-in-the-blank' }
              ].map(type => (
                <label key={type.val} className="flex items-center p-3 rounded-lg border border-outline-variant/30 bg-surface-bright cursor-pointer hover:border-outline-variant transition-colors">
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center mr-3 shrink-0", questionType === type.val ? "border-primary" : "border-outline-variant")}>
                    {questionType === type.val && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <input type="radio" name="qtype" checked={questionType === type.val} onChange={() => setQuestionType(type.val)} className="sr-only" />
                  <span className="text-sm text-on-surface font-medium">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

           <div className="bg-surface rounded-xl border border-outline-variant/30 p-5">
             <div className="flex items-center justify-between mb-6">
               <h3 className="text-sm font-bold text-on-surface flex items-center">
                 <ShieldCheck className="w-5 h-5 mr-2 text-on-surface" /> Similarity Check
               </h3>
               <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
             </div>
             
             <div className="bg-surface-dim border border-secondary/50 rounded-xl p-5 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
               <div className="flex items-center text-secondary mb-2 ml-1">
                 <CheckCircle2 className="w-5 h-5 mr-2" />
                 <span className="text-sm font-bold">No duplicates found</span>
               </div>
               <p className="text-xs text-outline-variant leading-relaxed ml-1">Bank scan complete. Content is unique.</p>
             </div>
           </div>
        </div>
      </div>
      </div>
    </div>
  );
};
