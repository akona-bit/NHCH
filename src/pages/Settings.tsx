import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { User, Settings as SettingsIcon, Shield, BadgeCheck, Save, X, Key, Camera } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../supabaseClient';

export const Settings = () => {
  const { language } = useSettings();
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    id: string;
    email: string;
    ho_ten: string;
    role: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    ho_ten: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        setUserProfile({
          id: user.id,
          email: user.email || '',
          ho_ten: profile.ho_ten || '',
          role: profile.role || 'User'
        });
        setFormData(prev => ({ ...prev, ho_ten: profile.ho_ten || '' }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userProfile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ ho_ten: formData.ho_ten })
        .eq('user_id', userProfile.id);

      if (error) throw error;
      setUserProfile(prev => prev ? { ...prev, ho_ten: formData.ho_ten } : null);
      alert('Cập nhật thông tin thành công!');
    } catch (err: any) {
      alert('Lỗi cập nhật: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      alert('Mật khẩu xác nhận không khớp!');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword
      });
      if (error) throw error;
      alert('Đổi mật khẩu thành công!');
      setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err: any) {
      alert('Lỗi đổi mật khẩu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-on-surface">Đang tải thông tin...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full flex flex-col animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-on-surface">Cài đặt Hệ thống</h1>
        <p className="text-on-surface-variant mt-2 text-sm">Quản lý thông tin tài khoản và bảo mật.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Sidebar Tabs */}
        <div className="w-full md:w-64 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('account')}
            className={cn(
              "w-full px-5 py-3 text-sm font-semibold transition-all duration-200 text-left rounded-lg flex items-center gap-3",
              activeTab === 'account'
                ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                : "bg-surface-bright/30 text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
            )}
          >
            <User className="w-4 h-4" /> Tài khoản
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "w-full px-5 py-3 text-sm font-semibold transition-all duration-200 text-left rounded-lg flex items-center gap-3",
              activeTab === 'security'
                ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                : "bg-surface-bright/30 text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
            )}
          >
            <Shield className="w-4 h-4" /> Bảo mật
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          {activeTab === 'account' && (
            <div className="glass-panel border-outline-variant rounded-xl overflow-hidden shadow-lg animate-slide-up">
              <div className="px-6 py-4 border-b border-outline-variant flex items-center gap-3 bg-surface-bright/20">
                <BadgeCheck className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-on-surface">Thông tin Cá nhân</h2>
              </div>
              
              <div className="p-6">
                <div className="flex flex-col sm:flex-row gap-8">
                  {/* Avatar */}
                  <div className="shrink-0 flex flex-col items-center gap-4">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-surface-bright bg-surface-dim shadow-xl relative group">
                      <img 
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.id}&backgroundColor=b6e3f4`}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-not-allowed">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Auto-generated</span>
                  </div>
                  
                  {/* Form Fields */}
                  <div className="flex-1 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          Họ và Tên
                        </label>
                        <input 
                          type="text" 
                          value={formData.ho_ten}
                          onChange={e => setFormData({...formData, ho_ten: e.target.value})}
                          className="w-full bg-surface-bright/50 border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                          Quyền hạn (Role)
                        </label>
                        <input 
                          type="text" 
                          value={userProfile?.role || 'User'}
                          readOnly
                          className="w-full bg-surface-dim/30 border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-outline-variant focus:outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                        Email liên hệ
                      </label>
                      <input 
                        type="email" 
                        value={userProfile?.email || ''}
                        readOnly
                        className="w-full bg-surface-dim/30 border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-outline-variant focus:outline-none cursor-not-allowed"
                      />
                      <p className="text-[10px] text-on-surface-variant mt-1">Email không thể thay đổi để đảm bảo định danh bảo mật.</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-outline-variant flex justify-end gap-4">
                  <button onClick={fetchProfile} className="px-5 py-2.5 border border-outline-variant text-on-surface hover:bg-surface-bright rounded-lg text-sm font-medium transition-colors">
                    Khôi phục
                  </button>
                  <button onClick={handleSaveProfile} disabled={saving} className="px-5 py-2.5 bg-primary text-on-primary hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                    <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="glass-panel border-outline-variant rounded-xl overflow-hidden shadow-lg animate-slide-up">
              <div className="px-6 py-4 border-b border-outline-variant flex items-center gap-3 bg-surface-bright/20">
                <Key className="w-5 h-5 text-secondary" />
                <h2 className="text-lg font-semibold text-on-surface">Đổi Mật Khẩu</h2>
              </div>
              <div className="p-6 space-y-6 max-w-md">
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Mật khẩu mới</label>
                    <input 
                      type="password" 
                      value={formData.newPassword}
                      onChange={e => setFormData({...formData, newPassword: e.target.value})}
                      className="w-full bg-surface-bright/50 border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all"
                      placeholder="Nhập mật khẩu mới"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Xác nhận mật khẩu</label>
                    <input 
                      type="password" 
                      value={formData.confirmPassword}
                      onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                      className="w-full bg-surface-bright/50 border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none transition-all"
                      placeholder="Nhập lại mật khẩu"
                    />
                 </div>
                 <div className="pt-4 border-t border-outline-variant flex justify-end">
                  <button onClick={handleChangePassword} disabled={saving || !formData.newPassword} className="px-5 py-2.5 bg-secondary text-on-secondary hover:bg-secondary/90 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                    <Shield className="w-4 h-4" /> {saving ? 'Đang xử lý...' : 'Cập Nhật Mật Khẩu'}
                  </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
