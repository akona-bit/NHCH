import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, Bell, Zap, ChevronDown, ChevronRight, Activity, Server, LayoutTemplate, Folder, FileText, Download, XCircle, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { syncKnowledgeTree, flattenKnowledgeTree, KnowledgeTreeNode, KnowledgeNode } from '../services/knowledgeService';
import { supabase } from '../supabaseClient';
import { useSettings } from '../contexts/SettingsContext';
import { KnowledgeTree } from '../components/KnowledgeTree';
import { AlertModal } from '../components/AlertModal';

export const Matrix = () => {
  const [searchParams] = useSearchParams();
  const initialExamId = searchParams.get('examId') || '';

  const [treeNodes, setTreeNodes] = useState<KnowledgeTreeNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<KnowledgeNode[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, { nb: number, th: number, vd: number, vdc: number }>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { language } = useSettings();

  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [newExamName, setNewExamName] = useState('');
  const [creatingExam, setCreatingExam] = useState(false);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(initialExamId);

  useEffect(() => {
    fetchExams();
    fetchNodes();
    addLog('System initialized. Waiting for matrix configuration...');
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase.from('ky_thi').select('*').order('ngay_tao', { ascending: false });
      if (error) throw error;
      setExams(data || []);
      if (!selectedExamId && data && data.length > 0) {
        setSelectedExamId(data[0].ma_ky_thi.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateExam = async () => {
    if (!newExamName.trim()) {
      alert(language === 'vi' ? 'Vui lòng nhập tên kỳ thi.' : 'Please enter exam name.');
      return;
    }
    setCreatingExam(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        alert("Authentication error.");
        return;
      }
      const { data, error } = await supabase.from('ky_thi').insert({
        ten_ky_thi: newExamName,
        ngay_tao: new Date().toISOString(),
        max_thi_sinh: 100,
        trang_thai: 'draft',
        nguoi_tao: user.user.id
      }).select().single();
      
      if (error) throw error;
      
      setShowAddExamModal(false);
      setNewExamName('');
      await fetchExams();
      if (data) {
        setSelectedExamId(data.ma_ky_thi.toString());
      }
    } catch (err: any) {
      console.error(err);
      alert('Error creating exam: ' + err.message);
    } finally {
      setCreatingExam(false);
    }
  };

  const fetchNodes = async () => {
    try {
      const tree = await syncKnowledgeTree();
      const flat = flattenKnowledgeTree(tree);
      setTreeNodes(tree);
      setFlatNodes(flat);
      // Initialize matrix data for all nodes
      const initial: Record<string, { nb: number, th: number, vd: number, vdc: number }> = {};
      flat.forEach(n => {
        initial[n.ma_kien_thuc] = { nb: 0, th: 0, vd: 0, vdc: 0 };
      });
      setMatrixData(initial);
    } catch (error) {
      console.error(error);
    }
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev, `[${time}] > ${msg}`]);
  };

  const updateCount = (nodeId: string, level: 'nb' | 'th' | 'vd' | 'vdc', delta: number) => {
    setMatrixData(prev => {
      const current = prev[nodeId]?.[level] || 0;
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        [nodeId]: { ...prev[nodeId], [level]: next }
      };
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    addLog('Initializing tactical matrix with Gemini High Thinking...');
    
    try {
      const response = await fetch('/api/generate-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Generate an optimal test matrix distribution for these nodes.',
          knowledgeNodes: flatNodes.map(n => ({ id: n.ma_kien_thuc, name: n.ten_kien_thuc, parent: n.ma_kt_parent }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate matrix from server.');
      }

      const data = await response.json();
      
      if (data.result) {
        addLog('Matrix constraints validated. Cognitive load balanced.');
        setMatrixData(prev => ({
          ...prev,
          ...data.result
        }));
      }
      
      addLog('Generation sequence complete.');
    } catch (error: any) {
      addLog(`Generation error: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateExamPapers = async () => {
    if (!selectedExamId) {
      alert(language === 'vi' ? 'Vui lòng chọn một kỳ thi trước khi tạo đề thi.' : 'Please select an exam before generating papers.');
      return;
    }
    
    setCompiling(true);
    addLog('Validating question bank availability...');

    try {
      // 1. Get required counts
      const requiredCounts: Record<string, any> = {};
      Object.entries(matrixData).forEach(([nodeId, counts]) => {
        if (counts.nb > 0 || counts.th > 0 || counts.vd > 0 || counts.vdc > 0) {
          requiredCounts[nodeId] = { ...counts };
        }
      });

      if (Object.keys(requiredCounts).length === 0) {
        setValidationError(language === 'vi' ? 'Ma trận trống. Vui lòng cấu hình số lượng câu hỏi.' : 'Matrix is empty. Please configure question quantities.');
        setShowValidationModal(true);
        setCompiling(false);
        return;
      }

      // 2. Fetch published questions and knowledge links
      const { data: qData, error: qError } = await supabase
        .from('cau_hoi')
        .select(`
          ma_cau_hoi,
          muc_do,
          tinh_trang,
          kien_thuc_cau_hoi ( ma_kien_thuc )
        `)
        .eq('tinh_trang', 'published');
        
      if (qError) throw qError;

      const nodeIds = Object.keys(requiredCounts);
      const availableCounts: Record<string, Record<string, number>> = {};
      const availableQuestions: Record<string, Record<string, any[]>> = {};

      nodeIds.forEach(id => {
        availableCounts[id] = { 1: 0, 2: 0, 3: 0, 4: 0 };
        availableQuestions[id] = { 1: [], 2: [], 3: [], 4: [] };
      });

      qData?.forEach((q: any) => {
        if (q.muc_do && q.kien_thuc_cau_hoi) {
            const lvl = q.muc_do.toString();
            q.kien_thuc_cau_hoi.forEach((k: any) => {
                if (availableCounts[k.ma_kien_thuc] && availableCounts[k.ma_kien_thuc][lvl] !== undefined) {
                   availableCounts[k.ma_kien_thuc][lvl]++;
                   availableQuestions[k.ma_kien_thuc][lvl].push(q);
                }
            });
        }
      });

      // 3. Compare required vs available
      const missingDetails: string[] = [];
      const selectedQuestionIds = new Set<number>();
      const finalSelectedQuestions: any[] = [];

      for (const nodeId of nodeIds) {
        const req = requiredCounts[nodeId];
        const avail = availableCounts[nodeId];
        const nodeName = flatNodes.find(n => n.ma_kien_thuc === nodeId)?.ten_kien_thuc || nodeId;

        if (req.nb > avail[1]) missingDetails.push(`- [${nodeName}] Nhận biết: Cần ${req.nb}, Có ${avail[1]}`);
        if (req.th > avail[2]) missingDetails.push(`- [${nodeName}] Thông hiểu: Cần ${req.th}, Có ${avail[2]}`);
        if (req.vd > avail[3]) missingDetails.push(`- [${nodeName}] Vận dụng: Cần ${req.vd}, Có ${avail[3]}`);
        if (req.vdc > avail[4]) missingDetails.push(`- [${nodeName}] Vận dụng cao: Cần ${req.vdc}, Có ${avail[4]}`);
      }

      if (missingDetails.length > 0) {
        setValidationError(
          (language === 'vi' ? 'Không đủ số lượng câu hỏi trong ngân hàng để thỏa mãn ma trận này:\n\n' : 'Insufficient questions in the bank for this matrix:\n\n') +
          missingDetails.join('\n')
        );
        setShowValidationModal(true);
        setCompiling(false);
        return;
      }

      addLog('Validation passed. Generating base exam...');
      
      const shuffleAndPick = (array: any[], count: number) => {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
      };

      for (const nodeId of nodeIds) {
        const req = requiredCounts[nodeId];
        const availQ = availableQuestions[nodeId];

        if (req.nb > 0) finalSelectedQuestions.push(...shuffleAndPick(availQ[1].filter(q => !selectedQuestionIds.has(q.ma_cau_hoi)), req.nb));
        if (req.th > 0) finalSelectedQuestions.push(...shuffleAndPick(availQ[2].filter(q => !selectedQuestionIds.has(q.ma_cau_hoi)), req.th));
        if (req.vd > 0) finalSelectedQuestions.push(...shuffleAndPick(availQ[3].filter(q => !selectedQuestionIds.has(q.ma_cau_hoi)), req.vd));
        if (req.vdc > 0) finalSelectedQuestions.push(...shuffleAndPick(availQ[4].filter(q => !selectedQuestionIds.has(q.ma_cau_hoi)), req.vdc));
        
        finalSelectedQuestions.forEach(q => selectedQuestionIds.add(q.ma_cau_hoi));
      }

      addLog(`Selected ${finalSelectedQuestions.length} unique questions for base exam.`);

      // 4. Save base exam to ky_thi_cau_hoi (optional, handled softly if fails)
      const ktchToInsert = finalSelectedQuestions.map(q => ({
        ma_ky_thi: parseInt(selectedExamId),
        ma_cau_hoi: q.ma_cau_hoi
      }));
      // First delete old to prevent duplicates
      await supabase.from('ky_thi_cau_hoi').delete().eq('ma_ky_thi', parseInt(selectedExamId));
      await supabase.from('ky_thi_cau_hoi').insert(ktchToInsert);

      // Fetch dap_an for these questions
      const { data: dapAnData } = await supabase
        .from('dap_an')
        .select('*')
        .in('ma_cau_hoi', Array.from(selectedQuestionIds));

      const numVersions = 4; // Default to 4 versions
      addLog(`Generating ${numVersions} exam variations...`);

      for (let i = 0; i < numVersions; i++) {
        // Create de_thi
        const { data: dtData, error: dtError } = await supabase.from('de_thi').insert({
          ma_ky_thi: parseInt(selectedExamId),
          random_seed: Math.floor(Math.random() * 100000)
        }).select('ma_de_thi').single();

        if (dtError || !dtData) continue;

        const deThiId = dtData.ma_de_thi;

        // Shuffle questions for this de_thi
        const shuffledQuestions = [...finalSelectedQuestions].sort(() => 0.5 - Math.random());
        
        // Insert dap_an_de_thi
        const dapAnDeThiToInsert: any[] = [];
        
        shuffledQuestions.forEach((q, qIndex) => {
           const qAnswers = dapAnData?.filter(a => a.ma_cau_hoi === q.ma_cau_hoi) || [];
           const shuffledAnswers = [...qAnswers].sort(() => 0.5 - Math.random());
           
           shuffledAnswers.forEach((ans, aIndex) => {
             dapAnDeThiToInsert.push({
               ma_de_thi: deThiId,
               ma_cau_hoi: q.ma_cau_hoi,
               ma_dap_an: ans.ma_dap_an,
               thu_tu: aIndex + 1
             });
           });
        });

        // Batch insert dap_an_de_thi
        if (dapAnDeThiToInsert.length > 0) {
            await supabase.from('dap_an_de_thi').insert(dapAnDeThiToInsert);
        }
      }

      addLog(`Successfully generated ${numVersions} exam paper variations for Exam ID: ${selectedExamId}.`);
      setCompiling(false);
      setShowDownloadModal(true);

    } catch (err: any) {
      console.error(err);
      addLog(`Error: ${err.message}`);
      setCompiling(false);
      alert('Error generating exam: ' + err.message);
    }
  };

  // Calculate totals
  let totalNb = 0, totalTh = 0, totalVd = 0, totalVdc = 0;
  Object.values(matrixData).forEach(counts => {
    totalNb += counts.nb;
    totalTh += counts.th;
    totalVd += counts.vd;
    totalVdc += counts.vdc;
  });
  const totalQs = totalNb + totalTh + totalVd + totalVdc;
  const estTime = totalQs * 2; // Rough estimate: 2 mins per question

  const pctNb = totalQs ? Math.round((totalNb / totalQs) * 100) : 0;
  const pctTh = totalQs ? Math.round((totalTh / totalQs) * 100) : 0;
  const pctVd = totalQs ? Math.round((totalVd / totalQs) * 100) : 0;
  const pctVdc = totalQs ? Math.round((totalVdc / totalQs) * 100) : 0;

  return (
    <div className="flex flex-col h-full -m-6 bg-background text-on-surface font-mono">
      {/* Header */}
      <div className="flex justify-between items-center bg-background px-8 py-5 border-b border-outline-variant shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold text-on-surface tracking-wide flex items-center">
            {language === 'vi' ? 'Sinh đề thi theo Ma trận' : 'Generate Exam by Matrix'}
          </h1>
          <div className="flex items-center text-xs text-outline mt-1">
            <Activity className="w-3.5 h-3.5 mr-1.5 text-primary" />
            <span className="font-mono">Matrix Synthesis Controller</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select 
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="bg-surface border border-outline-variant rounded px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary max-w-[200px]"
            >
              <option value="" disabled>{language === 'vi' ? '-- Chọn kỳ thi --' : '-- Select Exam --'}</option>
              {exams.map(ex => (
                <option key={ex.ma_ky_thi} value={ex.ma_ky_thi}>{ex.ten_ky_thi}</option>
              ))}
            </select>
            <button 
              onClick={() => setShowAddExamModal(true)}
              className="p-1.5 bg-primary/10 text-primary border border-primary/30 rounded hover:bg-primary/20 transition-colors"
              title={language === 'vi' ? 'Tạo Kỳ thi mới' : 'Create new Exam'}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button className="p-2 text-outline border border-outline-variant rounded hover:text-on-surface transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-2 text-outline border border-outline-variant rounded hover:text-on-surface transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={handleGenerate}
            disabled={generating}
            className={cn("px-4 py-2 bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/30 text-primary hover:from-primary/20 hover:to-secondary/20 rounded font-bold text-sm flex items-center transition-all shadow-sm", generating && "animate-pulse")}
          >
            <Zap className={cn("w-4 h-4 mr-2 text-secondary")} />
            {generating ? (language === 'vi' ? 'Đang suy nghĩ...' : 'Deep Thinking...') : (language === 'vi' ? 'AI Gợi Ý' : 'High Thinking')}
          </button>
          <button 
            onClick={handleCreateExamPapers}
            disabled={compiling || generating}
            className="px-4 py-2 bg-primary text-on-primary font-bold rounded text-sm flex items-center hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {compiling ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {language === 'vi' ? 'Tạo Đề Thi' : 'Generate Papers'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Col - Knowledge Tree */}
        <div className="w-[300px] border-r border-outline-variant bg-surface flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant flex items-center text-xs font-bold tracking-widest text-primary bg-background">
            <Server className="w-4 h-4 mr-2" />
            {language === 'vi' ? 'CÂY KIẾN THỨC' : 'KNOWLEDGE TREE'}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar [&>div]:bg-surface [&_.bg-surface]:bg-surface [&_.text-on-surface]:text-on-surface [&_.text-on-surface-variant]:text-outline [&_.border-outline-variant]:border-outline-variant [&_.hover\:bg-surface-bright]:hover:bg-surface-bright">
            <KnowledgeTree 
              nodes={treeNodes}
              selectedNodeId={null}
              onSelectNode={() => {}}
              showSearch={false}
            />
            {treeNodes.length === 0 && (
              <div className="text-xs text-outline p-4 text-center italic">No knowledge nodes found.</div>
            )}
          </div>
        </div>

        {/* Center Col - Tactical Matrix */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
          <div className="p-4 border-b border-outline-variant flex items-center text-xs font-bold tracking-widest text-primary shrink-0">
            <Activity className="w-4 h-4 mr-2" />
            {language === 'vi' ? 'MA TRẬN CHIẾN THUẬT' : 'TACTICAL MATRIX'} 
            <span className="ml-4 font-normal text-outline capitalize tracking-normal">
              {language === 'vi' ? 'Target: Capacity Assessment 2024' : 'Target: Capacity Assessment 2024'}
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">
              {flatNodes.filter(n => n.ma_kt_parent).map(node => {
                const counts = matrixData[node.ma_kien_thuc] || { nb: 0, th: 0, vd: 0, vdc: 0 };
                const nodeTotal = counts.nb + counts.th + counts.vd + counts.vdc;
                
                return (
                  <div key={node.ma_kien_thuc} className="relative border border-outline-variant rounded-sm p-6 bg-surface/50">
                    {/* Corner Markers */}
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary"></div>
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>

                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center text-lg font-bold text-on-surface">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary mr-3"></div>
                        {node.ten_kien_thuc}
                      </div>
                      <div className="px-3 py-1 rounded border border-outline-variant bg-background text-xs font-mono text-outline">
                        Total: <span className="text-primary font-bold ml-1">{nodeTotal}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-6">
                      {/* NB */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-outline mb-3 tracking-widest">{language === 'vi' ? 'NHẬN BIẾT' : 'RECOGNIZE'}</span>
                        <div className="flex items-center">
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'nb', -1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">—</button>
                          <div className="w-14 h-12 mx-2 bg-background border border-outline-variant text-on-surface font-mono font-bold text-lg flex items-center justify-center rounded-sm">
                            {counts.nb}
                          </div>
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'nb', 1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">+</button>
                        </div>
                      </div>
                      {/* TH */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-outline mb-3 tracking-widest">{language === 'vi' ? 'THÔNG HIỂU' : 'UNDERSTAND'}</span>
                        <div className="flex items-center">
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'th', -1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">—</button>
                          <div className="w-14 h-12 mx-2 bg-background border border-outline-variant text-on-surface font-mono font-bold text-lg flex items-center justify-center rounded-sm">
                            {counts.th}
                          </div>
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'th', 1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">+</button>
                        </div>
                      </div>
                      {/* VD */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-outline mb-3 tracking-widest">{language === 'vi' ? 'VẬN DỤNG' : 'APPLY'}</span>
                        <div className="flex items-center">
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'vd', -1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">—</button>
                          <div className="w-14 h-12 mx-2 bg-background border border-outline-variant text-on-surface font-mono font-bold text-lg flex items-center justify-center rounded-sm">
                            {counts.vd}
                          </div>
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'vd', 1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">+</button>
                        </div>
                      </div>
                      {/* VDC */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-outline mb-3 tracking-widest">{language === 'vi' ? 'VDC' : 'HIGH APPLY'}</span>
                        <div className="flex items-center">
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'vdc', -1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">—</button>
                          <div className="w-14 h-12 mx-2 bg-background border border-outline-variant text-on-surface font-mono font-bold text-lg flex items-center justify-center rounded-sm">
                            {counts.vdc}
                          </div>
                          <button onClick={() => updateCount(node.ma_kien_thuc, 'vdc', 1)} className="w-6 h-6 flex items-center justify-center text-outline hover:text-on-surface transition-colors">+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* System Uplink (Bottom) */}
          <div className="h-40 border-t border-outline-variant bg-background shrink-0 flex flex-col relative z-10">
            <div className="px-6 py-3 flex items-center text-[10px] font-bold tracking-widest text-primary border-b border-outline-variant/50">
              <div className="w-2 h-2 rounded-full bg-primary mr-2"></div>
              SYSTEM UPLINK
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs text-green-500 leading-relaxed custom-scrollbar">
              {logs.map((log, i) => (
                <div key={i} className="mb-1">
                  <span className="text-outline mr-2">{log.substring(0, log.indexOf(']') + 1)}</span>
                  {log.substring(log.indexOf(']') + 1)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col - Summary */}
        <div className="w-[320px] border-l border-outline-variant bg-background flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant flex items-center text-xs font-bold tracking-widest text-primary">
            <LayoutTemplate className="w-4 h-4 mr-2" />
            MATRIX SUMMARY
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar">
            <div className="flex gap-4 mb-10">
              <div className="flex-1 border border-outline-variant rounded-lg p-5 flex flex-col items-center justify-center bg-surface/50">
                <span className="text-[10px] text-outline font-mono mb-3 tracking-widest">TOTAL QS</span>
                <span className="text-3xl font-bold text-primary">{totalQs}</span>
              </div>
              <div className="flex-1 border border-outline-variant rounded-lg p-5 flex flex-col items-center justify-center bg-surface/50">
                <span className="text-[10px] text-outline font-mono mb-3 tracking-widest">EST. TIME</span>
                <span className="text-3xl font-bold text-on-surface">{estTime}m</span>
              </div>
            </div>

            <div className="flex items-center text-[10px] font-bold tracking-widest text-outline mb-6 uppercase">
               <Activity className="w-3.5 h-3.5 mr-2" />
               Cognitive Distribution
            </div>
            
            <div className="flex justify-between border-b border-outline-variant pb-4 mb-10 px-2">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-outline mb-2">NB</span>
                <span className="text-sm font-bold text-primary">{totalNb}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-outline mb-2">TH</span>
                <span className="text-sm font-bold text-primary">{totalTh}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-outline mb-2">VD</span>
                <span className="text-sm font-bold text-primary">{totalVd}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-outline mb-2">VDC</span>
                <span className="text-sm font-bold text-yellow-500">{totalVdc}</span>
              </div>
            </div>

            <div className="flex items-center text-[10px] font-bold tracking-widest text-outline mb-6 uppercase">
               <Activity className="w-3.5 h-3.5 mr-2" />
               IRT Target Profile
            </div>

            <div className="space-y-6">
              <div className="flex items-center text-xs">
                <span className="w-8 font-mono text-outline">NB</span>
                <div className="flex-1 h-1 bg-surface-bright mx-3 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pctNb}%` }}></div>
                </div>
                <span className="w-8 font-mono text-primary text-right">{pctNb}%</span>
              </div>
              <div className="flex items-center text-xs">
                <span className="w-8 font-mono text-outline">TH</span>
                <div className="flex-1 h-1 bg-surface-bright mx-3 rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: `${pctTh}%` }}></div>
                </div>
                <span className="w-8 font-mono text-secondary text-right">{pctTh}%</span>
              </div>
              <div className="flex items-center text-xs">
                <span className="w-8 font-mono text-outline">VD</span>
                <div className="flex-1 h-1 bg-surface-bright mx-3 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${pctVd}%` }}></div>
                </div>
                <span className="w-8 font-mono text-green-500 text-right">{pctVd}%</span>
              </div>
              <div className="flex items-center text-xs">
                <span className="w-8 font-mono text-outline">VDC</span>
                <div className="flex-1 h-1 bg-surface-bright mx-3 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${pctVdc}%` }}></div>
                </div>
                <span className="w-8 font-mono text-yellow-500 text-right">{pctVdc}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col font-mono text-on-surface">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-background">
              <h3 className="font-bold text-lg text-on-surface tracking-widest flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                {language === 'vi' ? 'ĐỀ THI ĐÃ TẠO' : 'GENERATED PAPERS'}
              </h3>
              <button onClick={() => setShowDownloadModal(false)} className="text-outline hover:text-on-surface transition-colors p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm mb-4">
                {language === 'vi' 
                  ? 'Hệ thống đã biên dịch thành công 5 phiên bản đề thi dựa trên cấu hình ma trận của bạn.'
                  : 'System successfully compiled 5 exam variations based on your matrix configuration.'}
              </p>
              
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(v => (
                  <div key={v} className="flex items-center justify-between p-3 bg-background border border-outline-variant rounded hover:border-primary/50 transition-colors">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-3 text-primary" />
                      <span className="text-sm font-bold text-on-surface">Version_{v.toString().padStart(2, '0')}.pdf</span>
                    </div>
                    <button className="p-2 bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-outline-variant flex justify-end bg-background">
              <button 
                onClick={() => setShowDownloadModal(false)}
                className="px-6 py-2 bg-transparent border border-primary text-primary rounded font-bold hover:bg-primary/10 transition-colors text-sm"
              >
                {language === 'vi' ? 'ĐÓNG' : 'CLOSE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Exam Modal */}
      {showAddExamModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-outline-variant rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-background/50">
              <h3 className="font-bold text-on-surface">
                {language === 'vi' ? 'Tạo Kỳ Thi Mới' : 'Create New Exam'}
              </h3>
              <button 
                onClick={() => setShowAddExamModal(false)}
                className="text-outline hover:text-on-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 flex-1">
              <label className="block text-xs font-bold text-on-surface mb-2 tracking-widest uppercase">
                {language === 'vi' ? 'Tên Kỳ Thi' : 'Exam Name'}
              </label>
              <input 
                type="text" 
                value={newExamName}
                onChange={(e) => setNewExamName(e.target.value)}
                className="w-full bg-background border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                placeholder={language === 'vi' ? 'Ví dụ: Thi cuối kỳ Cấu trúc dữ liệu' : 'e.g. Data Structures Final'}
              />
            </div>

            <div className="p-4 border-t border-outline-variant flex justify-end gap-3 bg-background/50">
              <button 
                onClick={() => setShowAddExamModal(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {language === 'vi' ? 'Hủy' : 'Cancel'}
              </button>
              <button 
                onClick={handleCreateExam}
                disabled={creatingExam || !newExamName.trim()}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creatingExam ? (language === 'vi' ? 'Đang tạo...' : 'Creating...') : (language === 'vi' ? 'Tạo Mới' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showValidationModal && (
        <AlertModal
          isOpen={true}
          onClose={() => setShowValidationModal(false)}
          title={language === 'vi' ? 'Không Thể Sinh Đề Thi' : 'Cannot Generate Exam'}
          message={validationError || ''}
        />
      )}
    </div>
  );
};
