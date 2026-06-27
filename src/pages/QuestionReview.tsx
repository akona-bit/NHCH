import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Edit3, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { MathRenderer } from '../components/MathRenderer';
import { supabase } from '../supabaseClient';
import { LoadingOverlay } from '../components/LoadingOverlay';

export const QuestionReview = () => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUser(data.user);
    });
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      // Load questions that are draft
      const { data: qData, error: qError } = await supabase
        .from('cau_hoi')
        .select(`
          ma_cau_hoi,
          noi_dung,
          muc_do,
          ngay_cap_nhat,
          nguoi_tao,
          users:nguoi_tao (ho_ten)
        `)
        .eq('tinh_trang', 'draft')
        .order('ngay_cap_nhat', { ascending: false });

      if (qError) throw qError;
      setQuestions(qData || []);
      
      if (qData && qData.length > 0 && !selectedQuestion) {
        handleSelectQuestion(qData[0]);
      } else if (qData?.length === 0) {
        setSelectedQuestion(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (q: any) => {
    setSelectedQuestion(q);
    setAnswers([]);
    try {
      const { data } = await supabase
        .from('dap_an')
        .select('*')
        .eq('ma_cau_hoi', q.ma_cau_hoi);
      if (data) setAnswers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusUpdate = async (status: 'published' | 'archived') => {
    if (!selectedQuestion) return;
    
    // Check if the user is trying to approve their own question
    if (status === 'published' && selectedQuestion.nguoi_tao === currentUser?.id) {
      alert("Bạn không thể duyệt câu hỏi do chính mình tạo. (You cannot approve your own question.)");
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('cau_hoi')
        .update({ tinh_trang: status })
        .eq('ma_cau_hoi', selectedQuestion.ma_cau_hoi);

      if (error) throw error;
      setNotes('');
      fetchQuestions(); // Reload list
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  return (
    <div className="flex gap-6 h-full w-full relative">
      <LoadingOverlay isLoading={processing} />
      {/* Queue Sidebar */}
      <div className="w-[350px] flex flex-col bg-surface shadow-sm rounded-xl border border-outline-variant overflow-hidden">
        <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface shadow-sm-high">
          <div>
            <h2 className="font-display font-semibold text-lg text-on-surface">Pending Review</h2>
            <p className="text-xs text-on-surface-variant font-mono">{questions.length} items awaiting action</p>
          </div>
          <button onClick={fetchQuestions} className="p-1.5 bg-background border border-outline-variant rounded hover:bg-surface-bright transition-colors text-outline" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="text-sm text-outline-variant text-center p-4">Loading queue...</div>
          ) : questions.length === 0 ? (
            <div className="text-sm text-outline-variant text-center p-4">Queue is empty. Great job!</div>
          ) : (
            questions.map(q => (
              <div 
                key={q.ma_cau_hoi}
                onClick={() => handleSelectQuestion(q)}
                className={cn(
                  "bg-background rounded-lg p-4 cursor-pointer transition-colors border",
                  selectedQuestion?.ma_cau_hoi === q.ma_cau_hoi ? "border-primary/50  relative overflow-hidden" : "border-outline-variant hover:border-outline"
                )}
              >
                {selectedQuestion?.ma_cau_hoi === q.ma_cau_hoi && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                )}
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-mono bg-surface shadow-sm px-2 py-0.5 rounded border border-outline-variant text-on-surface">
                    Q-{q.ma_cau_hoi.toString().slice(0, 8)}
                  </span>
                  <span className="text-[10px] font-bold text-error flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-error mr-1.5"></span>Pending</span>
                </div>
                <p className="text-xs text-on-surface-variant font-mono line-clamp-2 mb-3">
                  {q.noi_dung}
                </p>
                <div className="flex justify-between items-center text-[10px] text-outline font-mono">
                  <div className="flex items-center">by {q.users?.ho_ten || 'Unknown'}</div>
                  <div>{formatDate(q.ngay_cap_nhat)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Review Content */}
      <div className="flex-1 flex flex-col gap-6">
        {selectedQuestion ? (
          <>
            <div className="flex justify-between items-center">
              <div>
                <div className="flex gap-2 mb-2 font-mono text-[10px]">
                  <span className="px-2 py-0.5 bg-surface shadow-sm border border-outline-variant rounded text-outline">ID: {selectedQuestion.ma_cau_hoi}</span>
                  <span className="px-2 py-0.5 bg-surface shadow-sm border border-outline-variant rounded text-on-surface">Lvl {selectedQuestion.muc_do}</span>
                </div>
                <h1 className="text-2xl font-display font-bold text-on-surface">Review Submission</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              <div className="bg-surface shadow-sm rounded-xl border border-outline-variant p-6">
                <h3 className="text-[10px] font-bold text-on-surface tracking-widest uppercase mb-4 flex items-center">
                  <FileText className="w-3 h-3 mr-2" /> QUESTION CONTENT
                </h3>
                <div className="bg-background border border-outline-variant/50 rounded-lg p-5">
                  <MathRenderer 
                    content={selectedQuestion.noi_dung}
                    className="text-sm font-mono text-on-surface whitespace-pre-wrap"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {answers.map((ans, idx) => (
                  <div key={ans.ma_dap_an} className={cn("rounded-xl p-5 border relative", ans.is_correct ? "bg-secondary/5 border-secondary/30" : "bg-background border-outline-variant")}>
                    {ans.is_correct && (
                      <div className="absolute top-4 right-4 text-secondary">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                    <h4 className="text-xs font-bold text-on-surface mb-3 flex items-center">Option {String.fromCharCode(65 + idx)}</h4>
                    <MathRenderer content={ans.noi_dung} className="text-sm font-mono text-on-surface" />
                    {ans.is_correct && (
                      <div className="mt-6 pt-3 border-t border-secondary/20 text-[10px] font-mono text-secondary">Marked as Correct Key</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Footer */}
            <div className="bg-surface shadow-sm rounded-xl border border-outline-variant p-4">
              <label className="block text-[10px] font-bold text-on-surface mb-2 tracking-widest uppercase">Reviewer Notes (Required for Rejection/Edit)</label>
              <textarea 
                className="w-full bg-background border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary font-mono text-on-surface resize-none mb-4"
                rows={3}
                placeholder="Add comments regarding formatting, correctness, or clarity..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              ></textarea>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => handleStatusUpdate('archived')}
                  disabled={processing}
                  className="px-6 py-2 border border-error/50 text-error hover:bg-error/10 rounded-lg text-sm font-bold flex items-center transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 mr-2" /> Reject
                </button>
                <button 
                  onClick={() => handleStatusUpdate('published')}
                  disabled={processing || selectedQuestion.nguoi_tao === currentUser?.id}
                  title={selectedQuestion.nguoi_tao === currentUser?.id ? "You cannot approve your own question" : ""}
                  className="px-8 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-outline">
            <p>Select a question from the queue to review.</p>
          </div>
        )}
      </div>
    </div>
  );
};

function FileText(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
}
