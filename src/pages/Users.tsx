import React, { useState, useEffect } from 'react';
import { Download, Plus, Search, X, Database, GitBranch } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../supabaseClient';
import { DeleteModal } from '../components/DeleteModal';
import { useSettings } from '../contexts/SettingsContext';

export const Users = () => {
  const { language } = useSettings();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('user_id', { ascending: true });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      if (selectedItems.length === 0) return;
      
      const { error } = await supabase.from('users').delete().in('user_id', selectedItems);
      if (error) throw error;
      
      setSelectedItems([]);
      setBulkDeleteConfirm(false);
      fetchUsers();
    } catch (err: any) {
      console.error(err);
      alert((language === 'vi' ? 'Lỗi xóa người dùng: ' : 'Error bulk deleting users: ') + err.message);
    }
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredUsers.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredUsers.map(u => u.user_id));
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.user_id || '').toLowerCase().includes(q) || (u.ho_ten || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6 h-full max-w-6xl mx-auto pb-10">
      <div className="flex justify-between items-end mb-4 border-b border-outline-variant/50 pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-on-surface mb-2">{language === 'vi' ? 'Quản lý Người dùng' : 'User Management'}</h1>
          <p className="text-xs text-on-surface-variant font-mono">{language === 'vi' ? 'Hệ thống / Quản lý danh sách người dùng (phân quyền theo User ID).' : 'System Users / Manage users (authorized by User ID).'}</p>
        </div>
        <div className="flex gap-3 relative top-2">
           <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-outline" />
              </div>
              <input 
                type="text" 
                placeholder={language === 'vi' ? 'Tìm kiếm người dùng...' : 'Search users...'} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-surface shadow-sm border border-outline-variant rounded-full text-sm w-64 focus:outline-none focus:border-primary transition-all font-mono text-xs"
              />
            </div>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
          <div className="flex-1 bg-surface shadow-sm rounded-xl border border-outline-variant flex flex-col overflow-hidden">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center shrink-0">
              <h2 className="text-xl font-display font-semibold">{language === 'vi' ? 'Danh sách Người dùng' : 'Active Users'}</h2>
            <div className="flex gap-2">
              {selectedItems.length > 0 && (
                <button 
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2 bg-error hover:bg-error/90 text-on-primary font-medium rounded-lg text-sm transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                  {language === 'vi' ? `Xóa (${selectedItems.length})` : `Delete (${selectedItems.length})`}
                </button>
              )}
              <button onClick={() => {
                const csvContent = "data:text/csv;charset=utf-8," 
                  + "User ID,Ho Ten\n"
                  + users.map(u => `"${u.user_id}","${u.ho_ten || ''}"`).join("\n");
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "users_export.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }} className="px-4 py-2 border border-outline-variant rounded-lg text-sm flex items-center hover:bg-surface shadow-sm transition-colors">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase bg-surface shadow-sm-high sticky top-0">
                <tr>
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                      checked={selectedItems.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">USER ID</th>
                  <th className="px-6 py-4">{language === 'vi' ? 'HỌ TÊN' : 'FULL NAME'}</th>
                  <th className="px-6 py-4 text-right">{language === 'vi' ? 'HÀNH ĐỘNG' : 'ACTIONS'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-outline-variant">{language === 'vi' ? 'Đang tải...' : 'Loading users...'}</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-outline-variant">{language === 'vi' ? 'Không tìm thấy người dùng.' : 'No users found.'}</td></tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr key={user.user_id} className={cn("hover:bg-surface shadow-sm-high transition-colors", selectedItems.includes(user.user_id) && "bg-primary/5")}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                          checked={selectedItems.includes(user.user_id)}
                          onChange={(e) => toggleSelection(user.user_id, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded border bg-primary/20 text-primary border-primary/30 flex items-center justify-center font-bold mr-3">
                            {user.ho_ten ? user.ho_ten.charAt(0).toUpperCase() : (user.user_id ? user.user_id.charAt(0).toUpperCase() : '?')}
                          </div>
                          <div>
                            <div className="font-mono text-sm text-on-surface">{user.user_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-on-surface">{user.ho_ten || '—'}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          className="p-1 hover:bg-error/10 rounded text-outline hover:text-error transition-colors"
                          onClick={() => setItemToDelete(user)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
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
          onConfirm={async () => {
            try {
              // Check for dependencies
              const [q, a] = await Promise.all([
                supabase.from('cau_hoi').select('ma_cau_hoi').eq('nguoi_tao', itemToDelete.user_id).limit(1),
                supabase.from('ngu_lieu').select('ma_ngu_lieu').eq('nguoi_tao', itemToDelete.user_id).limit(1),
              ]);
              
              if ((q.data && q.data.length > 0) || (a.data && a.data.length > 0)) {
                alert(language === 'vi' ? 'Không thể xóa người dùng này vì họ đã tạo câu hỏi hoặc tài nguyên.' : 'Cannot delete this user because they have created questions or assets.');
                setItemToDelete(null);
                return;
              }

              await supabase.from('users').delete().eq('user_id', itemToDelete.user_id);
              fetchUsers();
              setItemToDelete(null);
            } catch(err) {
              console.error(err);
              alert(language === 'vi' ? 'Lỗi xóa người dùng' : 'Error deleting user');
            }
          }}
          title={
            <span>
              {language === 'vi' ? 'Xóa Người dùng' : 'Delete User'} <span className="text-error">{itemToDelete.user_id}</span>
            </span>
          }
          description={language === 'vi' ? 'Thao tác này sẽ xóa vĩnh viễn tài khoản người dùng khỏi hệ thống.' : 'This will permanently remove the user account from the system.'}
          stats={[
            { icon: <Database className="w-5 h-5" />, value: "100%", label: "DATA PURGED" },
            { icon: <GitBranch className="w-5 h-5" />, value: "Low", label: "SYSTEM IMPACT" }
          ]}
          slideText={language === 'vi' ? 'TRƯỢT ĐỂ XÁC NHẬN XÓA' : 'SLIDE TO EXECUTE PURGE'}
        />
      )}

      {bulkDeleteConfirm && (
        <DeleteModal
          isOpen={true}
          onClose={() => setBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title={language === 'vi' ? 'Xóa hàng loạt Người dùng' : 'Bulk Delete Users'}
          description={language === 'vi' ? `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedItems.length} người dùng đã chọn? Hành động này không thể hoàn tác.` : `Are you sure you want to permanently delete ${selectedItems.length} selected users? This action cannot be undone.`}
          stats={[
            { icon: <Database className="w-5 h-5" />, value: selectedItems.length.toString(), label: "USER COUNT" }
          ]}
          slideText={language === 'vi' ? 'TRƯỢT ĐỂ XÁC NHẬN XÓA' : 'SLIDE TO EXECUTE PURGE'}
        />
      )}
    </div>
  );
};
