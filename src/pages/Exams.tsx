import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter, Calendar, Users, Settings, MoreVertical, Clock, Trash2, Database, GitBranch, Link2Off, XCircle, Upload, FileSpreadsheet, LayoutTemplate } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../supabaseClient';
import { useSettings } from '../contexts/SettingsContext';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { DeleteModal } from '../components/DeleteModal';

export const Exams = () => {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const { language } = useSettings();

  const navigate = useNavigate();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newExam, setNewExam] = useState({
    ten_ky_thi: ''
  });

  const [searchQuery, setSearchQuery] = useState('');

  const filteredExams = exams.filter(e => {
    if (searchQuery && !e.ten_ky_thi.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ky_thi')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setExams(data || []);
    } catch (err) {
      console.error("Error fetching exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const createExam = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      
      if (!newExam.ten_ky_thi) {
        alert(language === 'vi' ? "Vui lòng nhập tên kỳ thi" : "Please enter the exam name");
        return;
      }

      const { data, error } = await supabase.from('ky_thi').insert({
        ten_ky_thi: newExam.ten_ky_thi,
        ngay_tao: new Date().toISOString(),
        max_thi_sinh: 100,
        trang_thai: 'draft',
        nguoi_tao: user.user.id
      }).select().single();
      
      if (error) {
        console.error("Create Exam Error:", error);
        alert((language === 'vi' ? 'Lỗi tạo kỳ thi: ' : 'Error creating exam: ') + error.message);
        return;
      }
      
      setShowAddModal(false);
      setNewExam({
        ...newExam,
        ten_ky_thi: '',
      });
      fetchExams();
    } catch (err: any) {
      console.error(err);
      alert((language === 'vi' ? 'Lỗi tạo kỳ thi: ' : 'Error creating exam: ') + err.message);
    }
  };

  const exportExamResults = async (id: number) => {
    try {
      const { data: bData, error } = await supabase
        .from('bai_lam')
        .select(`
          sbd, 
          diem_tho, 
          nang_luc, 
          diem_thuc,
          thi_sinh(ho_ten, email)
        `)
        .eq('ma_de_thi', id);
        
      if (error) throw error;
      
      if (!bData || bData.length === 0) {
        alert(language === 'vi' ? 'Không có dữ liệu bài làm cho kỳ thi này.' : 'No submission data for this exam.');
        return;
      }

      // Convert to CSV
      const headers = ['SBD', 'Họ Tên', 'Email', 'Điểm Thô', 'Năng Lực (Theta)', 'Điểm Thực', 'Xếp Loại'];
      
      const getXepLoai = (diem: number) => {
        if (diem >= 8.5) return 'Giỏi';
        if (diem >= 7.0) return 'Khá';
        if (diem >= 5.5) return 'Trung bình';
        if (diem >= 4.0) return 'Yếu';
        return 'Kém';
      };

      const rows = bData.map((row: any) => [
        row.sbd,
        row.thi_sinh?.ho_ten || '',
        row.thi_sinh?.email || '',
        row.diem_tho || 0,
        row.nang_luc?.toFixed(3) || 0,
        row.diem_thuc?.toFixed(2) || 0,
        getXepLoai(row.diem_thuc || 0)
      ]);
      
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + headers.join(',') + '\n' 
        + rows.map(e => e.join(',')).join('\n');
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Ket_Qua_Ky_Thi_${id}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
    } catch (err: any) {
      console.error(err);
      alert((language === 'vi' ? 'Lỗi xuất dữ liệu: ' : 'Error exporting data: ') + err.message);
    }
  };

  const deleteExam = async (id: number) => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('ky_thi')
        .delete()
        .eq('ma_ky_thi', id);
      if (error) throw error;
      await fetchExams();
    } catch (err) {
      console.error("Error deleting exam:", err);
      alert(language === 'vi' ? "Xóa kỳ thi thất bại." : "Failed to delete exam.");
    } finally {
      setDeleting(false);
      setItemToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    try {
      if (selectedItems.length === 0) return;
      setDeleting(true);
      
      await supabase.from('ky_thi_cau_hoi').delete().in('ma_ky_thi', selectedItems);
      await supabase.from('thi_sinh_ky_thi').delete().in('ma_ky_thi', selectedItems);
      
      const { error } = await supabase.from('ky_thi').delete().in('ma_ky_thi', selectedItems);
      if (error) throw error;
      
      setSelectedItems([]);
      setBulkDeleteConfirm(false);
      await fetchExams();
    } catch (err: any) {
      console.error(err);
      alert((language === 'vi' ? 'Lỗi xóa nhiều kỳ thi: ' : 'Error bulk deleting exams: ') + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredExams.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredExams.map(e => e.ma_ky_thi));
    }
  };

  return (
    <div className="flex gap-6 h-full max-w-7xl mx-auto pb-10 relative">
      <LoadingOverlay isLoading={deleting} isSaving={true} message={language === 'vi' ? 'Đang xóa...' : 'Deleting...'} />
      {/* Filters Sidebar */}
      <div className="w-64 bg-surface shadow-sm rounded-xl border border-outline-variant p-6 flex flex-col shrink-0">
        <div className="flex items-center mb-6">
          <Filter className="w-5 h-5 mr-3 text-outline" />
          <h2 className="font-display font-semibold text-lg">{language === 'vi' ? 'Bộ lọc' : 'Filters'}</h2>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-on-surface mb-2 tracking-widest uppercase">{language === 'vi' ? 'Tìm kiếm' : 'Search'}</label>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'vi' ? 'Tên kỳ thi...' : 'Exam name...'}
              className="w-full bg-background border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-on-surface">{language === 'vi' ? 'Quản lý Kỳ thi' : 'Exam Management'}</h1>
            <p className="text-xs text-on-surface-variant font-mono mt-1">{language === 'vi' ? `Tìm thấy ${exams.length} phiên thi` : `Found ${exams.length} exam sessions`}</p>
          </div>
          <div className="flex gap-3">
            {selectedItems.length > 0 && (
              <button onClick={() => setBulkDeleteConfirm(true)} className="px-4 py-2 bg-error text-on-primary border border-transparent font-medium rounded-lg text-sm flex items-center hover:bg-error/90 transition-colors">
                <Trash2 className="w-4 h-4 mr-2" /> {language === 'vi' ? `Xóa (${selectedItems.length})` : `Delete (${selectedItems.length})`}
              </button>
            )}
            <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-primary text-on-primary border border-transparent font-medium rounded-lg text-sm flex items-center hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4 mr-2" /> {language === 'vi' ? 'Tạo kỳ thi' : 'Create Exam'}
            </button>
          </div>
        </div>

        <div className="bg-surface shadow-sm rounded-xl border border-outline-variant overflow-hidden flex-1 flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase bg-surface shadow-sm-high border-b border-outline-variant sticky top-0">
                <tr>
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                      checked={selectedItems.length === filteredExams.length && filteredExams.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">{language === 'vi' ? 'MÃ KỲ THI' : 'EXAM CODE'}</th>
                  <th className="px-6 py-4">{language === 'vi' ? 'TÊN / MÔN HỌC' : 'NAME / COURSE'}</th>
                  <th className="px-6 py-4">{language === 'vi' ? 'THÔNG TIN' : 'INFO'}</th>
                  <th className="px-6 py-4 text-right">{language === 'vi' ? 'HÀNH ĐỘNG' : 'ACTIONS'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-outline-variant">{language === 'vi' ? 'Đang tải danh sách kỳ thi...' : 'Loading exams...'}</td></tr>
                ) : filteredExams.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-outline-variant">{language === 'vi' ? 'Không tìm thấy kỳ thi nào. Tạo một kỳ thi để bắt đầu.' : 'No exams found. Create one to get started.'}</td></tr>
                ) : (
                  filteredExams.map(exam => (
                    <tr key={exam.ma_ky_thi} className={cn("hover:bg-surface-bright shadow-sm-high transition-colors cursor-pointer group", selectedItems.includes(exam.ma_ky_thi) && "bg-primary/5")}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                          checked={selectedItems.includes(exam.ma_ky_thi)}
                          onChange={(e) => toggleSelection(exam.ma_ky_thi, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-on-surface">EXM-24-{exam.ma_ky_thi.toString().padStart(3, '0')}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-on-surface mb-1">{exam.ten_ky_thi}</div>
                        <div className="text-[10px] font-mono text-outline">{language === 'vi' ? 'Mã môn:' : 'Course code:'} {exam.ma_ky_thi}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-xs text-on-surface mb-1">
                          <Calendar className="w-3 h-3 mr-2 text-outline" /> 
                          {exam.ngay_tao ? new Date(exam.ngay_tao).toLocaleDateString() : 'TBD'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/matrix?examId=${exam.ma_ky_thi}`);
                            }}
                            className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 rounded transition-colors"
                            title={language === 'vi' ? 'Tạo Ma Trận' : 'Generate Matrix'}
                          >
                            <LayoutTemplate className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete(exam);
                            }}
                            className="p-1.5 text-outline hover:text-error hover:bg-error/10 rounded transition-colors"
                            title={language === 'vi' ? 'Xóa Kỳ Thi' : 'Delete Exam'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {itemToDelete && (
        <DeleteModal
          isOpen={true}
          onClose={() => setItemToDelete(null)}
          onConfirm={() => deleteExam(itemToDelete.ma_ky_thi)}
          title={
            <span>
              {language === 'vi' ? 'Xóa Kỳ Thi ' : 'Delete Exam '}
              <span className="text-error">{itemToDelete.ten_ky_thi}</span>
            </span>
          }
          description={
            language === 'vi' 
              ? `Hành động này sẽ xóa vĩnh viễn kỳ thi "${itemToDelete.ten_ky_thi}" khỏi hệ thống.`
              : `This will permanently remove the exam "${itemToDelete.ten_ky_thi}" from the system.`
          }
          slideText={language === 'vi' ? "TRƯỢT ĐỂ XÓA" : "SLIDE TO EXECUTE PURGE"}
        />
      )}

      {bulkDeleteConfirm && (
        <DeleteModal
          isOpen={true}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title={language === 'vi' ? 'Xóa Nhiều Kỳ Thi' : 'Bulk Delete Exams'}
          description={
            language === 'vi' 
              ? `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedItems.length} kỳ thi đã chọn? Dữ liệu phòng thi, thí sinh, ma trận đề sẽ bị xóa.`
              : `Are you sure you want to permanently delete ${selectedItems.length} selected exams? Rooms, candidates, and matrices data will be removed.`
          }
          stats={[
            { icon: <Database className="w-5 h-5" />, value: selectedItems.length.toString(), label: language === 'vi' ? "SỐ KỲ THI" : "EXAM COUNT" }
          ]}
          slideText={language === 'vi' ? "KÉO ĐỂ THỰC THI XÓA" : "SLIDE TO EXECUTE PURGE"}
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {/* ... Modal content ... */}
          <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-md shadow-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface">
              <h3 className="font-display font-bold text-lg text-on-surface">
                {language === 'vi' ? 'Tạo Kỳ Thi Mới' : 'Create New Exam'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-outline hover:text-on-surface p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-2 tracking-widest uppercase">
                  {language === 'vi' ? 'Tên Kỳ Thi' : 'Exam Name'}
                </label>
                <input 
                  type="text" 
                  value={newExam.ten_ky_thi}
                  onChange={(e) => setNewExam({...newExam, ten_ky_thi: e.target.value})}
                  className="w-full bg-background border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  placeholder={language === 'vi' ? 'Ví dụ: Thi cuối kỳ Cấu trúc dữ liệu' : 'e.g. Data Structures Final'}
                />
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant flex justify-end gap-3 bg-background/50">
              <button 
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {language === 'vi' ? 'Hủy' : 'Cancel'}
              </button>
              <button 
                onClick={createExam}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {language === 'vi' ? 'Tạo mới' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
