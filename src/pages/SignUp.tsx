import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { AlertCircle, Network, User, Mail, Shield, Key, Lock, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

export const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const navigate = useNavigate();
  const { language } = useSettings();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(language === 'vi' ? "Mật khẩu không khớp" : "Passwords do not match");
      return;
    }
    if (!agreed) {
      setError(language === 'vi' ? "Bạn phải đồng ý với Điều khoản dịch vụ" : "You must agree to the Terms of Service");
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else if (!data.session) {
      navigate('/signin', { 
        state: { 
          email, 
          message: language === 'vi' 
            ? "Tài khoản của bạn đã được tạo. Vui lòng kiểm tra email và xác minh địa chỉ trước khi đăng nhập." 
            : "Your account has been created. Please check your email and verify your address before logging in." 
        } 
      });
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-on-background selection:bg-primary/30">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-background border-r border-outline-variant items-center justify-center p-12">
        {/* Background elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="relative z-10 max-w-lg">
          <div className="w-16 h-16 bg-surface shadow-sm border border-outline-variant rounded-2xl mb-8 flex items-center justify-center shadow-inner">
            <Network className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-5xl font-display font-bold text-on-surface mb-6 leading-tight">
            VNU Admin <br />
            <span className="text-primary">Control Terminal</span>
          </h1>
          <p className="text-on-surface-variant text-lg font-light mb-8 leading-relaxed">
            {language === 'vi' 
              ? 'Hệ thống quản lý và điều hành tập trung dành cho cán bộ Đại học Quốc gia TP.HCM. Cấp quyền truy cập mới tại đây.'
              : 'Centralized management and operations system for VNU-HCM staff. Grant new access rights here.'}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full bg-surface shadow-sm-high border-2 border-surface-lowest flex items-center justify-center">
                  <Shield className="w-4 h-4 text-on-surface-variant" />
                </div>
              ))}
            </div>
            <p className="text-sm font-mono text-outline">
              {language === 'vi' ? 'Bảo mật' : 'Security'} <span className="text-primary font-bold">{language === 'vi' ? 'Cấp độ 4' : 'Level 4'}</span> {language === 'vi' ? 'được áp dụng' : 'applied'}
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-md my-auto py-8">
          <div className="lg:hidden text-center mb-10">
            <div className="w-12 h-12 bg-surface shadow-sm border border-outline-variant rounded-xl mx-auto mb-6 flex items-center justify-center">
              <Network className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold text-on-surface mb-3 tracking-tight">VACT Platform</h1>
          </div>

          <div className="mb-8 lg:mb-10">
            <h2 className="text-3xl font-display font-bold text-on-surface mb-3 tracking-tight">{language === 'vi' ? 'Đăng ký' : 'Sign Up'}</h2>
            <p className="text-sm text-on-surface-variant">{language === 'vi' ? 'Thiết lập tài khoản cán bộ mới của bạn' : 'Set up your new staff account'}</p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-on-surface">{language === 'vi' ? 'Họ và tên' : 'Full Name'}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary">
                  <User className="h-4.5 w-4.5 text-outline group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-on-surface transition-all placeholder:text-outline/50 shadow-sm"
                  placeholder="Nguyễn Văn A"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-on-surface">{language === 'vi' ? 'Email ĐHQG' : 'VNU Email'}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary">
                  <Mail className="h-4.5 w-4.5 text-outline group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-on-surface transition-all placeholder:text-outline/50 shadow-sm"
                  placeholder="user@vnu.edu.vn"
                />
              </div>
            </div>




            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-on-surface">{language === 'vi' ? 'Mật khẩu' : 'Password'}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key className="h-4.5 w-4.5 text-outline group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-12 pr-12 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-on-surface transition-all placeholder:text-outline/50 shadow-sm"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-outline hover:text-on-surface transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-on-surface">{language === 'vi' ? 'Xác nhận mật khẩu' : 'Confirm Password'}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4.5 w-4.5 text-outline group-focus-within:text-primary transition-colors" />
                </div>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-on-surface transition-all placeholder:text-outline/50 shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-start pt-2">
              <div className="flex items-center h-5">
                <input 
                  type="checkbox" 
                  id="terms" 
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-outline-variant bg-surface accent-primary mt-0.5 cursor-pointer shrink-0" 
                />
              </div>
              <label htmlFor="terms" className="ml-3 text-sm text-on-surface cursor-pointer leading-relaxed select-none">
                {language === 'vi' ? 'Tôi đồng ý với' : 'I agree to the'} <a href="#" className="text-primary hover:underline">{language === 'vi' ? 'Điều khoản dịch vụ' : 'Terms of Service'}</a> {language === 'vi' ? 'và' : 'and'} <a href="#" className="text-primary hover:underline">{language === 'vi' ? 'Chính sách bảo mật' : 'Privacy Policy'}</a>.
              </label>
            </div>

            {error && (
              <div className="flex items-start bg-error/10 border border-error/20 rounded-lg p-4 text-error text-sm">
                <AlertCircle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-primary text-on-primary font-medium rounded-lg text-sm flex items-center justify-center hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 mt-4"
            >
              {loading ? (language === 'vi' ? 'Đang xử lý...' : 'Processing...') : (language === 'vi' ? 'Đăng ký' : 'Sign Up')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-on-surface-variant">
              {language === 'vi' ? 'Đã có tài khoản?' : 'Already have an account?'} <Link to="/signin" className="text-primary font-medium hover:underline underline-offset-4">{language === 'vi' ? 'Đăng nhập' : 'Sign in'}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
