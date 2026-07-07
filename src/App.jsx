import { useState, useEffect } from 'react';
import QuanLyDanhSach from './components/QuanLyDanhSach';
import ThongKeDashboard from './components/ThongKeDashboard';
import PhanCongDashboard from './components/PhanCongDashboard';
import GiaoDienTho from './components/GiaoDienTho';
import { Toaster, toast } from 'react-hot-toast';
import { supabase } from './supabase';

function App() {
  const [activeTab, setActiveTab] = useState('danhsach'); 
const [session, setSession] = useState(null);
const [checkingSession, setCheckingSession] = useState(true); // MỚI: đang kiểm tra session ban đầu

// BIẾN MỚI: Tải Profile để lấy quyền ngay từ lúc khởi động app
const [profile, setProfile] = useState(null);
const [isProfileLoaded, setIsProfileLoaded] = useState(false);

  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    if (session) fetchProfile(session.user.id);
    else setIsProfileLoaded(true);
    setCheckingSession(false); // MỚI: đã biết chắc có/không có session
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    if (session) fetchProfile(session.user.id);
    else { setProfile(null); setIsProfileLoaded(true); }
    setCheckingSession(false); // MỚI
  });

  return () => subscription.unsubscribe();
}, []);

const fetchProfile = async (userId) => {
  setIsProfileLoaded(false); // MỚI: reset về false NGAY khi bắt đầu tải profile mới, tránh lọt qua màn hình chặn quyền
  const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
  if (error || !data) {
    setTimeout(async () => {
      const retry = await supabase.from('user_profiles').select('*').eq('id', userId).single();
      setProfile(retry.data || null);
      setIsProfileLoaded(true);
    }, 500);
    return;
  }

  setProfile(data);
  setIsProfileLoaded(true);
};

  // LOGIC ĐIỀU HƯỚNG TỰ ĐỘNG: Đá user về đúng màn hình họ có quyền
  useEffect(() => {
    if (isProfileLoaded && profile && profile.role !== 'admin') {
      const access = profile.tabs_access || [];
      let isAllowed = false;
      
      // Tab Phân Công không còn cấp qua checkbox phân quyền nữa -> chỉ Tổ trưởng (la_to_truong) mới có quyền
      if (activeTab === 'phancong' && profile.la_to_truong) isAllowed = true;
      if (activeTab === 'nhanviec' && access.includes('app_nhan_viec')) isAllowed = true;
      if (activeTab === 'danhsach' && access.includes('app_dieu_hanh')) isAllowed = true;
      if (activeTab === 'thongke' && access.includes('app_thong_ke')) isAllowed = true;

      // Nếu đang đứng ở Tab không có quyền -> Tự động chuyển qua Tab hợp lệ đầu tiên
      if (!isAllowed && (access.length > 0 || profile.la_to_truong)) {
        if (access.includes('app_nhan_viec')) setActiveTab('nhanviec');
        else if (access.includes('app_dieu_hanh')) setActiveTab('danhsach');
        else if (profile.la_to_truong) setActiveTab('phancong');
        else if (access.includes('app_thong_ke')) setActiveTab('thongke');
      }
    }
  }, [profile, isProfileLoaded, activeTab]);

  // KIỂM TRA QUYỀN ĐỂ ẨN/HIỆN NÚT BẤM DƯỚI ĐÁY MÀN HÌNH
  const isAdmin = profile?.role === 'admin';
  const access = profile?.tabs_access || [];

  // Tab Phân Công: chỉ Admin hoặc Tổ trưởng (la_to_truong) mới thấy - không còn cấp qua phân quyền tabs_access
  const canPhanCong = isAdmin || profile?.la_to_truong === true;
  const canNhanViec = isAdmin || access.includes('app_nhan_viec');
  const canDieuHanh = isAdmin || access.includes('app_dieu_hanh');
  const canThongKe = isAdmin || access.includes('app_thong_ke');

  // MỚI: Đang kiểm tra session ban đầu -> hiện màn hình chờ, TRÁNH chớp login form
if (checkingSession || (session && !isProfileLoaded)) {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center text-blue-500">
         <i className="fa-solid fa-circle-notch animate-spin text-4xl mb-3"></i>
         <p className="font-bold text-xs animate-pulse">Đang tải dữ liệu...</p>
      </div>
    </div>
  );
}

