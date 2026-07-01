import { useState, useEffect } from 'react';
import QuanLyDanhSach from './components/QuanLyDanhSach';
import ThongKeDashboard from './components/ThongKeDashboard';
import PhanCongDashboard from './components/PhanCongDashboard';
import GiaoDienTho from './components/GiaoDienTho';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabase';
import Auth from './components/Auth';

function App() {
  const [activeTab, setActiveTab] = useState('danhsach'); 
  const [session, setSession] = useState(null);
  
  // BIẾN MỚI: Tải Profile để lấy quyền ngay từ lúc khởi động app
  const [profile, setProfile] = useState(null);
  const [isProfileLoaded, setIsProfileLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setIsProfileLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setIsProfileLoaded(true); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    setProfile(data);
    setIsProfileLoaded(true);
  };

  // LOGIC ĐIỀU HƯỚNG TỰ ĐỘNG: Đá user về đúng màn hình họ có quyền
  useEffect(() => {
    if (isProfileLoaded && profile && profile.role !== 'admin') {
      const access = profile.tabs_access || [];
      let isAllowed = false;
      
      if (activeTab === 'phancong' && access.includes('app_phan_cong')) isAllowed = true;
      if (activeTab === 'nhanviec' && access.includes('app_nhan_viec')) isAllowed = true;
      if (activeTab === 'danhsach' && access.includes('app_dieu_hanh')) isAllowed = true;
      if (activeTab === 'thongke' && access.includes('app_thong_ke')) isAllowed = true;

      // Nếu đang đứng ở Tab không có quyền -> Tự động chuyển qua Tab hợp lệ đầu tiên
      if (!isAllowed && access.length > 0) {
        if (access.includes('app_nhan_viec')) setActiveTab('nhanviec');
        else if (access.includes('app_dieu_hanh')) setActiveTab('danhsach');
        else if (access.includes('app_phan_cong')) setActiveTab('phancong');
        else if (access.includes('app_thong_ke')) setActiveTab('thongke');
      }
    }
  }, [profile, isProfileLoaded, activeTab]);

  // KIỂM TRA QUYỀN ĐỂ ẨN/HIỆN NÚT BẤM DƯỚI ĐÁY MÀN HÌNH
  const isAdmin = profile?.role === 'admin';
  const access = profile?.tabs_access || [];
  
  const canPhanCong = isAdmin || access.includes('app_phan_cong');
  const canNhanViec = isAdmin || access.includes('app_nhan_viec');
  const canDieuHanh = isAdmin || access.includes('app_dieu_hanh');
  const canThongKe = isAdmin || access.includes('app_thong_ke');

  // CHỐT CHẶN BẢO MẬT & ĐIỀU HƯỚNG HIỂN THỊ
  if (!session) {
    // Nếu chưa đăng nhập (hoặc vừa bấm Đăng xuất), render ra Component Auth (Đăng nhập)
    // Lưu ý: Đảm bảo bạn đã có Component Auth (hoặc Login) trong thư mục components
    // Import nó ở đầu file: import Auth from './components/Auth'; (Nếu chưa có thì phải thêm nhé!)
    const Auth = require('./components/Auth').default; // Dùng require cho an toàn nếu bạn lỡ quên import ở trên cùng
    return <Auth />;
  }

  // Nếu đang loading thông tin Profile thì hiển thị màn hình chờ mượt mà
  if (!isProfileLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center text-blue-500">
           <i className="fa-solid fa-circle-notch animate-spin text-4xl mb-3"></i>
           <p className="font-bold text-xs animate-pulse">Đang rà soát quyền hạn...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto pb-28 w-full h-full relative">
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
