import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Database, Activity, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Layers, Server, FileUp, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { cn } from '../lib/utils';
import { useSettings } from '../contexts/SettingsContext';

export const IRTAnalysis = () => {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | ''>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState(1);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [apiUrl, setApiUrl] = useState('https://vact-irt-api.onrender.com/api/run-pipeline');
  const { language } = useSettings();
  
  // File upload states
  const [dataSource, setDataSource] = useState<'db' | 'file'>('db');
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const responseInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    const { data, error } = await supabase.from('ky_thi').select('*').order('ngay_tao', { ascending: false });
    if (!error && data) {
      setExams(data);
    }
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev, `[${time}] > ${msg}`]);
  };

  const handleRunIRT = async () => {
    if (!selectedExamId) {
      alert(language === 'vi' ? 'Vui lòng chọn kỳ thi trước.' : 'Please select an exam first.');
      return;
    }
    
    setAnalyzing(true);
    addLog(`Starting IRT pipeline for Exam ${selectedExamId}...`);
    
    try {
      // 1. Fetch de_thi for this exam
      addLog('Fetching test versions (de_thi)...');
      const { data: deThiData, error: dtError } = await supabase
        .from('de_thi')
        .select('ma_de_thi')
        .eq('ma_ky_thi', selectedExamId);
      if (dtError) throw dtError;
      const deThiIds = deThiData?.map(d => d.ma_de_thi) || [];
      
      if (deThiIds.length === 0) {
        throw new Error(language === 'vi' ? 'Không tìm thấy mã đề nào cho kỳ thi này.' : 'No test versions (Mã đề) found for this exam.');
      }
      addLog(`Found ${deThiIds.length} test versions.`);

      // 2. Fetch bai_lam (submissions)
      addLog('Fetching submissions (bai_lam)...');
      const { data: baiLamData, error: blError } = await supabase
        .from('bai_lam')
        .select('*')
        .in('ma_de_thi', deThiIds);
        
      if (blError) throw blError;
      if (!baiLamData || baiLamData.length === 0) {
        throw new Error(language === 'vi' ? 'Không tìm thấy bài làm nào cho kỳ thi này.' : 'No submissions found for this exam.');
      }
      addLog(`Found ${baiLamData.length} submissions.`);

      const sbds = baiLamData.map(b => b.sbd);

      // 3. Fetch du_lieu_bai_lam (detailed responses)
      addLog('Fetching detailed responses (du_lieu_bai_lam)...');
      const { data: dlData, error: dlError } = await supabase
        .from('du_lieu_bai_lam')
        .select('*')
        .in('sbd', sbds);
        
      if (dlError) throw dlError;
      addLog(`Found ${dlData?.length || 0} response records.`);

      // 4. Fetch dap_an_de_thi for scoring
      addLog('Fetching answer keys (dap_an_de_thi)...');
      const { data: dapanDeThiData } = await supabase
        .from('dap_an_de_thi')
        .select('ma_de_thi, ma_cau_hoi, ma_dap_an, thu_tu')
        .in('ma_de_thi', deThiIds);

      // 5. Fetch dap_an to determine correctness
      addLog('Fetching correct answers (dap_an.is_correct)...');
      const { data: allDapAn } = await supabase
        .from('dap_an')
        .select('ma_dap_an, is_correct');
      
      const correctDapAnIds = new Set(
        allDapAn?.filter(d => d.is_correct).map(d => d.ma_dap_an) || []
      );

      // 6. Build df_raw with SBD, MaDe, Gioi columns + Cau{N} scored as 0/1/-1
      // ctt.cal_diff and ctt.cal_disc expect: SBD, Raw, Null, MaDe, Gioi + Cau columns
      addLog('Scoring responses and building data matrix...');
      
      const df_raw_map: Record<string, any> = {};
      dlData?.forEach(row => {
        if (!df_raw_map[row.sbd]) {
          const bl = baiLamData.find(b => b.sbd === row.sbd);
          df_raw_map[row.sbd] = { 
            SBD: row.sbd,
            MaDe: bl?.ma_de_thi || 0,
            Gioi: bl?.gioi || ''
          };
        }
        df_raw_map[row.sbd][`Cau${row.vi_tri_cau}`] = row.dap_an;
      });

      // Score each student's responses
      const scored_df_raw = Object.values(df_raw_map).map((row: any) => {
        const md = row.MaDe;
        const scoredRow: any = { SBD: row.SBD, MaDe: md, Gioi: row.Gioi };
        
        Object.keys(row).forEach(k => {
          if (k.startsWith('Cau')) {
            const dapAnHocSinh = row[k]; // student's answer (e.g. 'A', 'B', 'C', 'D')
            
            if (dapAnHocSinh === null || dapAnHocSinh === undefined || dapAnHocSinh === '') {
              scoredRow[k] = -1; // blank/missing
            } else {
              // Find the correct answer for this position in this de_thi
              // dap_an_de_thi maps: (ma_de_thi, ma_cau_hoi, ma_dap_an) -> thu_tu
              // Student answered with a letter (e.g. A=1, B=2, C=3, D=4) or directly a position
              const answerEntries = dapanDeThiData?.filter(
                d => d.ma_de_thi === md
              ) || [];
              
              // Find if student's answer matches a correct dap_an
              const matchingEntry = answerEntries.find(d => d.thu_tu === dapAnHocSinh);
              if (matchingEntry && correctDapAnIds.has(matchingEntry.ma_dap_an)) {
                scoredRow[k] = 1;
              } else {
                scoredRow[k] = 0;
              }
            }
          }
        });
        return scoredRow;
      });

      addLog(`Scored ${scored_df_raw.length} submissions. Sending to Python API...`);
      addLog(`Connecting to API at: ${apiUrl}`);
      
      const payload = {
        ma_ky_thi: Number(selectedExamId),
        df_raw: scored_df_raw,
        df_answer: [] // Pre-scored, Python won't need to re-score
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const resData = await response.json();
      
      if (resData.status === 'error') {
        addLog(`Python API error: ${resData.message}`);
        if (resData.traceback) addLog(resData.traceback);
        throw new Error(resData.message);
      }
      
      addLog('Convergence achieved. Extracting item parameters.');
      addLog(`Items analyzed: ${resData.items?.length || 0}, Students: ${resData.bai_lam?.length || 0}`);
      setResults(resData);
      setStep(3);
      
    } catch (error: any) {
      addLog(`Error: ${error.message}`);
    }
    setAnalyzing(false);
  };

  const handleFileUpload = async () => {
    if (!responseFile) {
      alert(language === 'vi' ? 'Vui lòng chọn file bài làm.' : 'Please select a response file.');
      return;
    }
    
    setAnalyzing(true);
    addLog(`Starting IRT pipeline from uploaded file: ${responseFile.name}`);
    
    try {
      const baseUrl = apiUrl.replace('/api/run-pipeline', '');
      
      const readCsvFile = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const text = e.target?.result as string;
              const lines = text.split('\n').filter(l => l.trim());
              const headers = lines[0].split(',').map(h => h.trim());
              const rows = lines.slice(1).map(line => {
                const vals = line.split(',');
                const obj: any = {};
                headers.forEach((h, i) => {
                  const v = vals[i]?.trim();
                  if (v === '' || v === undefined) {
                    obj[h] = '';
                  } else {
                    obj[h] = isNaN(Number(v)) ? v : Number(v);
                  }
                });
                return obj;
              });
              resolve(rows);
            } catch (err) { reject(err); }
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      };

      if (answerFile) {
        // Mode 1: Có cả file bài làm + đáp án → Chấm điểm ở frontend, gửi pre-scored
        addLog(`Reading response file: ${responseFile.name}`);
        addLog(`Reading answer file: ${answerFile.name}`);
        
        const dfRaw = await readCsvFile(responseFile);
        const dfAnswer = await readCsvFile(answerFile);
        
        addLog(`Parsed ${dfRaw.length} responses, ${dfAnswer.length} answer keys.`);
        addLog('Scoring responses locally (chamDiem)...');
        
        // Build answer lookup: { MaDe: { Cau1: 'A', Cau2: 'B', ... } }
        const answerLookup: Record<number, Record<string, string>> = {};
        for (const row of dfAnswer) {
          const maDe = Number(row.MaDe);
          answerLookup[maDe] = {};
          for (const key of Object.keys(row)) {
            if (key.startsWith('Cau')) {
              answerLookup[maDe][key] = String(row[key]).trim().toUpperCase();
            }
          }
        }
        
        // Score each student's responses: 1 = correct, 0 = wrong, -1 = blank
        const cauCols = Object.keys(dfRaw[0] || {}).filter(k => k.startsWith('Cau'));
        const scoredData: number[][] = [];
        
        for (const student of dfRaw) {
          const maDe = Number(student.MaDe);
          const answers = answerLookup[maDe] || {};
          const scored: number[] = [];
          
          for (const col of cauCols) {
            const studentAns = String(student[col] || '').trim().toUpperCase();
            const correctAns = (answers[col] || '').toUpperCase();
            
            if (!studentAns || studentAns === '') {
              scored.push(-1); // blank
            } else if (studentAns === correctAns) {
              scored.push(1); // correct
            } else {
              scored.push(0); // wrong
            }
          }
          scoredData.push(scored);
        }
        
        const correctCounts = scoredData.map(row => row.filter(v => v === 1).length);
        const avgScore = (correctCounts.reduce((a, b) => a + b, 0) / correctCounts.length).toFixed(1);
        addLog(`Scoring complete. Avg raw score: ${avgScore}/${cauCols.length}`);
        
        // Send to /api/calibrate-irt-json
        const endpoint = `${baseUrl}/api/calibrate-irt-json`;
        addLog(`Sending scored data to ${endpoint}...`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cauCols,
            responses: scoredData
          })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const resData = await response.json();
        if (resData.status === 'error') {
          addLog(`Error: ${resData.message}`);
          throw new Error(resData.message);
        }
        
        addLog(`Calibration complete. ${resData.data?.length || 0} items analyzed.`);
        
        // Format results
        const formattedItems = resData.data?.map((item: any) => ({
          MaCauHoi: item.id,
          IRTa: item.a,
          IRTb: item.b,
          CTTDiff: null,
          CTTDisc: null,
          PtBis: null,
          QualityFlag: Math.abs(item.b) > 3 || item.a < 0.5 ? 'warn' : 'ok'
        })) || [];
        
        // Build student results
        const studentResults = dfRaw.map((student: any, i: number) => ({
          SBD: student.SBD || `Student_${i + 1}`,
          DiemTho: correctCounts[i],
          NangLuc: null,
          DiemThuc: null
        }));
        
        setResults({ items: formattedItems, bai_lam: studentResults });
        setStep(3);
        
      } else {
        // Mode 2: Chỉ có 1 file (pre-scored) → Upload trực tiếp
        const endpoint = `${baseUrl}/api/calibrate-irt`;
        addLog(`Uploading file to ${endpoint}...`);
        
        const formData = new FormData();
        formData.append('file', responseFile);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const resData = await response.json();
        if (resData.status === 'error') throw new Error(resData.message);
        
        addLog(`Calibration complete. ${resData.data?.length || 0} items analyzed.`);
        
        const formattedItems = resData.data?.map((item: any) => ({
          MaCauHoi: item.id,
          IRTa: item.a,
          IRTb: item.b,
          CTTDiff: null,
          CTTDisc: null,
          PtBis: null,
          QualityFlag: Math.abs(item.b) > 3 || item.a < 0.5 ? 'warn' : 'ok'
        })) || [];
        
        setResults({ items: formattedItems, bai_lam: [] });
        setStep(3);
      }
    } catch (error: any) {
      addLog(`Error: ${error.message}`);
    }
    setAnalyzing(false);
  };

  const handleApplyToDB = async () => {
    addLog('Connecting to database for batch updates...');
    try {
      if (!results || !results.bai_lam || !results.items) {
        throw new Error(language === 'vi' ? 'Không có kết quả để cập nhật.' : 'No results to update.');
      }
      
      // Update bai_lam scores
      addLog(`Updating ${results.bai_lam.length} submissions...`);
      let blSuccess = 0;
      for (const bl of results.bai_lam) {
        const { error } = await supabase.from('bai_lam')
          .update({
            diem_tho: bl.DiemTho,
            nang_luc: bl.NangLuc,
            diem_thuc: bl.DiemThuc
          })
          .eq('sbd', bl.SBD);
        if (!error) blSuccess++;
      }
      addLog(`Updated ${blSuccess}/${results.bai_lam.length} submissions.`);

      // Update item_analysis
      // MaCauHoi from Python API = "Cau1", "Cau2", etc. (position-based)
      // We parse the number and store it as position identifier
      addLog(`Updating ${results.items.length} item parameters...`);
      let itemSuccess = 0;
      for (const item of results.items) {
        const positionId = parseInt(String(item.MaCauHoi).replace(/\D/g, ''));
        
        const { error } = await supabase.from('item_analysis')
          .upsert({
            ma_cau_hoi: positionId,
            ma_ky_thi: selectedExamId,
            ctt_diff: item.CTTDiff,
            ctt_disc: item.CTTDisc,
            pt_bis: item.PtBis,
            irt_a: item.IRTa,
            irt_b: item.IRTb,
            quality_flag: item.QualityFlag
          }, { onConflict: 'ma_cau_hoi, ma_ky_thi' });
        if (!error) itemSuccess++;
      }
      addLog(`Updated ${itemSuccess}/${results.items.length} item parameters.`);

      addLog(`Successfully updated database.`);
      alert(language === 'vi' ? 'Đã cập nhật tham số IRT vào cơ sở dữ liệu thành công!' : 'IRT parameters have been successfully updated in the database!');
      setStep(1);
      setResults(null);
      setLogs([]);
    } catch (err: any) {
      addLog(`Error updating database: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full -m-6 bg-background text-on-surface-variant font-mono text-sm selection:bg-primary/30">
      {/* Header */}
      <div className="flex justify-between items-center bg-surface px-6 py-4 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-display font-bold text-primary tracking-widest flex items-center">
            IRT_CALIB_NODE
          </h1>
          <div className="flex items-center text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-sm border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse"></span>
            IDLE
          </div>
        </div>
        
        <div className="flex-1 max-w-md mx-8 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">&gt;</span>
          <input 
            type="text"
            placeholder="grep parameters ..."
            className="w-full bg-background border border-outline-variant rounded-sm py-1.5 pl-8 pr-4 text-xs text-on-surface focus:border-primary focus:outline-none placeholder-outline-variant/50"
          />
        </div>

        <div className="flex items-center gap-4 text-[10px] tracking-widest">
          <span>UPTIME: <span className="text-on-surface">99.9%</span></span>
          <span className="text-outline">T-0.00ms</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Flow */}
        <div className="w-[400px] border-r border-outline-variant bg-surface flex flex-col shrink-0 p-6 overflow-y-auto custom-scrollbar">
          <h2 className="text-xs font-bold tracking-widest text-outline mb-6 flex items-center">
            [*] EXECUTION_PIPELINE
          </h2>

          <div className="space-y-6">
            {/* Step 1: Upload */}
            <div className={cn("relative p-4 border border-outline-variant bg-background transition-opacity", step >= 1 ? "opacity-100" : "opacity-50")}>
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/50"></div>
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/50"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>
              
              <div className="flex items-center mb-4">
                <h3 className={cn("font-bold text-xs tracking-wider", step > 1 ? "text-primary" : "text-on-surface")}>
                  [1] CONF_&_SYNC
                </h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-outline mb-1.5 block tracking-widest">
                    TARGET_ENDPOINT_URI
                  </label>
                  <input 
                    type="text" 
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="w-full bg-surface border border-outline-variant px-3 py-2 text-xs focus:border-primary focus:outline-none text-secondary"
                    placeholder="http://localhost:8000/api/run-pipeline"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-outline mb-1.5 block tracking-widest">
                    DATA_SOURCE
                  </label>
                  <div className="flex gap-1 bg-surface border border-outline-variant p-0.5">
                    <button
                      onClick={() => setDataSource('db')}
                      className={cn("flex-1 py-1.5 text-[10px] font-bold tracking-wider transition-colors flex items-center justify-center gap-1.5",
                        dataSource === 'db' ? "bg-primary text-on-primary" : "text-outline hover:text-on-surface"
                      )}
                    >
                      <Database className="w-3 h-3" /> DATABASE
                    </button>
                    <button
                      onClick={() => setDataSource('file')}
                      className={cn("flex-1 py-1.5 text-[10px] font-bold tracking-wider transition-colors flex items-center justify-center gap-1.5",
                        dataSource === 'file' ? "bg-primary text-on-primary" : "text-outline hover:text-on-surface"
                      )}
                    >
                      <FileUp className="w-3 h-3" /> EXCEL/CSV
                    </button>
                  </div>
                </div>

                {dataSource === 'db' ? (
                  <div>
                    <label className="text-[10px] font-bold text-outline mb-1.5 block tracking-widest">
                      SELECT EXAM (KY THI)
                    </label>
                    <select
                      value={selectedExamId}
                      onChange={(e) => { setSelectedExamId(Number(e.target.value)); setStep(1); }}
                      className="w-full bg-surface border border-outline-variant px-3 py-2 text-xs focus:border-primary focus:outline-none text-on-surface"
                    >
                      <option value="">-- Select Exam --</option>
                      {exams.map(ex => (
                        <option key={ex.ma_ky_thi} value={ex.ma_ky_thi}>{ex.ten_ky_thi}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-outline mb-1.5 block tracking-widest">
                        {language === 'vi' ? 'FILE BÀI LÀM (CSV/XLSX)' : 'RESPONSE FILE (CSV/XLSX)'} *
                      </label>
                      <input type="file" ref={responseInputRef} accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={(e) => setResponseFile(e.target.files?.[0] || null)} />
                      <button
                        onClick={() => responseInputRef.current?.click()}
                        className={cn("w-full py-2 px-3 border border-dashed text-xs flex items-center gap-2 transition-colors",
                          responseFile ? "border-primary bg-primary/5 text-primary" : "border-outline-variant text-outline hover:border-primary hover:text-on-surface"
                        )}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {responseFile ? responseFile.name : (language === 'vi' ? 'Chọn file bài làm...' : 'Select response file...')}
                        {responseFile && <X className="w-3 h-3 ml-auto" onClick={(e) => { e.stopPropagation(); setResponseFile(null); }} />}
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-outline mb-1.5 block tracking-widest">
                        {language === 'vi' ? 'FILE ĐÁP ÁN (TÙY CHỌN)' : 'ANSWER KEY FILE (OPTIONAL)'}
                      </label>
                      <input type="file" ref={answerInputRef} accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={(e) => setAnswerFile(e.target.files?.[0] || null)} />
                      <button
                        onClick={() => answerInputRef.current?.click()}
                        className={cn("w-full py-2 px-3 border border-dashed text-xs flex items-center gap-2 transition-colors",
                          answerFile ? "border-secondary bg-secondary/5 text-secondary" : "border-outline-variant text-outline hover:border-secondary hover:text-on-surface"
                        )}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        {answerFile ? answerFile.name : (language === 'vi' ? 'Chọn file đáp án (nếu có)...' : 'Select answer key (if any)...')}
                        {answerFile && <X className="w-3 h-3 ml-auto" onClick={(e) => { e.stopPropagation(); setAnswerFile(null); }} />}
                      </button>
                      <p className="text-[9px] text-outline mt-1">
                        {language === 'vi' ? 'Không bắt buộc. Nếu không có, file bài làm phải đã chấm điểm (0/1/-1).' : 'Optional. If omitted, response file must be pre-scored (0/1/-1).'}
                      </p>
                    </div>
                  </>
                )}
              </div>
              
              {step === 1 && (
                <div className="mt-4 pt-4 border-t border-outline-variant">
                  <button 
                    onClick={() => setStep(2)}
                    disabled={dataSource === 'db' ? !selectedExamId : !responseFile}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    CONFIRM <span className="text-[10px]">↳</span>
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Calibrate */}
            <div className={cn("relative p-4 border border-outline-variant bg-background transition-opacity", step >= 2 ? "opacity-100" : "opacity-50")}>
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/50"></div>
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/50"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>
              
              <div className="flex items-center mb-4">
                <h3 className={cn("font-bold text-xs tracking-wider", step > 2 ? "text-primary" : "text-on-surface")}>
                  [2] 2PL_CALIBRATION
                </h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-[10px]">
                  <span className="text-outline">MODEL</span>
                  <span className="text-on-surface">2PL MMLE</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-outline">QUADRATURE</span>
                  <span className="text-on-surface">81 NODES</span>
                </div>
              </div>

              {step === 2 && (
                <div className="mt-4 pt-4 border-t border-outline-variant">
                  <button 
                    onClick={dataSource === 'db' ? handleRunIRT : handleFileUpload}
                    disabled={analyzing}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-on-primary font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {analyzing ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> EXECUTING...</>
                    ) : (
                      <><Play className="w-3.5 h-3.5" /> INIT_CALIB <span className="text-[10px]">↳</span></>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Step 3: Apply */}
            <div className={cn("relative p-4 border border-outline-variant bg-background transition-opacity", step >= 3 ? "opacity-100" : "opacity-50")}>
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-primary/50"></div>
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-primary/50"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>
              
              <div className="flex items-center mb-4">
                <h3 className="font-bold text-xs tracking-wider text-on-surface">
                  [3] COMMIT_STATE
                </h3>
              </div>
              
              <div className="text-[10px] text-outline mb-4">
                Write parameters back to `item_analysis` and `bai_lam` tables.
              </div>

              {step === 3 && (
                <div className="pt-2 border-t border-outline-variant">
                  <button 
                    onClick={handleApplyToDB}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-secondary text-on-secondary font-bold hover:bg-secondary/90 transition-colors"
                  >
                    <Database className="w-3.5 h-3.5" /> DB_UPDATE <span className="text-[10px]">↳</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Console & Results */}
        <div className="flex-1 flex flex-col min-w-0">
          
          <div className="h-64 border-b border-outline-variant bg-background p-4 font-mono text-[11px] overflow-y-auto custom-scrollbar">
            <div className="text-primary/50 mb-2">=== TERMINAL_OUTPUT ===</div>
            {logs.map((log, i) => (
              <div key={i} className={cn(
                "mb-1", 
                log.includes('Error') ? "text-error" : 
                log.includes('Convergence') ? "text-secondary" : 
                "text-outline-variant"
              )}>
                {log}
              </div>
            ))}
            {analyzing && (
              <div className="text-primary mt-2 animate-pulse">_</div>
            )}
          </div>

          <div className="flex-1 bg-surface p-6 overflow-y-auto custom-scrollbar">
            <h2 className="text-xs font-bold tracking-widest text-outline mb-4 flex items-center">
              [*] OUTPUT_MATRIX
            </h2>
            
            {results && results.items ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-primary mb-3">Item Analysis (Parameters)</h3>
                  <div className="overflow-x-auto border border-outline-variant">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-background text-outline border-b border-outline-variant">
                        <tr>
                          <th className="px-3 py-2 font-medium">ITEM_ID</th>
                          <th className="px-3 py-2 font-medium text-right">a (DISCR)</th>
                          <th className="px-3 py-2 font-medium text-right">b (DIFF)</th>
                          <th className="px-3 py-2 font-medium text-right">p-value</th>
                          <th className="px-3 py-2 font-medium text-right">FLAG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30">
                        {results.items.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-background/50">
                            <td className="px-3 py-2 text-on-surface font-bold">{r.MaCauHoi}</td>
                            <td className="px-3 py-2 text-right text-secondary">{r.IRTa?.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right text-secondary">{r.IRTb?.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{r.CTTDiff?.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                r.QualityFlag === 'ok' ? "bg-primary/20 text-primary" : 
                                r.QualityFlag === 'warn' ? "bg-secondary/20 text-secondary" :
                                "bg-error/20 text-error"
                              )}>
                                {r.QualityFlag}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-primary mb-3">Candidate Submissions (BaiLam)</h3>
                  <div className="overflow-x-auto border border-outline-variant">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-background text-outline border-b border-outline-variant">
                        <tr>
                          <th className="px-3 py-2 font-medium">SBD</th>
                          <th className="px-3 py-2 font-medium text-right">RAW SCORE</th>
                          <th className="px-3 py-2 font-medium text-right">THETA</th>
                          <th className="px-3 py-2 font-medium text-right">TRUE SCORE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30">
                        {results.bai_lam.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-background/50">
                            <td className="px-3 py-2 text-on-surface font-bold">{r.SBD}</td>
                            <td className="px-3 py-2 text-right text-on-surface-variant">{r.DiemTho}</td>
                            <td className="px-3 py-2 text-right text-secondary">{r.NangLuc?.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right text-secondary">{r.DiemThuc?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-outline border border-dashed border-outline-variant">
                <Activity className="w-8 h-8 mb-4 opacity-20" />
                <p>NO_DATA_AVAILABLE</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