// CHỐT CHẶN BẢO MẬT: TỰ DỰNG GIAO DIỆN ĐĂNG NHẬP NỘI BỘ (KHÔNG PHỤ THUỘC FILE NGOÀI)
if (!session) {
  const handleInlineLogin = async (e) => {
      e.preventDefault();
      const email = e.target.elements.email.value;
      const password = e.target.elements.password.value;
      
      const toastId = toast.loading('Đang xác thực tài khoản...');
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Đăng nhập thành công!', { id: toastId });
      } catch (err) {
        toast.error(err.message || 'Sai tài khoản hoặc mật khẩu!', { id: toastId });
      }
    };

    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-xl fade-in">
          
          {/* Tiêu đề hệ thống */}
          <div className="text-center mb-6">
            <h2 className="font-black text-xl text-slate-800 tracking-tight uppercase">
              Hệ thống <span className="text-blue-600">Đốc Thu</span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-black tracking-wider">
              Vui lòng đăng nhập để tiếp tục việc điều phối
            </p>
          </div>

          {/* Form đăng nhập */}
          <form onSubmit={handleInlineLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 tracking-wide">
                Tài khoản (Email)
              </label>
              <input 
                name="email" 
                type="email" 
                required 
                placeholder="nhanvien@company.com" 
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold text-slate-700"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 tracking-wide">
                Mật khẩu
              </label>
              <input 
                name="password" 
                type="password" 
                required 
                placeholder="••••••••" 
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold text-slate-700"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-sm shadow-md active:scale-95 transition-all mt-2 uppercase tracking-wider"
            >
              Đăng Nhập
            </button>
          </form>

        </div>
      </div>
    );
  }

  // BIẾN GỘP: Kiểm tra xem user có ít nhất 1 quyền nào không?
  const hasAnyPermission = canPhanCong || canNhanViec || canDieuHanh || canThongKe;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto pb-28 w-full h-full relative">
        
        {/* NẾU TÀI KHOẢN TRẮNG QUYỀN -> HIỆN MÀN HÌNH CHẶN VÀ NÚT THOÁT */}
        {!hasAnyPermission && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center fade-in">
            <i className="fa-solid fa-lock text-6xl text-slate-300 mb-4"></i>
            <h2 className="text-xl font-black text-slate-700 mb-2 uppercase">CHƯA ĐƯỢC CẤP QUYỀN</h2>
            <p className="text-sm text-slate-500 mb-8">
              Tài khoản này chưa được gán vào bất kỳ phân hệ nào. Vui lòng liên hệ Quản trị viên để thiết lập quyền truy cập.
            </p>
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold py-3 px-8 rounded-xl shadow-sm active:scale-95 transition-all flex items-center"
            >
              <i className="fa-solid fa-arrow-right-from-bracket mr-2"></i> THOÁT TÀI KHOẢN NÀY
            </button>
          </div>
        )}

        {/* Chỉ truyền Component khi có quyền, tránh render trộm */}
        {activeTab === 'phancong' && canPhanCong && <PhanCongDashboard session={session} profile={profile} />}
        {activeTab === 'nhanviec' && canNhanViec && <GiaoDienTho session={session} profile={profile} />}
        {activeTab === 'danhsach' && canDieuHanh && <QuanLyDanhSach session={session} profile={profile} />}
        {activeTab === 'thongke' && canThongKe && <ThongKeDashboard session={session} profile={profile} />}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-x border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-[60] rounded-t-xl fade-in">
        <div className="flex justify-around items-center h-16">
          
          {canPhanCong && (
            <button onClick={() => setActiveTab('phancong')} className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'phancong' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className={`text-xl mb-1 ${activeTab === 'phancong' ? 'fa-solid fa-users-gear' : 'fa-solid fa-users'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Phân Công</span>
            </button>
          )}
          
          {canNhanViec && (
            <button onClick={() => setActiveTab('nhanviec')} className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'nhanviec' ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className={`text-xl mb-1 ${activeTab === 'nhanviec' ? 'fa-solid fa-screwdriver-wrench' : 'fa-solid fa-wrench'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Nhận Việc</span>
            </button>
          )}
          
          {canDieuHanh && (
            <button onClick={() => setActiveTab('danhsach')} className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'danhsach' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className={`text-xl mb-1 ${activeTab === 'danhsach' ? 'fa-solid fa-clipboard-list' : 'fa-solid fa-list'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Điều Hành</span>
            </button>
          )}
          
          {canThongKe && (
            <button onClick={() => setActiveTab('thongke')} className={`flex flex-col items-center justify-center w-full h-full transition-colors ${activeTab === 'thongke' ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}>
              <i className={`text-xl mb-1 ${activeTab === 'thongke' ? 'fa-solid fa-chart-pie' : 'fa-solid fa-chart-simple'}`}></i>
              <span className="text-[10px] font-bold uppercase tracking-wide">Thống Kê</span>
            </button>
          )}

        </div>
      </div>
      
      <Toaster position="top-center" reverseOrder={false} />
    </div>
  );
}

export default App;
