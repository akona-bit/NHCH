import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Edit3, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { MathRenderer } from '../components/MathRenderer';
import { supabase } from '../supabaseClient';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { AlertModal } from '../components/AlertModal';
import { useSettings } from '../contexts/SettingsContext';

export const QuestionReview = () => {
  const { language } = useSettings();
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertInfo, setAlertInfo] = useState({ title: '', message: '' });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUser(data.user);
        fetchQuestions(data.user.id);
      } else {
        fetchQuestions(null);
      }
    });
  }, []);

  const fetchQuestions = async (userId: string | null = null) => {
    setLoading(true);
    try {
      // Load questions that are draft
      let query = supabase
        .from('cau_hoi')
        .select(`
          ma_cau_hoi,
          noi_dung,
          muc_do,
          ngay_cap_nhat,
          nguoi_tao,
          users!fk_ch_user_tao (ho_ten),
          ngu_lieu:ma_ngu_lieu (ma_ngu_lieu, noi_dung)
        `)
        .eq('tinh_trang', 'draft')
        .order('ngay_cap_nhat', { ascending: false });

      // Optional: If we want reviewers to not review their own questions, we would do:
      // if (userId) query = query.neq('nguoi_tao', userId);

      const { data: qData, error: qError } = await query;
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

  const handleStatusUpdate = async (status: 'published' | 'rejected' | 'archived') => {
    if (!selectedQuestion) return;
    
    if (status === 'published' && selectedQuestion.nguoi_tao === currentUser?.id) {
      setAlertInfo({
        title: language === 'vi' ? 'Không Hợp Lệ' : 'Invalid Action',
        message: language === 'vi' ? 'Bạn không thể tự duyệt câu hỏi do chính mình tạo ra!' : 'You cannot approve a question created by yourself!'
      });
      setAlertOpen(true);
      return;
    }
    
    if (status === 'rejected' && !notes.trim()) {
      setAlertInfo({
        title: language === 'vi' ? 'Thiếu Thông Tin' : 'Missing Information',
        message: language === 'vi' ? 'Bạn phải nhập lý do (Reviewer Notes) trước khi từ chối câu hỏi để tác giả biết cần sửa ở đâu.' : 'You must provide Reviewer Notes before rejecting a question so the author knows what to fix.'
      });
      setAlertOpen(true);
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('cau_hoi')
        .update({ tinh_trang: status })
        .eq('ma_cau_hoi', selectedQuestion.ma_cau_hoi);

      if (error) throw error;
      
      if (status === 'rejected' && selectedQuestion.nguoi_tao) {
        await supabase.from('notifications').insert({
          user_id: selectedQuestion.nguoi_tao,
          title: 'Câu hỏi của bạn bị từ chối / Question Rejected',
          message: `Câu hỏi ${selectedQuestion.ma_cau_hoi} đã bị từ chối với lý do: ${notes}`
        });
      }
      setNotes('');
      setSelectedQuestion(null); // Clear selection to hide it from the detail view
      fetchQuestions(currentUser?.id || null); // Reload list
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi duyệt: " + (err.message || JSON.stringify(err)));
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
      <AlertModal 
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        title={alertInfo.title}
        message={alertInfo.message}
      />
      <LoadingOverlay isLoading={processing} />
      {/* Queue Sidebar */}
      <div className="w-[350px] flex flex-col bg-surface shadow-sm rounded-xl border border-outline-variant overflow-hidden">
        <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface shadow-sm-high">
          <div>
            <h2 className="font-display font-semibold text-lg text-on-surface">{language === 'vi' ? 'Chờ Duyệt' : 'Pending Review'}</h2>
            <p className="text-xs text-on-surface-variant font-mono">{questions.length} {language === 'vi' ? 'câu hỏi chờ xử lý' : 'items awaiting action'}</p>
          </div>
          <button onClick={fetchQuestions} className="p-1.5 bg-background border border-outline-variant rounded hover:bg-surface-bright transition-colors text-outline" title={language === 'vi' ? 'Làm mới' : 'Refresh'}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="text-sm text-outline-variant text-center p-4">{language === 'vi' ? 'Đang tải hàng đợi...' : 'Loading queue...'}</div>
          ) : questions.length === 0 ? (
            <div className="text-sm text-outline-variant text-center p-4">{language === 'vi' ? 'Hàng đợi trống. Làm tốt lắm!' : 'Queue is empty. Great job!'}</div>
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
                  <span className="text-[10px] font-bold text-error flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-error mr-1.5"></span>{language === 'vi' ? 'Chờ duyệt' : 'Pending'}</span>
                </div>
                <p className="text-xs text-on-surface-variant font-mono line-clamp-2 mb-3">
                  {q.noi_dung}
                </p>
                <div className="flex justify-between items-center text-[10px] text-outline font-mono">
                  <div className="flex items-center">{language === 'vi' ? 'Bởi' : 'By'} {q.users?.ho_ten || (language === 'vi' ? 'Không rõ' : 'Unknown')}</div>
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
            <div className="flex justify-between items-center bg-surface-bright/50 p-5 rounded-2xl border border-outline-variant/50 shadow-sm backdrop-blur-md">
              <div>
                <div className="flex gap-3 mb-3 font-mono text-[10px] uppercase tracking-wider">
                  <span className="px-2.5 py-1 bg-background shadow-sm border border-outline-variant/50 rounded-md text-outline">ID: {selectedQuestion.ma_cau_hoi}</span>
                  <span className="px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-md text-primary font-bold">Lvl {selectedQuestion.muc_do}</span>
                  <span className="px-2.5 py-1 bg-secondary/10 border border-secondary/20 rounded-md text-secondary font-bold flex items-center">
                    {language === 'vi' ? 'Tác giả:' : 'Creator:'} {selectedQuestion.users?.ho_ten || (language === 'vi' ? 'Không rõ' : 'Unknown')} <span className="opacity-50 ml-1">({selectedQuestion.nguoi_tao ? selectedQuestion.nguoi_tao.substring(0, 8) : 'N/A'})</span>
                  </span>
                </div>
                <h1 className="text-2xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">{language === 'vi' ? 'Duyệt Câu Hỏi' : 'Review Submission'}</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {selectedQuestion.ngu_lieu && selectedQuestion.ngu_lieu.noi_dung && (
                <div className="bg-surface shadow-sm rounded-xl border border-outline-variant p-6 mb-6">
                  <h3 className="text-[10px] font-bold text-on-surface tracking-widest uppercase mb-4 flex items-center text-primary">
                    <FileText className="w-3 h-3 mr-2" /> {language === 'vi' ? 'NGỮ LIỆU' : 'STIMULUS / ASSET'}
                  </h3>
                  <div className="bg-background border border-outline-variant/50 rounded-lg p-5">
                    <MathRenderer 
                      content={selectedQuestion.ngu_lieu.noi_dung}
                      className="text-sm font-mono text-on-surface whitespace-pre-wrap"
                    />
                  </div>
                </div>
              )}

              <div className="bg-surface shadow-sm rounded-xl border border-outline-variant p-6 mb-6">
                <h3 className="text-[10px] font-bold text-on-surface tracking-widest uppercase mb-4 flex items-center">
                  <FileText className="w-3 h-3 mr-2" /> {language === 'vi' ? 'NỘI DUNG CÂU HỎI' : 'QUESTION CONTENT'}
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
                    <h4 className="text-xs font-bold text-on-surface mb-3 flex items-center">{language === 'vi' ? 'Lựa chọn' : 'Option'} {String.fromCharCode(65 + idx)}</h4>
                    <MathRenderer content={ans.noi_dung} className="text-sm font-mono text-on-surface" />
                    {ans.is_correct && (
                      <div className="mt-6 pt-3 border-t border-secondary/20 text-[10px] font-mono text-secondary">{language === 'vi' ? 'Đã đánh dấu là đáp án đúng' : 'Marked as Correct Key'}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Footer */}
            <div className="bg-surface shadow-sm rounded-xl border border-outline-variant p-4">
              <label className="block text-[10px] font-bold text-on-surface mb-2 tracking-widest uppercase">{language === 'vi' ? 'Ghi chú của người duyệt (Bắt buộc nếu từ chối)' : 'Reviewer Notes (Required for Rejection/Edit)'}</label>
              <textarea 
                className="w-full bg-background border border-outline-variant rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary font-mono text-on-surface resize-none mb-4"
                rows={3}
                placeholder={language === 'vi' ? "Thêm nhận xét về định dạng, độ chính xác, hoặc tính rõ ràng..." : "Add comments regarding formatting, correctness, or clarity..."}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              ></textarea>
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => handleStatusUpdate('rejected')}
                  disabled={processing}
                  className="px-6 py-2 border border-error/50 text-error hover:bg-error/10 rounded-lg text-sm font-bold flex items-center transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Từ chối' : 'Reject'}
                </button>
                <button 
                  onClick={() => handleStatusUpdate('published')}
                  disabled={processing || selectedQuestion.nguoi_tao === currentUser?.id}
                  title={selectedQuestion.nguoi_tao === currentUser?.id ? (language === 'vi' ? "Bạn không thể tự duyệt câu hỏi của mình" : "You cannot approve your own question") : ""}
                  className="px-8 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Duyệt' : 'Approve'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-outline">
            <p>{language === 'vi' ? 'Chọn một câu hỏi từ danh sách bên trái để duyệt.' : 'Select a question from the queue to review.'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

function FileText(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
}
